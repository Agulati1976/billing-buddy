import { corsHeaders, json, failure, identity, platformAdmin, HttpError } from "../_shared/security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await identity(req);
    await platformAdmin(ctx);
    const { business_id, subject, body } = await req.json();
    if (!business_id || typeof subject !== "string" || !subject.trim() || typeof body !== "string" || !body.trim() || subject.length > 200 || body.length > 20000) throw new HttpError(400, "Business, subject and message are required");
    const { data: business } = await ctx.admin.from("businesses").select("owner_id,email").eq("id", business_id).maybeSingle();
    if (!business) throw new HttpError(404, "Business not found");
    const { data: owner } = await ctx.admin.auth.admin.getUserById(business.owner_id);
    const to = owner.user?.email || business.email;
    if (!to) throw new HttpError(400, "No recipient email is available");
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ ok: true, delivered: false, note: "Email delivery is not configured" });
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Bill Look <noreply@billlook.com>", to: [to], subject, text: body }) });
    if (!response.ok) throw new HttpError(502, "Email could not be delivered");
    const result = await response.json();
    return json({ ok: true, delivered: true, id: result.id });
  } catch (error) { return failure(error); }
});
