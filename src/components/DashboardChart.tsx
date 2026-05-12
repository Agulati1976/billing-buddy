import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BarChart3, LineChart as LineIcon, AreaChart as AreaIcon } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { formatINR } from "@/lib/states";
import { DateRangeFilter, rangeFor, type DatePreset } from "@/components/DateRangeFilter";
import { startOfDay, subDays } from "date-fns";

type ChartKind = "bar" | "line" | "area";

interface Point {
  bucket: string;
  label: string;
  Sales: number;
  Purchases: number;
  Expenses: number;
  Profit: number;
}

const chartConfig: ChartConfig = {
  Sales:     { label: "Sales",     color: "hsl(var(--primary))" },
  Purchases: { label: "Purchases", color: "hsl(var(--warning))" },
  Expenses:  { label: "Expenses",  color: "hsl(var(--danger))" },
  Profit:    { label: "Profit",    color: "hsl(var(--success))" },
};

const SERIES_KEYS = ["Sales", "Purchases", "Expenses", "Profit"] as const;

export function DashboardChart() {
  const { current } = useBusiness();
  const [kind, setKind] = useState<ChartKind>("bar");
  const [preset, setPreset] = useState<DatePreset>("last_30");
  const [customFrom, setCustomFrom] = useState<Date>(startOfDay(subDays(new Date(), 29)));
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const [active, setActive] = useState<Set<string>>(new Set(["Sales", "Purchases", "Expenses"]));
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoading(true);

      // Resolve effective range (fallback for "all time" → last 12 months)
      const to = range.to ?? new Date();
      const from = range.from ?? startOfDay(subDays(to, 364));
      const spanDays = Math.max(1, Math.round((+to - +from) / 86400000) + 1);
      const useMonthly = spanDays > 120;

      const sinceStr = from.toISOString().slice(0, 10);
      const untilStr = to.toISOString().slice(0, 10);

      const [invR, expR] = await Promise.all([
        supabase.from("invoices")
          .select("invoice_date, type, total_amount")
          .eq("business_id", current.id)
          .in("type", ["sale", "purchase"])
          .is("deleted_at", null)
          .gte("invoice_date", sinceStr)
          .lte("invoice_date", untilStr),
        supabase.from("expenses")
          .select("expense_date, amount")
          .eq("business_id", current.id)
          .gte("expense_date", sinceStr)
          .lte("expense_date", untilStr),
      ]);

      const buckets: Point[] = [];
      const bucketIdx = new Map<string, number>();
      if (useMonthly) {
        const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
        const endCursor = new Date(to.getFullYear(), to.getMonth(), 1);
        while (cursor <= endCursor) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          const label = cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
          bucketIdx.set(key, buckets.length);
          buckets.push({ bucket: key, label, Sales: 0, Purchases: 0, Expenses: 0, Profit: 0 });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        const cursor = new Date(from);
        for (let i = 0; i < spanDays; i++) {
          const key = cursor.toISOString().slice(0, 10);
          const label = cursor.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          bucketIdx.set(key, buckets.length);
          buckets.push({ bucket: key, label, Sales: 0, Purchases: 0, Expenses: 0, Profit: 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      const keyFor = (iso: string) => useMonthly ? iso.slice(0, 7) : iso.slice(0, 10);

      ((invR.data as any[]) ?? []).forEach((r) => {
        const k = keyFor(r.invoice_date);
        const idx = bucketIdx.get(k);
        if (idx == null) return;
        const amt = Number(r.total_amount) || 0;
        if (r.type === "sale") buckets[idx].Sales += amt;
        else if (r.type === "purchase") buckets[idx].Purchases += amt;
      });
      ((expR.data as any[]) ?? []).forEach((r) => {
        const k = keyFor(r.expense_date);
        const idx = bucketIdx.get(k);
        if (idx == null) return;
        buckets[idx].Expenses += Number(r.amount) || 0;
      });
      buckets.forEach((b) => { b.Profit = b.Sales - b.Purchases - b.Expenses; });

      setData(buckets);
      setLoading(false);
    })();
  }, [current?.id, range.from, range.to]);

  const totals = useMemo(() => {
    return data.reduce(
      (acc, p) => ({
        Sales: acc.Sales + p.Sales,
        Purchases: acc.Purchases + p.Purchases,
        Expenses: acc.Expenses + p.Expenses,
        Profit: acc.Profit + p.Profit,
      }),
      { Sales: 0, Purchases: 0, Expenses: 0, Profit: 0 }
    );
  }, [data]);

  const toggleSeries = (k: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      if (next.size === 0) next.add(k);
      return next;
    });
  };

  const renderChart = () => {
    const common = { data, margin: { top: 10, right: 12, left: 0, bottom: 0 } };
    const axis = (
      <>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : String(v)}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v: any) => formatINR(Number(v))} />} />
      </>
    );

    if (kind === "line") {
      return (
        <LineChart {...common}>
          {axis}
          {SERIES_KEYS.filter((k) => active.has(k)).map((k) => (
            <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      );
    }
    if (kind === "area") {
      return (
        <AreaChart {...common}>
          <defs>
            {SERIES_KEYS.map((k) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.4} />
                <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          {axis}
          {SERIES_KEYS.filter((k) => active.has(k)).map((k) => (
            <Area key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} strokeWidth={2}
              fill={`url(#grad-${k})`} />
          ))}
        </AreaChart>
      );
    }
    return (
      <BarChart {...common}>
        {axis}
        {SERIES_KEYS.filter((k) => active.has(k)).map((k) => (
          <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    );
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold">Business Overview</h2>
          <p className="text-xs text-muted-foreground">Sales, purchases, expenses & profit over time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
          <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as ChartKind)} size="sm">
            <ToggleGroupItem value="bar" aria-label="Bar chart"><BarChart3 className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="line" aria-label="Line chart"><LineIcon className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="area" aria-label="Area chart"><AreaIcon className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {SERIES_KEYS.map((k) => {
          const isOn = active.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleSeries(k)}
              className={`group flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
                isOn ? "bg-muted border-border" : "opacity-50 hover:opacity-80"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: `var(--color-${k})` }}
              />
              <span className="font-medium">{k}</span>
              <span className="num text-muted-foreground">{formatINR(totals[k])}</span>
            </button>
          );
        })}
      </div>

      <ChartContainer config={chartConfig} className="h-[300px] w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : data.every((d) => d.Sales === 0 && d.Purchases === 0 && d.Expenses === 0) ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No data in this range yet.
          </div>
        ) : (
          <ResponsiveContainer>{renderChart()}</ResponsiveContainer>
        )}
      </ChartContainer>
    </Card>
  );
}
