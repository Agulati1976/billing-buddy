import { corsHeaders, json, failure, identity, membership, HttpError } from "../_shared/security.ts";
import { credentials } from "../_shared/cashfree.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await identity(req);
    const body = await req.json();
    await membership(ctx, body.business_id, undefined, true);
    if (body.mode && body.mode !== "production") throw new HttpError(403, "Sandbox checkout is not available here");
    const cf = credentials("production");
    const { data: plan, error } = await ctx.admin.from("subscription_plans").select("*").eq("id", body.plan_id).eq("is_active", true).maybeSingle();
    if (error || !plan || Number(plan.price_inr) <= 0) throw new HttpError(400, "Select an available paid plan");
    const phone = String(body.customer_phone || "").replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) throw new HttpError(400, "A valid customer phone number is required");
    const orderId = "BL_" + crypto.randomUUID().replaceAll("-", "");
    const { error: insertError } = await ctx.admin.from("subscription_orders").insert({
      business_id: body.business_id, plan_id: plan.id, cf_order_id: orderId, order_amount: Number(plan.price_inr),
      order_currency: "INR", status: "CREATED", mode: "production", created_by: ctx.user.id,
    });
    if (insertError) throw insertError;
    const response = await fetch(cf.base + "/orders", { method: "POST", headers: cf.headers, body: JSON.stringify({
      order_id: orderId, order_amount: Number(plan.price_inr), order_currency: "INR",
      customer_details: { customer_id: body.business_id, customer_name: String(body.customer_name || "Bill Look User").slice(0,100), customer_email: ctx.user.email, customer_phone: phone },
      order_meta: { return_url: (Deno.env.get("APP_URL") || "https://billlook.com") + "/billing?order_id={order_id}", notify_url: Deno.env.get("SUPABASE_URL") + "/functions/v1/cashfree-webhook" },
    }) });
    const result = await response.json();
    if (!response.ok || !result.payment_session_id) throw new HttpError(502, "Payment checkout could not be created. Please retry.");
    const { error: saveError } = await ctx.admin.from("subscription_orders").update({ payment_session_id: result.payment_session_id, raw_response: result }).eq("cf_order_id", orderId);
    if (saveError) throw saveError;
    return json({ order_id: orderId, payment_session_id: result.payment_session_id, order_amount: result.order_amount, mode: "production" });
  } catch (error) { return failure(error); }
});
