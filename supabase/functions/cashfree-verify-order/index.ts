import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function cfBase(appId: string) {
  return appId.toUpperCase().startsWith("TEST")
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const { cf_order_id } = await req.json().catch(() => ({}));
    if (!cf_order_id) return json({ error: "cf_order_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: order } = await admin.from("subscription_orders")
      .select("*").eq("cf_order_id", cf_order_id).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);

    const appId = Deno.env.get("CASHFREE_APP_ID");
    const secretKey = Deno.env.get("CASHFREE_SECRET_KEY");
    const cfRes = await fetch(`${CF_BASE}/orders/${cf_order_id}`, {
      headers: {
        "x-api-version": "2023-08-01",
        "x-client-id": appId!, "x-client-secret": secretKey!,
      },
    });
    const cfData = await cfRes.json();
    if (!cfRes.ok) return json({ error: cfData.message || "Cashfree error" }, cfRes.status);

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
