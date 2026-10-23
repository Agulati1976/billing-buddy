import { corsHeaders, identity, membership, quota, requestJson, HttpError, json, failure } from "../_shared/security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await identity(req);
    const { partyId, businessId, invoiceIds } = await requestJson(req);
    await membership(ctx, businessId, "payments");
    if (typeof partyId !== "string" || (invoiceIds !== undefined && (!Array.isArray(invoiceIds) || invoiceIds.length > 500 || invoiceIds.some((id: unknown) => typeof id !== "string")))) throw new HttpError(400, "Invalid party or invoice selection");
    const { data: party, error: partyError } = await ctx.userClient.from("parties").select("id,name,email").eq("id", partyId).eq("business_id", businessId).maybeSingle();
    if (partyError) throw partyError;
    if (!party) throw new HttpError(404, "Customer not found in this business");
    await quota(ctx, businessId, "reminder");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const invoices: Array<{id: string; balance_amount: number}> = [];
    for (let offset = 0; ; offset += 500) {
      let query = ctx.userClient.from("invoices").select("id,balance_amount").eq("business_id", businessId).eq("party_id", partyId)
        .in("type", ["sale", "non_inventory"]).is("deleted_at", null).gt("balance_amount", 0).lt("due_date", today).order("id").range(offset, offset + 499);
      if (invoiceIds?.length) query = query.in("id", invoiceIds);
      const { data, error } = await query;
      if (error) throw error;
      invoices.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    if (!invoices.length) return json({ ok: true, skipped: true, reason: "no_overdue" });
    const totalOverdue = invoices.reduce((sum, invoice) => sum + Number(invoice.balance_amount), 0);
    const message = `Hello ${party.name},\n\nThis is a reminder for ${invoices.length} overdue invoice(s), with a total balance of ₹${totalOverdue.toFixed(2)}. Please arrange payment.\n\nThank you.`;
    // This endpoint records the request; it does not claim that an email was sent.
    const status = party.email ? "pending" : "skipped";
    const { error } = await ctx.admin.from("payment_reminders").insert({ business_id: businessId, party_id: party.id, invoice_ids: invoices.map(i => i.id),
      total_overdue: totalOverdue, recipient_email: party.email, status, channel: "email", message, created_by: ctx.user.id });
    if (error) throw error;
    return json({ ok: true, delivered: false, status, invoiceCount: invoices.length, totalOverdue,
      note: party.email ? "Reminder recorded; email delivery is pending." : "Customer has no email on file." });
  } catch (error) { return failure(error); }
});
