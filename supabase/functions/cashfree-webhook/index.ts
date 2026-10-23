import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.0";
import { corsHeaders, json, failure, HttpError } from "../_shared/security.ts";
import { credentials } from "../_shared/cashfree.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const raw = await req.text();
    if (raw.length > 1_000_000) throw new HttpError(413, "Payload too large");
    const secret = Deno.env.get("CASHFREE_WEBHOOK_SECRET") || Deno.env.get("CASHFREE_SECRET_KEY");
    const signature = req.headers.get("x-webhook-signature");
    const timestamp = req.headers.get("x-webhook-timestamp");
    if (!secret || !signature || !timestamp) throw new HttpError(401, "Invalid signature");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    let verified = false;
    try {
      verified = await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)), encoder.encode(timestamp + raw));
    } catch { /* Malformed signatures must not persist attacker input. */ }
    if (!verified) throw new HttpError(401, "Invalid signature");
    const payload = JSON.parse(raw);
    const order = payload?.data?.order;
    const payment = payload?.data?.payment;
    const types: Record<string, string> = { PAYMENT_SUCCESS_WEBHOOK: "PAID", PAYMENT_FAILED_WEBHOOK: "FAILED", PAYMENT_USER_DROPPED_WEBHOOK: "DROPPED" };
    if (!types[payload.type]) return json({ ok: true, ignored: true });
    if (!order?.order_id || !payment?.cf_payment_id) throw new HttpError(400, "Missing payment identity");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    if(types[payload.type]==="PAID"){
      if(payment.payment_status!=="SUCCESS")throw new HttpError(400,"Payment is not successful");
      const {data:stored,error:orderError}=await admin.from("subscription_orders").select("mode").eq("cf_order_id",order.order_id).maybeSingle();
      if(orderError || !stored)throw new HttpError(404,"Order not found");
      if(stored.mode!=="production")return json({ok:true,sandbox:true,activated:false});
      const cf=credentials(stored.mode);
      const response=await fetch(cf.base+"/orders/"+encodeURIComponent(order.order_id),{headers:cf.headers});
      if(!response.ok)throw new HttpError(502,"Payment provider verification unavailable");
      const verifiedOrder=await response.json();
      if(verifiedOrder.order_status!=="PAID")throw new HttpError(503,"The payment order is still processing");
      if(Number(verifiedOrder.order_amount)!==Number(order.order_amount) || verifiedOrder.order_currency!==order.order_currency)throw new HttpError(409,"Order amount or currency mismatch");
    }
    const { data, error } = await admin.rpc("process_subscription_payment", {
      p_order_id: order.order_id, p_payment_id: String(payment.cf_payment_id), p_status: types[payload.type],
      p_amount: Number(order.order_amount), p_currency: order.order_currency,
      p_method: typeof payment.payment_group === "string" ? payment.payment_group : null, p_payload: payload,
    });
    if (error) throw error;
    return json({ ok: true, result: data });
  } catch (error) { return failure(error); }
});
