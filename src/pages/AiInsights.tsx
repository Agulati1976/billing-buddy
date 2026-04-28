import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, TrendingUp, Boxes, Receipt, ShieldAlert, Users,
  Loader2, RefreshCw,
} from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type Kind =
  | "sales_prediction" | "stock_suggestions" | "expense_categorization"
  | "fraud_detection" | "customer_behavior";

interface InsightDef {
  kind: Kind;
  title: string;
  desc: string;
  icon: any;
  tone: string;
}

const INSIGHTS: InsightDef[] = [
  { kind: "sales_prediction", title: "Sales Prediction",
    desc: "30-day sales forecast with confidence band & key drivers.",
    icon: TrendingUp, tone: "bg-primary-soft text-primary" },
  { kind: "stock_suggestions", title: "Smart Stock Suggestions",
    desc: "Reorder recommendations based on velocity vs current stock.",
    icon: Boxes, tone: "bg-success-soft text-success" },
  { kind: "expense_categorization", title: "Auto Expense Categorization",
    desc: "Cleans up your expense categories into a tidy chart of accounts.",
    icon: Receipt, tone: "bg-warning-soft text-warning" },
  { kind: "fraud_detection", title: "Fraud Detection Alerts",
    desc: "Flags unusual invoices, payments, discounts and cash spikes.",
    icon: ShieldAlert, tone: "bg-danger-soft text-danger" },
  { kind: "customer_behavior", title: "Customer Behavior Analysis",
    desc: "Segments customers (Champions, Loyal, At-risk, Dormant) with actions.",
    icon: Users, tone: "bg-primary-soft text-primary" },
];

export default function AiInsights() {
  const { current } = useBusiness();
  const [results, setResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const run = async (kind: Kind) => {
    if (!current) { toast.error("No business selected"); return; }
    setLoading((s) => ({ ...s, [kind]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: { kind, businessId: current.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults((s) => ({ ...s, [kind]: data.content || "_No response._" }));
    } catch (e: any) {
      const msg = e?.message ?? "Failed to generate insight";
      if (msg.includes("Rate limit")) toast.error("Rate limit reached. Try again in a minute.");
      else if (msg.includes("credits")) toast.error("AI credits exhausted. Add credits in Workspace settings.");
      else toast.error(msg);
    } finally {
      setLoading((s) => ({ ...s, [kind]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            On-demand intelligence about your business. Click "Generate" on any card.
          </p>
        </div>
        
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {INSIGHTS.map((i) => {
          const Icon = i.icon;
          const out = results[i.kind];
          const busy = !!loading[i.kind];
          return (
            <Card key={i.kind} className="p-5 flex flex-col">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${i.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{i.title}</div>
                  <div className="text-sm text-muted-foreground">{i.desc}</div>
                </div>
                <Button size="sm" onClick={() => run(i.kind)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                       : out ? <RefreshCw className="h-4 w-4" />
                       : <Sparkles className="h-4 w-4" />}
                  {busy ? "Thinking…" : out ? "Refresh" : "Generate"}
                </Button>
              </div>
              {out && (
                <div className="mt-4 border-t pt-4 prose prose-sm dark:prose-invert max-w-none
                                prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1
                                prose-table:text-xs">
                  <ReactMarkdown>{out}</ReactMarkdown>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        AI uses only the data inside this business. Insights are guidance — review before acting.
      </p>
    </div>
  );
}
