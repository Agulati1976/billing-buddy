import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SCHEMA = {
  type: "object",
  properties: {
    supplier_name: { type: "string", description: "Supplier / vendor / seller name from the bill" },
    supplier_gstin: { type: "string" },
    supplier_phone: { type: "string" },
    supplier_address: { type: "string" },
    invoice_number: { type: "string" },
    invoice_date: { type: "string", description: "Date in YYYY-MM-DD format" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          hsn_code: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          price: { type: "number", description: "Per unit purchase price (excluding tax if shown separately)" },
          tax_rate: { type: "number", description: "GST percent like 5, 12, 18, 28" },
          discount_pct: { type: "number" },
        },
        required: ["name", "quantity", "price"],
      },
    },
    subtotal: { type: "number" },
    tax_amount: { type: "number" },
    total_amount: { type: "number" },
  },
  required: ["items"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_base64, mime_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = `data:${mime_type || "image/jpeg"};base64,${image_base64}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You extract structured data from purchase invoices / bills. Read all line items carefully. Return numeric fields as numbers. If a field is missing, omit it. Always call the extract_purchase_invoice tool.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the supplier details and all line items (name, qty, unit price, tax %) from this purchase bill." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_purchase_invoice",
            description: "Return structured purchase invoice data",
            parameters: SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_purchase_invoice" } },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      const status = resp.status === 429 ? 429 : resp.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: `AI gateway: ${txt}` }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      return new Response(JSON.stringify({ error: "No structured output", raw: data }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = typeof args === "string" ? JSON.parse(args) : args;

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
