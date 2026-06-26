import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  const webhookSecret = Deno.env.get("CASHFREE_WEBHOOK_SECRET");
  let verified = false;
  if (webhookSecret && signature && timestamp) {
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", enc.encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(timestamp + rawBody));
      const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
      verified = computed === signature;
    } catch (e) {
      console.error("signature verify failed", e);
    }
  }

  let payload: any = {};
  try { payload = JSON.parse(rawBody); } catch { /* ignore */ }

  const eventType = payload?.type || "UNKNOWN";
  const cfOrderId = payload?.data?.order?.order_id || null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: evt } = await admin.from("cashfree_webhook_events").insert({
    event_type: eventType, cf_order_id: cfOrderId,
    signature_verified: verified, payload, processed: false,
  }).select("id").maybeSingle();

  if (!verified) {
    console.warn("Unverified webhook", eventType);
    return new Response(JSON.stringify({ ok: false, reason: "signature" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (eventType === "PAYMENT_SUCCESS_WEBHOOK" && cfOrderId) {
      const pay = payload?.data?.payment || {};
      // Find order
      const { data: order } = await admin.from("subscription_orders")
        .select("*").eq("cf_order_id", cfOrderId).maybeSingle();
      if (order) {
        await admin.from("subscription_orders").update({
          status: "PAID",
          cf_payment_id: String(pay.cf_payment_id || ""),
          payment_method: pay.payment_group || pay.payment_method || null,
          paid_at: new Date().toISOString(),
          raw_response: payload,
        }).eq("id", order.id);

        // Extend subscription
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
            status: "active", started_at: now.toISOString(),
            expires_at: expires.toISOString(), last_order_id: order.id,
          });
        }
      }
    } else if (eventType === "PAYMENT_FAILED_WEBHOOK" && cfOrderId) {
      await admin.from("subscription_orders").update({
        status: "FAILED", raw_response: payload,
      }).eq("cf_order_id", cfOrderId);
    } else if (eventType === "PAYMENT_USER_DROPPED_WEBHOOK" && cfOrderId) {
      await admin.from("subscription_orders").update({
        status: "DROPPED", raw_response: payload,
      }).eq("cf_order_id", cfOrderId);
    }

    if (evt?.id) {
      await admin.from("cashfree_webhook_events").update({ processed: true }).eq("id", evt.id);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("webhook processing error", e);
    if (evt?.id) {
      await admin.from("cashfree_webhook_events").update({
        error: String(e?.message || e),
      }).eq("id", evt.id);
    }
    return new Response(JSON.stringify({ ok: false }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
