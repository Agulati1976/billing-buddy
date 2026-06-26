import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CF_API_VERSION = "2023-08-01";
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
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const { business_id, plan_id, customer_name, customer_email, customer_phone, return_url, mode: modeIn } = body;
    if (!business_id || !plan_id) return json({ error: "business_id and plan_id required" }, 400);
    const mode: "test" | "production" = modeIn === "test" ? "test" : "production";

    // Verify the user is a member of this business
    const { data: member } = await supabase.rpc("is_business_member", {
      _user_id: userId, _business_id: business_id,
    });
    if (!member) return json({ error: "Forbidden" }, 403);

    // Use service role to read plan + insert order
    const admin = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const { data: plan, error: planErr } = await admin
      .from("subscription_plans")
      .select("*").eq("id", plan_id).maybeSingle();
    if (planErr || !plan) return json({ error: "Plan not found" }, 404);
    if (Number(plan.price_inr) <= 0) return json({ error: "Free plan does not need payment" }, 400);

    const { appId, secret: secretKey } = getCreds(mode);
    if (!appId || !secretKey) return json({ error: `Cashfree ${mode} keys not configured` }, 500);

    const cfOrderId = `BL_${business_id.slice(0, 8)}_${Date.now()}`;
    const cfPayload = {
      order_id: cfOrderId,
      order_amount: Number(plan.price_inr),
      order_currency: "INR",
      customer_details: {
        customer_id: business_id,
        customer_name: customer_name || "Bill Look User",
        customer_email: customer_email || "noemail@billlook.com",
        customer_phone: customer_phone || "9999999999",
      },
      order_meta: {
        return_url: return_url || `https://billlook.com/billing?order_id={order_id}`,
        notify_url: `${env("SUPABASE_URL")}/functions/v1/cashfree-webhook`,
      },
      order_note: `${plan.name} plan subscription`,
      order_tags: { plan_code: plan.code, business_id },
    };

    const cfRes = await fetch(`${cfBase(mode, appId)}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CF_API_VERSION,
        "x-client-id": appId,
        "x-client-secret": secretKey,
      },
      body: JSON.stringify(cfPayload),
    });
    const cfData = await cfRes.json();
    if (!cfRes.ok) {
      console.error("Cashfree create order failed", {
        status: cfRes.status,
        cashfree: cfData,
        credentials: safeCredentialMeta(mode, appId, secretKey),
      });
      return json({
        error: cfData.message || "Cashfree error",
        details: cfData,
        hint: cfRes.status === 401
          ? `Cashfree rejected the ${mode} credentials. Re-copy ${mode === "test" ? "Sandbox/Test" : "Production"} App ID and Secret Key.`
          : undefined,
      }, cfRes.status);
    }

    await admin.from("subscription_orders").insert({
      business_id, plan_id,
      cf_order_id: cfOrderId,
      order_amount: Number(plan.price_inr),
      order_currency: "INR",
      status: "CREATED",
      payment_session_id: cfData.payment_session_id,
      raw_response: cfData,
      created_by: userId,
    });

    return json({
      order_id: cfOrderId,
      payment_session_id: cfData.payment_session_id,
      order_amount: cfData.order_amount,
    });
  } catch (e: any) {
    console.error("create-order error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
