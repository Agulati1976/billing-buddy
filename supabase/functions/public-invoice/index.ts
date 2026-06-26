// Public invoice viewer endpoint — anyone with the invoice UUID can fetch read-only data.
// UUIDs are unguessable; this is the same pattern Stripe-style share links use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing id" }, 400);

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
      supabase.from("invoice_items").select("*").eq("invoice_id", id),
      supabase.from("businesses").select("name, gstin, phone, email, address_line1, address_line2, city, state, state_code, pincode, logo_url").eq("id", invoice.business_id).maybeSingle(),
      invoice.party_id
        ? supabase.from("parties").select("name, gstin, phone, email, billing_address, shipping_address, state, state_code").eq("id", invoice.party_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("invoice_settings").select("*").eq("business_id", invoice.business_id).maybeSingle(),
    ]);

    return json({ invoice, items: items ?? [], business, party, settings });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
