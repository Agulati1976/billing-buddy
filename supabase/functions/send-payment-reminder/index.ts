// Send Payment Reminder
// Currently logs the reminder to `payment_reminders` and returns success.
// When an email domain is configured, it will also dispatch via send-transactional-email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  partyId: string;
  businessId: string;
  invoiceIds?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
        Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body.partyId || !body.businessId) {
      return new Response(JSON.stringify({ error: "Missing partyId or businessId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch party
    const { data: party, error: partyErr } = await supabase
      .from("parties")
      .select("id, name, email, business_id")
      .eq("id", body.partyId)
      .maybeSingle();
    if (partyErr) throw partyErr;
    if (!party) {
      return new Response(JSON.stringify({ error: "Party not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch overdue invoices
    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, balance_amount")
      .eq("business_id", body.businessId)
      .eq("party_id", body.partyId)
      .gt("balance_amount", 0)
      .lt("due_date", today);
    if (body.invoiceIds?.length) q = q.in("id", body.invoiceIds);
    const { data: invoices, error: invErr } = await q;
    if (invErr) throw invErr;

    const totalOverdue =
      invoices?.reduce((s, i) => s + Number(i.balance_amount || 0), 0) ?? 0;
    const ids = (invoices ?? []).map((i) => i.id);

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "no_overdue" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const message =
      `Hello ${party.name},\n\nThis is a friendly reminder regarding ${ids.length} overdue invoice(s) ` +
      `with a total outstanding balance of ₹${totalOverdue.toFixed(2)}. ` +
      `Please arrange payment at your earliest convenience.\n\nThank you.`;

    // Log the reminder. Email dispatch will be wired up once an email domain is configured.
    const status = party.email ? "pending" : "skipped";
    const { error: logErr } = await supabase.from("payment_reminders").insert({
      business_id: body.businessId,
      party_id: party.id,
      invoice_ids: ids,
      total_overdue: totalOverdue,
      recipient_email: party.email,
      status,
      channel: "email",
      message,
      created_by: userRes.user.id,
    });
    if (logErr) throw logErr;

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        invoiceCount: ids.length,
        totalOverdue,
        recipient: party.email,
        note:
          status === "skipped"
            ? "Customer has no email on file."
            : "Reminder logged. Email delivery activates once an email domain is configured.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-payment-reminder error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
