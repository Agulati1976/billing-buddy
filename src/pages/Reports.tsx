import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Receipt, Package, Wallet, FileText, CalendarIcon, Download } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/states";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { cn } from "@/lib/utils";

type Inv = {
  id: string; invoice_date: string; total_amount: number; tax_amount: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  subtotal: number; type: string; status: string; party_id: string | null;
  is_inter_state: boolean; party_state_code: string | null;
  paid_amount: number; balance_amount: number;
};
type Item = { invoice_id: string; item_name: string; quantity: number; total_amount: number; taxable_amount: number; tax_rate: number; };
type Exp = { category: string; amount: number; expense_date: string; };

const fmtDate = (d: Date) => format(d, "yyyy-MM-dd");

type Preset =
  | "today" | "yesterday"
  | "last_7" | "last_30" | "last_90"
  | "this_week" | "this_month" | "last_month"
  | "this_quarter" | "this_year" | "last_365"
  | "custom";

function rangeFor(preset: Preset, custom: { from: Date; to: Date }): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (preset) {
    case "today":        return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
    case "yesterday":    { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" }; }
    case "last_7":       return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), label: "Last 7 days" };
    case "last_30":      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), label: "Last 30 days" };
    case "last_90":      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now), label: "Last 90 days" };
    case "this_week":    return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }), label: "This week" };
    case "this_month":   return { from: startOfMonth(now), to: endOfMonth(now), label: "This month" };
    case "last_month":   { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm), label: "Last month" }; }
    case "this_quarter": return { from: startOfQuarter(now), to: endOfQuarter(now), label: "This quarter" };
    case "this_year":    return { from: startOfYear(now), to: endOfYear(now), label: "This year (FY)" };
    case "last_365":     return { from: startOfDay(subDays(now, 364)), to: endOfDay(now), label: "Last 12 months" };
    case "custom":       return { from: startOfDay(custom.from), to: endOfDay(custom.to), label: "Custom range" };
  }
}

export default function Reports() {
  const { current } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Inv[]>([]);
  const [saleReturns, setSaleReturns] = useState<Inv[]>([]);
  const [purchases, setPurchases] = useState<Inv[]>([]);
  const [quickInvoices, setQuickInvoices] = useState<Inv[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [expenses, setExpenses] = useState<Exp[]>([]);

  // Filter state
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(new Date());

  const range = useMemo(
    () => rangeFor(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo]
  );

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoading(true);
      const since = fmtDate(range.from);
      const until = fmtDate(range.to);
      const [s, p, e, sr, qi] = await Promise.all([
        supabase.from("invoices").select("*").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).gte("invoice_date", since).lte("invoice_date", until),
        supabase.from("invoices").select("*").eq("business_id", current.id).eq("type", "purchase").is("deleted_at", null).gte("invoice_date", since).lte("invoice_date", until),
        supabase.from("expenses").select("category,amount,expense_date").eq("business_id", current.id).gte("expense_date", since).lte("expense_date", until),
        supabase.from("invoices").select("*").eq("business_id", current.id).eq("type", "sale_return").is("deleted_at", null).gte("invoice_date", since).lte("invoice_date", until),
        supabase.from("invoices").select("*").eq("business_id", current.id).eq("type", "non_inventory").is("deleted_at", null).gte("invoice_date", since).lte("invoice_date", until),
      ]);
      if (s.error || p.error || e.error || sr.error || qi.error) toast.error("Failed to load reports");
      const allInvIds = [...(s.data ?? []), ...(p.data ?? [])].map((i: any) => i.id);
      let it: Item[] = [];
      if (allInvIds.length) {
        const { data } = await supabase.from("invoice_items")
          .select("invoice_id,item_name,quantity,total_amount,taxable_amount,tax_rate")
          .in("invoice_id", allInvIds);
        it = (data ?? []) as Item[];
      }
      setSales((s.data ?? []) as Inv[]);
      setPurchases((p.data ?? []) as Inv[]);
      setExpenses((e.data ?? []) as Exp[]);
      setSaleReturns((sr.data ?? []) as Inv[]);
      setQuickInvoices((qi.data ?? []) as Inv[]);
      setItems(it);
      setLoading(false);
    })();
  }, [current?.id, range.from, range.to]);

  /* ------------------------- aggregations ------------------------- */

  // Totals for the selected range
  const totals = useMemo(() => {
    const salesTotal = sales.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const returnsTotal = saleReturns.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const netSales = salesTotal - returnsTotal;
    const purchasesTotal = purchases.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const quickTotal = quickInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const quickOutstanding = quickInvoices.reduce((s, i) => s + Number(i.balance_amount || 0), 0);
    const creditSales = sales.filter((i) => i.status === "unpaid" || i.status === "partial");
    const creditOutstanding = creditSales.reduce((s, i) => s + Number(i.balance_amount || 0), 0);
    return {
      sales: salesTotal,
      saleReturns: returnsTotal,
      netSales,
      purchases: purchasesTotal,
      expenses: expensesTotal,
      net: netSales - purchasesTotal - expensesTotal,
      salesCount: sales.length,
      returnsCount: saleReturns.length,
      purchasesCount: purchases.length,
      creditOutstanding,
      creditCount: creditSales.length,
      quickTotal,
      quickCount: quickInvoices.length,
      quickOutstanding,
    };
  }, [sales, saleReturns, purchases, expenses, quickInvoices]);

  // P&L for the selected range
  const pnl = useMemo(() => {
    const revenue = sales.reduce((s, i) => s + Number(i.subtotal || 0), 0); // pre-tax
    const cogs = purchases.reduce((s, i) => s + Number(i.subtotal || 0), 0);
    const opex = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const gross = revenue - cogs;
    const net = gross - opex;
    return { revenue, cogs, gross, opex, net };
  }, [sales, purchases, expenses]);

  // GST
  const gst = useMemo(() => {
    const out = { cgst: 0, sgst: 0, igst: 0, taxable: 0 };
    const inp = { cgst: 0, sgst: 0, igst: 0, taxable: 0 };
    sales.forEach((i) => {
      out.cgst += Number(i.cgst_amount || 0);
      out.sgst += Number(i.sgst_amount || 0);
      out.igst += Number(i.igst_amount || 0);
      out.taxable += Number(i.subtotal || 0);
    });
    purchases.forEach((i) => {
      inp.cgst += Number(i.cgst_amount || 0);
      inp.sgst += Number(i.sgst_amount || 0);
      inp.igst += Number(i.igst_amount || 0);
      inp.taxable += Number(i.subtotal || 0);
    });
    const liability = (out.cgst + out.sgst + out.igst) - (inp.cgst + inp.sgst + inp.igst);
    return { out, inp, liability };
  }, [sales, purchases]);

  // Top selling products
  const topProducts = useMemo(() => {
    const saleIds = new Set(sales.map((s) => s.id));
    const map = new Map<string, { qty: number; revenue: number }>();
    items.filter((it) => saleIds.has(it.invoice_id)).forEach((it) => {
      const cur = map.get(it.item_name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity || 0);
      cur.revenue += Number(it.total_amount || 0);
      map.set(it.item_name, cur);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [items, sales]);

  // Expense breakdown
  const expBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount || 0)));
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const expTotal = expBreakdown.reduce((s, e) => s + e.total, 0);

  // Daily trend within range (for at-a-glance daily report)
  const daily = useMemo(() => {
    const byDate = new Map<string, { sales: number; purchases: number; expenses: number }>();
    const ensure = (k: string) => {
      let v = byDate.get(k);
      if (!v) { v = { sales: 0, purchases: 0, expenses: 0 }; byDate.set(k, v); }
      return v;
    };
    sales.forEach((i) => { ensure(i.invoice_date).sales += Number(i.total_amount || 0); });
    purchases.forEach((i) => { ensure(i.invoice_date).purchases += Number(i.total_amount || 0); });
    expenses.forEach((e) => { ensure(e.expense_date).expenses += Number(e.amount || 0); });
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, v]) => ({ date, ...v, net: v.sales - v.purchases - v.expenses }));
  }, [sales, purchases, expenses]);

  /* ------------------------- ui helpers ------------------------- */
  const Stat = ({ label, value, tone = "primary" }: { label: string; value: string; tone?: string }) => (
    <Card className="p-3 md:p-4">
      <div className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg md:text-2xl font-semibold tabular-nums mt-1 break-all ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>
        {value}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-0">
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 md:h-6 md:w-6 text-primary" /> Reports
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {range.label} · {format(range.from, "dd MMM yyyy")} — {format(range.to, "dd MMM yyyy")}
          </p>
        </div>

        {/* Date filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="flex-1 md:w-[180px] min-w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today (Daily)</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last_7">Last 7 days</SelectItem>
              <SelectItem value="last_30">Last 30 days</SelectItem>
              <SelectItem value="last_90">Last 90 days</SelectItem>
              <SelectItem value="this_week">This week</SelectItem>
              <SelectItem value="this_month">This month (Monthly)</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
              <SelectItem value="this_quarter">This quarter</SelectItem>
              <SelectItem value="this_year">This year (Yearly)</SelectItem>
              <SelectItem value="last_365">Last 12 months</SelectItem>
              <SelectItem value="custom">Custom range…</SelectItem>
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal w-[160px]")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(customFrom, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customFrom}
                    onSelect={(d) => d && setCustomFrom(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-sm">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal w-[160px]")}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(customTo, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customTo}
                    onSelect={(d) => d && setCustomTo(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => {
            const tag = `${fmtDate(range.from)}_to_${fmtDate(range.to)}`;
            const summary: (string | number)[][] = [
              ["Report", current?.name ?? "", `${range.label} (${fmtDate(range.from)} to ${fmtDate(range.to)})`],
              [],
              ["Section", "Metric", "Value"],
              ["Overview", "Sales", totals.sales],
              ["Overview", "Purchases", totals.purchases],
              ["Overview", "Expenses", totals.expenses],
              ["Overview", "Net", totals.net],
              ["Overview", "Sales Invoices", totals.salesCount],
              ["Overview", "Purchase Invoices", totals.purchasesCount],
              ["Overview", "Sales on Credit (Outstanding)", totals.creditOutstanding],
              ["Overview", "Sales on Credit (Bills)", totals.creditCount],
              [],
              ["P&L", "Revenue", pnl.revenue],
              ["P&L", "COGS", pnl.cogs],
              ["P&L", "Gross Profit", pnl.gross],
              ["P&L", "Operating Expenses", pnl.opex],
              ["P&L", "Net Profit", pnl.net],
              [],
              ["GST", "Output Taxable", gst.out.taxable],
              ["GST", "Output CGST", gst.out.cgst],
              ["GST", "Output SGST", gst.out.sgst],
              ["GST", "Output IGST", gst.out.igst],
              ["GST", "Input Taxable", gst.inp.taxable],
              ["GST", "Input CGST", gst.inp.cgst],
              ["GST", "Input SGST", gst.inp.sgst],
              ["GST", "Input IGST", gst.inp.igst],
              ["GST", "Net Liability", gst.liability],
              [],
              ["Daily", "Date", "Sales", "Purchases", "Expenses", "Net"] as any,
              ...daily.map((d) => ["Daily", d.date, d.sales, d.purchases, d.expenses, d.net] as any),
              [],
              ["Top Products", "Item", "Qty", "Revenue"] as any,
              ...topProducts.map((p) => ["Top Products", p.name, p.qty, p.revenue] as any),
              [],
              ["Expenses", "Category", "Amount"] as any,
              ...expBreakdown.map((e) => ["Expenses", e.category, e.total] as any),
            ];
            downloadCsv(`report_${tag}.csv`, summary);
            toast.success("Report downloaded");
          }} className="gap-1.5">
            <Download className="h-4 w-4" /> Download CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10">Loading reports…</div>
      ) : (
      <Tabs defaultValue="overview">
        <div className="-mx-3 md:mx-0 overflow-x-auto no-scrollbar">
          <TabsList className="inline-flex w-max md:w-full md:flex-wrap mx-3 md:mx-0">
            <TabsTrigger value="overview"><TrendingUp className="h-4 w-4 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="daily"><CalendarIcon className="h-4 w-4 mr-1" />Daily</TabsTrigger>
            <TabsTrigger value="pnl"><FileText className="h-4 w-4 mr-1" />P&amp;L</TabsTrigger>
            <TabsTrigger value="gst"><Receipt className="h-4 w-4 mr-1" />GST</TabsTrigger>
            <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" />Products</TabsTrigger>
            <TabsTrigger value="expenses"><Wallet className="h-4 w-4 mr-1" />Expenses</TabsTrigger>
          </TabsList>
        </div>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total Sales" value={formatINR(totals.sales)} tone="success" />
            <Stat label="Sale Returns" value={formatINR(totals.saleReturns)} tone={totals.saleReturns > 0 ? "danger" : undefined} />
            <Stat label="Net Sales" value={formatINR(totals.netSales)} tone="success" />
            <Stat label="Net Profit" value={formatINR(totals.net)} tone={totals.net >= 0 ? "success" : "danger"} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Purchases" value={formatINR(totals.purchases)} />
            <Stat label="Expenses" value={formatINR(totals.expenses)} />
            <Stat label="Sales on Credit (Unpaid)" value={`${formatINR(totals.creditOutstanding)} · ${totals.creditCount}`} tone={totals.creditOutstanding > 0 ? "danger" : undefined} />
            <Stat label="Returns Count" value={String(totals.returnsCount)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Sales Invoices" value={String(totals.salesCount)} />
            <Stat label="Purchase Invoices" value={String(totals.purchasesCount)} />
            <Stat
              label="Avg. Sale"
              value={formatINR(totals.salesCount ? totals.sales / totals.salesCount : 0)}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Quick Invoices Total" value={formatINR(totals.quickTotal)} tone="success" />
            <Stat label="Quick Invoices Count" value={String(totals.quickCount)} />
            <Stat label="Quick Invoices Outstanding" value={formatINR(totals.quickOutstanding)} tone={totals.quickOutstanding > 0 ? "danger" : undefined} />
          </div>
        </TabsContent>

        {/* DAILY BREAKDOWN */}
        <TabsContent value="daily">
          <Card>
            <div className="p-3 md:p-4 border-b font-medium text-sm md:text-base">Daily breakdown — {range.label}</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daily.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No activity in this range.</TableCell></TableRow>
                  ) : daily.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium whitespace-nowrap">{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right tabular-nums text-success whitespace-nowrap">{formatINR(d.sales)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(d.purchases)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(d.expenses)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold whitespace-nowrap", d.net >= 0 ? "text-success" : "text-danger")}>{formatINR(d.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* P&L */}
        <TabsContent value="pnl">
          <Card className="p-4 md:p-6">
            <div className="text-sm text-muted-foreground mb-4">Profit & Loss — {range.label}</div>
            <div className="overflow-x-auto">
              <Table>
                <TableBody>
                  <TableRow><TableCell>Revenue (Sales)</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(pnl.revenue)}</TableCell></TableRow>
                  <TableRow><TableCell>Cost of Goods (Purchases)</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">- {formatINR(pnl.cogs)}</TableCell></TableRow>
                  <TableRow className="font-semibold border-t-2"><TableCell>Gross Profit</TableCell><TableCell className={`text-right tabular-nums whitespace-nowrap ${pnl.gross >= 0 ? "text-success" : "text-danger"}`}>{formatINR(pnl.gross)}</TableCell></TableRow>
                  <TableRow><TableCell>Operating Expenses</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">- {formatINR(pnl.opex)}</TableCell></TableRow>
                  <TableRow className="font-bold border-t-2 text-base"><TableCell>Net Profit</TableCell><TableCell className={`text-right tabular-nums whitespace-nowrap ${pnl.net >= 0 ? "text-success" : "text-danger"}`}>{formatINR(pnl.net)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Note: Revenue and COGS are pre-tax (subtotal). Excludes payment timing.
            </p>
          </Card>
        </TabsContent>

        {/* GST */}
        <TabsContent value="gst" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat label="Total Output Tax" value={formatINR(gst.out.cgst + gst.out.sgst + gst.out.igst)} tone="success" />
            <Stat label="Total Input Tax" value={formatINR(gst.inp.cgst + gst.inp.sgst + gst.inp.igst)} />
            <Stat label="Net GST Liability" value={formatINR(gst.liability)} tone={gst.liability > 0 ? "danger" : "success"} />
          </div>
          <Card>
            <div className="p-3 md:p-4 border-b font-medium text-sm md:text-base">GST Summary — {range.label}</div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium whitespace-nowrap">Output</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.out.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.out.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.out.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.out.igst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatINR(gst.out.cgst + gst.out.sgst + gst.out.igst)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium whitespace-nowrap">Input</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.inp.taxable)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.inp.cgst)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.inp.sgst)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(gst.inp.igst)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatINR(gst.inp.cgst + gst.inp.sgst + gst.inp.igst)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Top Products */}
        <TabsContent value="products">
          <Card>
            <div className="p-3 md:p-4 border-b font-medium text-sm md:text-base">Top 10 Products — {range.label}</div>
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sales in this range.</TableCell></TableRow>
                ) : topProducts.map((p, idx) => (
                  <TableRow key={p.name}>
                    <TableCell><Badge variant={idx < 3 ? "default" : "secondary"}>{idx + 1}</Badge></TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Expenses */}
        <TabsContent value="expenses">
          <Card>
            <div className="p-3 md:p-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="font-medium text-sm md:text-base">Expenses by Category — {range.label}</div>
              <div className="text-xs md:text-sm text-muted-foreground">Total: <span className="font-semibold tabular-nums">{formatINR(expTotal)}</span></div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right w-24">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expBreakdown.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No expenses in this range.</TableCell></TableRow>
                  ) : expBreakdown.map((e) => {
                    const pct = expTotal > 0 ? (e.total / expTotal) * 100 : 0;
                    return (
                      <TableRow key={e.category}>
                        <TableCell className="font-medium">{e.category}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{formatINR(e.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{pct.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
