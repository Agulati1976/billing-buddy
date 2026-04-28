import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Receipt, Package, Wallet, FileText } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/states";
import { toast } from "sonner";

type Inv = {
  id: string; invoice_date: string; total_amount: number; tax_amount: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  subtotal: number; type: string; status: string; party_id: string | null;
  is_inter_state: boolean; party_state_code: string | null;
};
type Item = { invoice_id: string; item_name: string; quantity: number; total_amount: number; taxable_amount: number; tax_rate: number; };
type Exp = { category: string; amount: number; expense_date: string; };

const startOf = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export default function Reports() {
  const { current } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Inv[]>([]);
  const [purchases, setPurchases] = useState<Inv[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [expenses, setExpenses] = useState<Exp[]>([]);

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoading(true);
      const since = fmtDate(new Date(Date.now() - 365 * 86400000));
      const [s, p, e] = await Promise.all([
        supabase.from("invoices").select("*").eq("business_id", current.id).eq("type", "sale").gte("invoice_date", since),
        supabase.from("invoices").select("*").eq("business_id", current.id).eq("type", "purchase").gte("invoice_date", since),
        supabase.from("expenses").select("category,amount,expense_date").eq("business_id", current.id).gte("expense_date", since),
      ]);
      if (s.error || p.error || e.error) toast.error("Failed to load reports");
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
      setItems(it);
      setLoading(false);
    })();
  }, [current?.id]);

  /* ------------------------- aggregations ------------------------- */
  const now = new Date();
  const today = startOf(now);
  const wkStart = startOf(new Date(now.getTime() - 6 * 86400000));
  const moStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const sumIn = (arr: Inv[], from: Date) =>
    arr.filter((i) => new Date(i.invoice_date) >= from)
       .reduce((s, i) => s + Number(i.total_amount || 0), 0);

  const periods = {
    today: { sales: sumIn(sales, today), purchases: sumIn(purchases, today),
             expenses: expenses.filter(e => new Date(e.expense_date) >= today).reduce((s,e)=>s+Number(e.amount||0),0) },
    week:  { sales: sumIn(sales, wkStart), purchases: sumIn(purchases, wkStart),
             expenses: expenses.filter(e => new Date(e.expense_date) >= wkStart).reduce((s,e)=>s+Number(e.amount||0),0) },
    month: { sales: sumIn(sales, moStart), purchases: sumIn(purchases, moStart),
             expenses: expenses.filter(e => new Date(e.expense_date) >= moStart).reduce((s,e)=>s+Number(e.amount||0),0) },
  };

  // P&L (financial year-to-date approximation = last 365d)
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

  /* ------------------------- ui helpers ------------------------- */
  const Stat = ({ label, value, tone = "primary" }: { label: string; value: string; tone?: string }) => (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>
        {value}
      </div>
    </Card>
  );

  if (loading) {
    return <div className="text-center text-muted-foreground py-10">Loading reports…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Reports & Analytics
        </h1>
        <p className="text-sm text-muted-foreground">Last 12 months of activity for {current?.name ?? "your business"}.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview"><TrendingUp className="h-4 w-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="pnl"><FileText className="h-4 w-4 mr-1" />Profit & Loss</TabsTrigger>
          <TabsTrigger value="gst"><Receipt className="h-4 w-4 mr-1" />GST</TabsTrigger>
          <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" />Top Products</TabsTrigger>
          <TabsTrigger value="expenses"><Wallet className="h-4 w-4 mr-1" />Expenses</TabsTrigger>
        </TabsList>

        {/* OVERVIEW: Daily / Weekly / Monthly */}
        <TabsContent value="overview" className="space-y-4">
          {(["today","week","month"] as const).map((k) => {
            const p = periods[k];
            const label = k === "today" ? "Today" : k === "week" ? "Last 7 Days" : "This Month";
            const profit = p.sales - p.purchases - p.expenses;
            return (
              <div key={k}>
                <div className="text-sm font-medium mb-2 text-muted-foreground">{label}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Sales" value={formatINR(p.sales)} tone="success" />
                  <Stat label="Purchases" value={formatINR(p.purchases)} />
                  <Stat label="Expenses" value={formatINR(p.expenses)} />
                  <Stat label="Net" value={formatINR(profit)} tone={profit >= 0 ? "success" : "danger"} />
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* P&L */}
        <TabsContent value="pnl">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-4">Profit & Loss — last 12 months</div>
            <Table>
              <TableBody>
                <TableRow><TableCell>Revenue (Sales)</TableCell><TableCell className="text-right tabular-nums">{formatINR(pnl.revenue)}</TableCell></TableRow>
                <TableRow><TableCell>Cost of Goods (Purchases)</TableCell><TableCell className="text-right tabular-nums">- {formatINR(pnl.cogs)}</TableCell></TableRow>
                <TableRow className="font-semibold border-t-2"><TableCell>Gross Profit</TableCell><TableCell className={`text-right tabular-nums ${pnl.gross >= 0 ? "text-success" : "text-danger"}`}>{formatINR(pnl.gross)}</TableCell></TableRow>
                <TableRow><TableCell>Operating Expenses</TableCell><TableCell className="text-right tabular-nums">- {formatINR(pnl.opex)}</TableCell></TableRow>
                <TableRow className="font-bold border-t-2 text-base"><TableCell>Net Profit</TableCell><TableCell className={`text-right tabular-nums ${pnl.net >= 0 ? "text-success" : "text-danger"}`}>{formatINR(pnl.net)}</TableCell></TableRow>
              </TableBody>
            </Table>
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
            <div className="p-4 border-b font-medium">GST Summary (last 12 months)</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="text-right">Taxable Value</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Output (Sales)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.out.taxable)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.out.cgst)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.out.sgst)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.out.igst)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatINR(gst.out.cgst + gst.out.sgst + gst.out.igst)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Input (Purchases)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.inp.taxable)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.inp.cgst)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.inp.sgst)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(gst.inp.igst)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatINR(gst.inp.cgst + gst.inp.sgst + gst.inp.igst)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Top Products */}
        <TabsContent value="products">
          <Card>
            <div className="p-4 border-b font-medium">Top 10 Selling Products / Services</div>
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
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sales yet.</TableCell></TableRow>
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
          </Card>
        </TabsContent>

        {/* Expenses */}
        <TabsContent value="expenses">
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium">Expenses by Category</div>
              <div className="text-sm text-muted-foreground">Total: <span className="font-semibold tabular-nums">{formatINR(expTotal)}</span></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right w-32">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expBreakdown.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No expenses yet.</TableCell></TableRow>
                ) : expBreakdown.map((e) => {
                  const pct = expTotal > 0 ? (e.total / expTotal) * 100 : 0;
                  return (
                    <TableRow key={e.category}>
                      <TableCell className="font-medium">{e.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(e.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
