import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useBusiness } from "@/hooks/useBusiness";
import { ArrowDownRight, ArrowUpRight, Package, Receipt, ShoppingCart, TrendingUp, Users, Wallet, FileText } from "lucide-react";
import { formatINR } from "@/lib/states";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { DashboardChart } from "@/components/DashboardChart";
import { DateRangeFilter, rangeFor, type DatePreset } from "@/components/DateRangeFilter";
import { ModuleGrid } from "@/components/ModuleGrid";
import { startOfMonth, format } from "date-fns";

const StatCard = ({
  label, value, icon: Icon, tone = "primary", to,
}: { label: string; value: string; icon: any; tone?: "primary" | "success" | "warning" | "danger"; to?: string }) => {
  const toneMap = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  const inner = (
    <Card className="p-3 sm:p-5 h-full hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs sm:text-sm text-muted-foreground truncate">{label}</div>
          <div className="text-lg sm:text-2xl font-semibold mt-1 num truncate">{value}</div>
        </div>
        <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${toneMap[tone]}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
};

interface Stats {
  todaySales: number;
  rangeSales: number;
  rangePurchases: number;
  rangeExpenses: number;
  toReceive: number;
  toPay: number;
  topCustomers: { name: string; total: number }[];
  lowStock: { name: string; current_stock: number; unit: string; low_stock_alert: number }[];
  expiringBatches: { id: string; batch_number: string; expiry_date: string; quantity: number; item: string }[];
  recentInvoices: { id: string; invoice_number: string; total_amount: number; status: string; party: string | null }[];
}

export default function Dashboard() {
  const { current } = useBusiness();
  const [stats, setStats] = useState<Stats | null>(null);

  // Date filter
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState<Date>(new Date());
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const range = useMemo(
    () => rangeFor(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo]
  );

  // Expiry filter (days window)
  const PRESET_DAYS = [7, 15, 30, 60, 90, 180];
  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [expiryCustom, setExpiryCustom] = useState<string>("30");
  const [expiryIsCustom, setExpiryIsCustom] = useState<boolean>(false);

  // Low stock filter (how many recent low-stock products to show)
  const LOW_STOCK_THRESHOLD = 5;
  const [lowCount, setLowCount] = useState<number>(10);
  const [lowCustom, setLowCustom] = useState<string>("10");
  const [lowIsCustom, setLowIsCustom] = useState<boolean>(false);


  useEffect(() => {
    if (!current) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const since = range.from ? format(range.from, "yyyy-MM-dd") : null;
      const until = range.to ? format(range.to, "yyyy-MM-dd") : null;

      const inN = new Date(); inN.setDate(inN.getDate() + Math.max(0, expiryDays));
      const inNStr = inN.toISOString().slice(0, 10);


      let rangeQuery = supabase.from("invoices")
        .select("total_amount, party_id, parties(name)")
        .eq("business_id", current.id).eq("type", "sale").is("deleted_at", null);
      if (since) rangeQuery = rangeQuery.gte("invoice_date", since);
      if (until) rangeQuery = rangeQuery.lte("invoice_date", until);

      let purchQuery = supabase.from("invoices")
        .select("total_amount")
        .eq("business_id", current.id).eq("type", "purchase").is("deleted_at", null);
      if (since) purchQuery = purchQuery.gte("invoice_date", since);
      if (until) purchQuery = purchQuery.lte("invoice_date", until);

      let expQuery = supabase.from("expenses")
        .select("amount")
        .eq("business_id", current.id);
      if (since) expQuery = expQuery.gte("expense_date", since);
      if (until) expQuery = expQuery.lte("expense_date", until);

      // To Receive / To Pay — unpaid balances for invoices issued within the selected date range.
      let recvQuery = supabase.from("invoices").select("balance_amount").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).gt("balance_amount", 0);
      if (since) recvQuery = recvQuery.gte("invoice_date", since);
      if (until) recvQuery = recvQuery.lte("invoice_date", until);
      let payQuery = supabase.from("invoices").select("balance_amount").eq("business_id", current.id).eq("type", "purchase").is("deleted_at", null).gt("balance_amount", 0);
      if (since) payQuery = payQuery.gte("invoice_date", since);
      if (until) payQuery = payQuery.lte("invoice_date", until);

      const [todayR, rangeR, purchR, expenseR, recvR, payR, recentR, lowR, expR] = await Promise.all([
        supabase.from("invoices").select("total_amount").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).eq("invoice_date", today),
        rangeQuery,
        purchQuery,
        expQuery,
        recvQuery,
        payQuery,
        supabase.from("invoices").select("id, invoice_number, total_amount, status, parties(name)").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
        supabase.from("items").select("name, current_stock, unit, low_stock_alert, updated_at").eq("business_id", current.id).eq("type", "product").lt("current_stock", LOW_STOCK_THRESHOLD).order("updated_at", { ascending: false }).limit(Math.max(1, lowCount)),
        supabase.from("batches").select("id, batch_number, expiry_date, quantity, items(name)").eq("business_id", current.id).gt("quantity", 0).not("expiry_date", "is", null).lte("expiry_date", inNStr).order("expiry_date").limit(50),
      ]);

      const todaySales = (todayR.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const rangeSales = (rangeR.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const rangePurchases = (purchR.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const rangeExpenses = (expenseR.data ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
      const toReceive = (recvR.data ?? []).reduce((s, r: any) => s + Number(r.balance_amount), 0);
      const toPay = (payR.data ?? []).reduce((s, r: any) => s + Number(r.balance_amount), 0);

      const customerMap = new Map<string, number>();
      (rangeR.data ?? []).forEach((r: any) => {
        const name = r.parties?.name;
        if (!name) return;
        customerMap.set(name, (customerMap.get(name) ?? 0) + Number(r.total_amount));
      });
      const topCustomers = [...customerMap.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      const lowStock = ((lowR.data as any[]) ?? []).slice(0, Math.max(1, lowCount));

      const recentInvoices = ((recentR.data as any[]) ?? []).map((r) => ({
        id: r.id, invoice_number: r.invoice_number,
        total_amount: Number(r.total_amount), status: r.status,
        party: r.parties?.name ?? null,
      }));

      const expiringBatches = ((expR.data as any[]) ?? []).map((b) => ({
        id: b.id, batch_number: b.batch_number, expiry_date: b.expiry_date,
        quantity: Number(b.quantity), item: b.items?.name ?? "—",
      }));

      setStats({ todaySales, rangeSales, rangePurchases, rangeExpenses, toReceive, toPay, topCustomers, lowStock, expiringBatches, recentInvoices });
    })();
  }, [current?.id, range.from, range.to, expiryDays, lowCount]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Welcome back to <span className="font-medium text-foreground">{current?.name}</span>
          </p>
        </div>
        <DateRangeFilter
          preset={preset} onPresetChange={setPreset}
          customFrom={customFrom} customTo={customTo}
          onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={`Sales · ${range.label}`} value={formatINR(stats?.rangeSales ?? 0)} icon={ArrowUpRight} tone="success" to="/sales" />
        <StatCard label={`Purchases · ${range.label}`} value={formatINR(stats?.rangePurchases ?? 0)} icon={ShoppingCart} tone="primary" to="/purchases" />
        <StatCard label={`Expenses · ${range.label}`} value={formatINR(stats?.rangeExpenses ?? 0)} icon={Receipt} tone="danger" to="/expenses" />
        <StatCard label={`Profit · ${range.label}`} value={formatINR((stats?.rangeSales ?? 0) - (stats?.rangePurchases ?? 0) - (stats?.rangeExpenses ?? 0))} icon={TrendingUp} tone="success" to="/reports" />
        <StatCard label={`To Receive · ${range.label}`} value={formatINR(stats?.toReceive ?? 0)} icon={ArrowDownRight} tone="warning" to="/payments" />
        <StatCard label={`To Pay · ${range.label}`} value={formatINR(stats?.toPay ?? 0)} icon={Wallet} tone="danger" to="/payments" />



      </div>

      {/* Mobile launcher-style module grid */}
      <div className="md:hidden">
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground">Quick Access</h2>
        <ModuleGrid />
      </div>

      <DashboardChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Recent Sales</h2>
          </div>
          {stats && stats.recentInvoices.length > 0 ? (
            <ul className="space-y-2">
              {stats.recentInvoices.map((r) => (
                <li key={r.id}>
                  <Link to={`/sales/${r.id}`} className="flex justify-between items-center text-sm py-2 border-b last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded">
                    <div>
                      <div className="font-medium">{r.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">{r.party ?? "—"}</div>
                    </div>
                    <div className="num font-medium">{formatINR(r.total_amount)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices yet. Create your first sale invoice to get started.</p>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Top Customers · {range.label}</h2>
          </div>
          {stats && stats.topCustomers.length > 0 ? (
            <ul className="space-y-2">
              {stats.topCustomers.map((c) => (
                <li key={c.name} className="flex justify-between text-sm py-1">
                  <span>{c.name}</span>
                  <span className="num font-medium">{formatINR(c.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No sales in this range yet.</p>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-warning" />
              <h2 className="font-semibold">Low Stock Alerts · last {lowDays} day{lowDays === 1 ? "" : "s"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={lowIsCustom ? "custom" : String(lowDays)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") {
                    setLowIsCustom(true);
                    const n = Number(lowCustom);
                    if (Number.isFinite(n) && n > 0) setLowDays(Math.floor(n));
                    return;
                  }
                  setLowIsCustom(false);
                  const n = Number(v);
                  setLowDays(n);
                  setLowCustom(String(n));
                }}
              >
                <option value="7">Last 7 days</option>
                <option value="15">Last 15 days</option>
                <option value="30">Last 30 days</option>
                <option value="60">Last 60 days</option>
                <option value="90">Last 90 days</option>
                <option value="180">Last 180 days</option>
                <option value="custom">Custom…</option>
              </select>
              {lowIsCustom && (
                <input
                  type="number"
                  min={1}
                  className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                  value={lowCustom}
                  onChange={(e) => {
                    setLowCustom(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) setLowDays(Math.floor(n));
                  }}
                  placeholder="Days"
                />
              )}
            </div>
          </div>
          {stats && stats.lowStock.length > 0 ? (
            <ul className="space-y-2">
              {stats.lowStock.map((i) => (
                <li key={i.name} className="flex justify-between items-center text-sm py-1">
                  <span>{i.name}</span>
                  <span className="text-danger num">
                    {Number(i.current_stock)} {i.unit} <span className="text-muted-foreground">/ alert at {Number(i.low_stock_alert)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No items with recent activity below their low-stock threshold.</p>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-warning" />
              <h2 className="font-semibold">Expiring Batches · next {expiryDays} day{expiryDays === 1 ? "" : "s"}</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={expiryIsCustom ? "custom" : String(expiryDays)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") {
                    setExpiryIsCustom(true);
                    const n = Number(expiryCustom);
                    if (Number.isFinite(n) && n > 0) setExpiryDays(Math.floor(n));
                    return;
                  }
                  setExpiryIsCustom(false);
                  const n = Number(v);
                  setExpiryDays(n);
                  setExpiryCustom(String(n));
                }}
              >
                <option value="7">Next 7 days</option>
                <option value="15">Next 15 days</option>
                <option value="30">Next 30 days</option>
                <option value="60">Next 60 days</option>
                <option value="90">Next 90 days</option>
                <option value="180">Next 180 days</option>
                <option value="custom">Custom…</option>
              </select>
              {expiryIsCustom && (
                <input
                  type="number"
                  min={1}
                  className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                  value={expiryCustom}
                  onChange={(e) => {
                    setExpiryCustom(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) setExpiryDays(Math.floor(n));
                  }}
                  placeholder="Days"
                />
              )}
            </div>
          </div>
          {stats && stats.expiringBatches.length > 0 ? (
            <ul className="space-y-2 max-h-80 overflow-auto">
              {stats.expiringBatches.map((b) => (
                <li key={b.id} className="flex justify-between items-center text-sm py-1">
                  <span className="truncate pr-2">{b.item} <span className="text-muted-foreground">· batch {b.batch_number}</span></span>
                  <span className="text-warning num shrink-0">{b.quantity} · exp {b.expiry_date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No batches expiring in the next {expiryDays} day{expiryDays === 1 ? "" : "s"}.</p>
          )}
        </Card>


      </div>
    </div>
  );
}
