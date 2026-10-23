import { requestJson } from "../_shared/security.ts";
import { allRows } from "../_shared/pagination.ts";
// Public invoice viewer endpoint — anyone with the invoice UUID can fetch read-only data.
// UUIDs are unguessable; this is the same pattern Stripe-style share links use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!["GET","POST"].includes(req.method)) return json({error:"Method not allowed"},405);
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");
    if (!id && req.method !== "GET") {
      try { const body = await requestJson(req); id = body?.id ?? null; } catch { /* ignore */ }
    }
    if (typeof id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "A valid invoice ID is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !invoice) return json({ error: "Not found" }, 404);

    const [{ data: items }, { data: business }, { data: party }, { data: settings }] = await Promise.all([
      allRows(supabase.from("invoice_items").select("*").eq("invoice_id", id)),
      supabase.from("businesses").select("name, gstin, phone, email, address, state, state_code, pincode, logo_url").eq("id", invoice.business_id).eq("status","active").is("deleted_at",null).maybeSingle(),
      invoice.party_id
        ? supabase.from("parties").select("name, gstin, phone, email, billing_address, shipping_address, state, state_code").eq("id", invoice.party_id).eq("business_id",invoice.business_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("invoice_settings").select("*").eq("business_id", invoice.business_id).maybeSingle(),
    ]);

    if(!business)return json({error:"Not found"},404);
    return json({ invoice, items: items ?? [], business, party, settings });
  } catch {
    return json({ error: "Invoice could not be loaded" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
