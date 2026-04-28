// AI Insights — single function, multiple "kinds":
//   sales_prediction | stock_suggestions | expense_categorization
//   fraud_detection  | customer_behavior
//
// Uses Lovable AI Gateway (LOVABLE_API_KEY).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3-flash-preview";

type Kind =
  | "sales_prediction"
  | "stock_suggestions"
  | "expense_categorization"
  | "fraud_detection"
  | "customer_behavior";

interface Body { kind: Kind; businessId: string; }

const PROMPTS: Record<Kind, { system: string; instruction: (ctx: string) => string }> = {
  sales_prediction: {
    system:
      "You are a senior retail analyst for an Indian SMB. Use only the data provided. Be specific, use ₹, and never invent numbers.",
    instruction: (ctx) =>
      `Forecast the next 30 days of sales based on the historical data below. ` +
      `Respond as compact markdown with these sections:\n` +
      `**Forecast** (single ₹ figure with a confidence band), **Trend** (1 line), ` +
      `**Key drivers** (3 bullets), **Recommended actions** (3 bullets).\n\n${ctx}`,
  },
  stock_suggestions: {
    system:
      "You are an inventory planner. Recommend reorders based on velocity and current stock. Be concise and prescriptive.",
    instruction: (ctx) =>
      `Review the items below and recommend reorder actions. Output a markdown table with columns: ` +
      `Item | Current | 30-day Sold | Suggested Reorder Qty | Priority (High/Med/Low) | Reason.\n` +
      `After the table, add 2 bullets of overall advice.\n\n${ctx}`,
  },
  expense_categorization: {
    system:
      "You categorize Indian SMB expenses into a clean chart of accounts.",
    instruction: (ctx) =>
      `Group these expenses into clean categories (e.g. Rent, Utilities, Travel, Marketing, ` +
      `Office Supplies, Salaries, Professional Fees, Other). Output a markdown table: ` +
      `Original Category | Suggested Category | Examples | Total ₹.\n` +
      `End with a 1-line summary of where money is going.\n\n${ctx}`,
  },
  fraud_detection: {
    system:
      "You are a forensic accountant. Flag anomalies, never accuse — phrase as 'worth reviewing'.",
    instruction: (ctx) =>
      `Inspect the recent invoices, payments and expenses below. List anomalies that a human ` +
      `should review (duplicate amounts, round-number outliers, late-night entries, unusually ` +
      `large discounts, cash spikes, missing references). For each finding output: ` +
      `**Severity** (High/Med/Low), **Finding**, **Why it stands out**, **Suggested check**. ` +
      `If nothing notable, say so plainly.\n\n${ctx}`,
  },
  customer_behavior: {
    system:
      "You analyse customer purchasing behaviour for a small business owner.",
    instruction: (ctx) =>
      `Segment the customers below into: Champions, Loyal, At-risk, New, Dormant. ` +
      `Output a markdown table: Segment | Customers (names) | Why | Suggested action. ` +
      `End with the single most valuable customer and the single most at-risk customer.\n\n${ctx}`,
  },
};

async function buildContext(supabase: any, businessId: string, kind: Kind): Promise<string> {
  const today = new Date();
  const since = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  if (kind === "sales_prediction") {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_date,total_amount,type")
      .eq("business_id", businessId)
      .eq("type", "sale")
      .gte("invoice_date", since)
      .order("invoice_date", { ascending: true });
    const byDay = new Map<string, number>();
    (data ?? []).forEach((r: any) => {
      byDay.set(r.invoice_date, (byDay.get(r.invoice_date) ?? 0) + Number(r.total_amount || 0));
    });
    const lines = Array.from(byDay.entries())
      .map(([d, t]) => `${d}: ₹${t.toFixed(0)}`)
      .join("\n");
    return `Daily sales (last 90 days):\n${lines || "No sales data."}`;
  }

  if (kind === "stock_suggestions") {
    const { data: items } = await supabase
      .from("items")
      .select("id,name,unit,current_stock,low_stock_alert,sale_price")
      .eq("business_id", businessId)
      .eq("type", "product");
    const ids = (items ?? []).map((i: any) => i.id);
    const sold = new Map<string, number>();
    if (ids.length) {
      const { data: sales } = await supabase
        .from("invoice_items")
        .select("item_id,quantity,invoices!inner(business_id,type,invoice_date)")
        .in("item_id", ids)
        .gte("invoices.invoice_date", since)
        .eq("invoices.type", "sale")
        .eq("invoices.business_id", businessId);
      (sales ?? []).forEach((r: any) => {
        sold.set(r.item_id, (sold.get(r.item_id) ?? 0) + Number(r.quantity || 0));
      });
    }
    const lines = (items ?? [])
      .map((i: any) =>
        `- ${i.name} | stock: ${i.current_stock} ${i.unit} | low-alert: ${i.low_stock_alert} | sold last 90d: ${sold.get(i.id) ?? 0}`,
      )
      .join("\n");
    return `Items:\n${lines || "No products."}`;
  }

  if (kind === "expense_categorization") {
    const { data } = await supabase
      .from("expenses")
      .select("category,amount,description,expense_date")
      .eq("business_id", businessId)
      .gte("expense_date", since);
    const lines = (data ?? [])
      .map((e: any) => `- ${e.expense_date} | ${e.category} | ₹${Number(e.amount).toFixed(0)} | ${e.description ?? ""}`)
      .join("\n");
    return `Expenses (last 90 days):\n${lines || "No expenses."}`;
  }

  if (kind === "fraud_detection") {
    const [inv, pay, exp] = await Promise.all([
      supabase.from("invoices").select("invoice_number,invoice_date,total_amount,discount_amount,extra_discount,status,party_id,created_at")
        .eq("business_id", businessId).gte("invoice_date", since).order("created_at", { ascending: false }).limit(80),
      supabase.from("payments").select("amount,method,direction,payment_date,reference,created_at,invoice_id")
        .eq("business_id", businessId).gte("payment_date", since).order("created_at", { ascending: false }).limit(80),
      supabase.from("expenses").select("category,amount,description,expense_date,method,created_at")
        .eq("business_id", businessId).gte("expense_date", since).order("created_at", { ascending: false }).limit(60),
    ]);
    return [
      `Invoices:\n${(inv.data ?? []).map((r: any) => `- ${r.invoice_number} ${r.invoice_date} ₹${r.total_amount} disc:${r.discount_amount}+${r.extra_discount} ${r.status} party:${r.party_id ?? "-"} entered:${r.created_at}`).join("\n")}`,
      `Payments:\n${(pay.data ?? []).map((r: any) => `- ${r.payment_date} ${r.direction} ${r.method} ₹${r.amount} ref:${r.reference ?? "-"} entered:${r.created_at}`).join("\n")}`,
      `Expenses:\n${(exp.data ?? []).map((r: any) => `- ${r.expense_date} ${r.category} ₹${r.amount} ${r.method} ${r.description ?? ""} entered:${r.created_at}`).join("\n")}`,
    ].join("\n\n");
  }

  if (kind === "customer_behavior") {
    const { data: parties } = await supabase
      .from("parties").select("id,name,type,created_at")
      .eq("business_id", businessId).eq("type", "customer");
    const ids = (parties ?? []).map((p: any) => p.id);
    const stats = new Map<string, { count: number; total: number; last: string | null }>();
    if (ids.length) {
      const { data: invs } = await supabase
        .from("invoices").select("party_id,total_amount,invoice_date")
        .eq("business_id", businessId).eq("type", "sale").in("party_id", ids);
      (invs ?? []).forEach((r: any) => {
        const s = stats.get(r.party_id) ?? { count: 0, total: 0, last: null };
        s.count++; s.total += Number(r.total_amount || 0);
        if (!s.last || r.invoice_date > s.last) s.last = r.invoice_date;
        stats.set(r.party_id, s);
      });
    }
    const lines = (parties ?? [])
      .map((p: any) => {
        const s = stats.get(p.id) ?? { count: 0, total: 0, last: null };
        return `- ${p.name} | orders: ${s.count} | spent: ₹${s.total.toFixed(0)} | last: ${s.last ?? "never"} | added: ${p.created_at?.slice(0, 10)}`;
      })
      .join("\n");
    return `Customers:\n${lines || "No customers."}`;
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { kind, businessId } = (await req.json()) as Body;
    if (!kind || !businessId || !PROMPTS[kind]) {
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership using user's RLS-scoped client
    const { data: membership } = await userClient
      .from("user_roles").select("role").eq("business_id", businessId).limit(1);
    if (!membership || membership.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = await buildContext(supabaseAdmin, businessId, kind);
    const cfg = PROMPTS[kind];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: cfg.system },
          { role: "user", content: cfg.instruction(ctx) },
        ],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please try again in a minute." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ ok: true, kind, content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
