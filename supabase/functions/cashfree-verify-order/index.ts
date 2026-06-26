import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function cfBase(mode: "test" | "production", appId: string) {
  if (mode === "test") return "https://sandbox.cashfree.com/pg";
  return appId.toUpperCase().startsWith("TEST")
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}
function getCreds(mode: "test" | "production") {
  if (mode === "test") {
    return {
      appId: env("CASHFREE_TEST_APP_ID") || env("CASHFREE_APP_ID"),
      secret: env("CASHFREE_TEST_SECRET_KEY") || env("CASHFREE_SECRET_KEY"),
    };
  }
  return { appId: env("CASHFREE_APP_ID"), secret: env("CASHFREE_SECRET_KEY") };
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function safeCredentialMeta(mode: "test" | "production", appId: string, secretKey: string) {
  const normalizedAppId = appId.trim();
  return {
    mode,
    endpoint: cfBase(mode, normalizedAppId),
    app_id_prefix: normalizedAppId.slice(0, 4),
    app_id_suffix: normalizedAppId.slice(-4),
    app_id_length: normalizedAppId.length,
    secret_length: secretKey.trim().length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const { cf_order_id } = await req.json().catch(() => ({}));
    if (!cf_order_id) return json({ error: "cf_order_id required" }, 400);

    const admin = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const { data: order } = await admin.from("subscription_orders")
      .select("*").eq("cf_order_id", cf_order_id).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);

    const mode: "test" | "production" = (order as any).mode === "test" ? "test" : "production";
    const { appId, secret: secretKey } = getCreds(mode);
    if (!appId || !secretKey) return json({ error: `Cashfree ${mode} keys not configured` }, 500);

    const cfRes = await fetch(`${cfBase(mode, appId)}/orders/${cf_order_id}`, {
      headers: {
        "x-api-version": "2023-08-01",
        "x-client-id": appId, "x-client-secret": secretKey,
      },
    });
    const cfData = await cfRes.json();
    if (!cfRes.ok) {
      console.error("Cashfree verify order failed", {
        status: cfRes.status,
        cashfree: cfData,
        credentials: safeCredentialMeta(mode, appId, secretKey),
      });
      return json({
        error: cfData.message || "Cashfree error",
        details: cfData,
        hint: cfRes.status === 401
          ? `Cashfree rejected the ${mode} credentials.`
          : undefined,
      }, cfRes.status);
    }

    // If paid and our record isn't updated, update it (idempotent fallback for webhook)
    if (cfData.order_status === "PAID" && order.status !== "PAID") {
      await admin.from("subscription_orders").update({
        status: "PAID", paid_at: new Date().toISOString(), raw_response: cfData,
      }).eq("id", order.id);

      const { data: plan } = await admin.from("subscription_plans")
        .select("duration_days").eq("id", order.plan_id).maybeSingle();
      const days = plan?.duration_days || 30;
      const { data: existing } = await admin.from("business_subscriptions")
        .select("*").eq("business_id", order.business_id).maybeSingle();
      const now = new Date();
      const base = existing?.expires_at && new Date(existing.expires_at) > now
        ? new Date(existing.expires_at) : now;
      const expires = new Date(base.getTime() + days * 86400000);
      if (existing) {
        await admin.from("business_subscriptions").update({
          plan_id: order.plan_id, status: "active",
          expires_at: expires.toISOString(), last_order_id: order.id,
        }).eq("business_id", order.business_id);
      } else {
        await admin.from("business_subscriptions").insert({
          business_id: order.business_id, plan_id: order.plan_id,
          status: "active", expires_at: expires.toISOString(), last_order_id: order.id,
        });
      }
    }

    return json({ status: cfData.order_status, order_amount: cfData.order_amount });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
