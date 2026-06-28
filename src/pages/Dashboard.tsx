import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useBusiness } from "@/hooks/useBusiness";
import { ArrowDownRight, ArrowUpRight, Package, TrendingUp, Users, Wallet, FileText } from "lucide-react";
import { formatINR } from "@/lib/states";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { DashboardChart } from "@/components/DashboardChart";
import { DateRangeFilter, rangeFor, type DatePreset } from "@/components/DateRangeFilter";
import { ModuleGrid } from "@/components/ModuleGrid";
import { startOfMonth, format } from "date-fns";

const StatCard = ({
  label, value, icon: Icon, tone = "primary",
}: { label: string; value: string; icon: any; tone?: "primary" | "success" | "warning" | "danger" }) => {
  const toneMap = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <Card className="p-3 sm:p-5">
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
};

interface Stats {
  todaySales: number;
  rangeSales: number;
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
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const range = useMemo(
    () => rangeFor(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo]
  );

  // Expiry filter (days window)
  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [expiryCustom, setExpiryCustom] = useState<string>("30");


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

      const [todayR, rangeR, recvR, payR, recentR, lowR, expR] = await Promise.all([
        supabase.from("invoices").select("total_amount").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).eq("invoice_date", today),
        rangeQuery,
        supabase.from("invoices").select("balance_amount").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).gt("balance_amount", 0),
        supabase.from("invoices").select("balance_amount").eq("business_id", current.id).eq("type", "purchase").is("deleted_at", null).gt("balance_amount", 0),
        supabase.from("invoices").select("id, invoice_number, total_amount, status, parties(name)").eq("business_id", current.id).eq("type", "sale").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
        supabase.from("items").select("name, current_stock, unit, low_stock_alert").eq("business_id", current.id).eq("type", "product").gt("low_stock_alert", 0),
        supabase.from("batches").select("id, batch_number, expiry_date, quantity, items(name)").eq("business_id", current.id).gt("quantity", 0).not("expiry_date", "is", null).lte("expiry_date", in30Str).order("expiry_date").limit(10),
      ]);

      const todaySales = (todayR.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
      const rangeSales = (rangeR.data ?? []).reduce((s, r: any) => s + Number(r.total_amount), 0);
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

      const lowStock = ((lowR.data as any[]) ?? [])
        .filter((i) => Number(i.current_stock) <= Number(i.low_stock_alert))
        .slice(0, 5);

      const recentInvoices = ((recentR.data as any[]) ?? []).map((r) => ({
        id: r.id, invoice_number: r.invoice_number,
        total_amount: Number(r.total_amount), status: r.status,
        party: r.parties?.name ?? null,
      }));

      const expiringBatches = ((expR.data as any[]) ?? []).map((b) => ({
        id: b.id, batch_number: b.batch_number, expiry_date: b.expiry_date,
        quantity: Number(b.quantity), item: b.items?.name ?? "—",
      }));

      setStats({ todaySales, rangeSales, toReceive, toPay, topCustomers, lowStock, expiringBatches, recentInvoices });
    })();
  }, [current?.id, range.from, range.to]);

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Today's Sales" value={formatINR(stats?.todaySales ?? 0)} icon={TrendingUp} tone="primary" />
        <StatCard label={`Sales · ${range.label}`} value={formatINR(stats?.rangeSales ?? 0)} icon={ArrowUpRight} tone="success" />
        <StatCard label="To Receive" value={formatINR(stats?.toReceive ?? 0)} icon={ArrowDownRight} tone="warning" />
        <StatCard label="To Pay" value={formatINR(stats?.toPay ?? 0)} icon={Wallet} tone="danger" />
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
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-warning" />
            <h2 className="font-semibold">Low Stock Alerts</h2>
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
            <p className="text-sm text-muted-foreground">All items are above their low-stock threshold.</p>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-warning" />
            <h2 className="font-semibold">Expiring Batches (next 30 days)</h2>
          </div>
          {stats && stats.expiringBatches.length > 0 ? (
            <ul className="space-y-2">
              {stats.expiringBatches.map((b) => (
                <li key={b.id} className="flex justify-between items-center text-sm py-1">
                  <span>{b.item} <span className="text-muted-foreground">· batch {b.batch_number}</span></span>
                  <span className="text-warning num">{b.quantity} · exp {b.expiry_date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No batches expiring in the next 30 days.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
