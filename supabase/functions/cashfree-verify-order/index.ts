import { corsHeaders, json, failure, identity, membership, HttpError } from "../_shared/security.ts";
import { credentials } from "../_shared/cashfree.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await identity(req);
    const { cf_order_id } = await req.json();
    if (typeof cf_order_id !== "string" || cf_order_id.length > 100) throw new HttpError(400, "Order ID required");
    const { data: order, error } = await ctx.admin.from("subscription_orders").select("*").eq("cf_order_id", cf_order_id).maybeSingle();
    if (error || !order) throw new HttpError(404, "Order not found");
    await membership(ctx, order.business_id, undefined, true);
    const cf = credentials(order.mode);
    const response = await fetch(cf.base + "/orders/" + encodeURIComponent(cf_order_id), { headers: cf.headers });
    if (!response.ok) throw new HttpError(502, "Unable to verify payment with the provider");
    const paymentOrder = await response.json();
    if (paymentOrder.order_status === "PAID" && order.mode === "production") {
      const paymentResponse = await fetch(cf.base + "/orders/" + encodeURIComponent(cf_order_id) + "/payments", { headers: cf.headers });
      if (!paymentResponse.ok) throw new HttpError(502, "Unable to verify the payment transaction");
      const payments = await paymentResponse.json();
      const paid = Array.isArray(payments) ? payments.find((payment) => payment.payment_status === "SUCCESS") : null;
      if (!paid?.cf_payment_id) throw new HttpError(409, "Payment is still processing");
      const { error: activationError } = await ctx.admin.rpc("process_subscription_payment", {
        p_order_id: order.cf_order_id, p_payment_id: String(paid.cf_payment_id), p_status: "PAID",
        p_amount: Number(paymentOrder.order_amount), p_currency: paymentOrder.order_currency,
        p_method: typeof paid.payment_group === "string" ? paid.payment_group : null, p_payload: paymentOrder,
      });
      if (activationError) throw activationError;
    }
    return json({ status: paymentOrder.order_status, order_amount: paymentOrder.order_amount, sandbox: order.mode !== "production", activated: order.mode === "production" && paymentOrder.order_status === "PAID" });
  } catch (error) { return failure(error); }
});
