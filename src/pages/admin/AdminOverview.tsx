import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Store, Users, Receipt, IndianRupee, UserPlus, Activity } from "lucide-react";
import { KpiCard } from "@/components/admin/KpiCard";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { SignupsChart } from "@/components/admin/SignupsChart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, daysAgo } from "@/lib/admin/api";

export default function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    businesses: 0, users: 0, invoices30: 0, revenue30: 0, signups7: 0, activeShops7: 0,
  });
  const [revenueSeries, setRevenueSeries] = useState<{ date: string; revenue: number }[]>([]);
  const [signupsSeries, setSignupsSeries] = useState<{ date: string; count: number }[]>([]);
  const [topShops, setTopShops] = useState<{ id: string; name: string; revenue: number; invoices: number }[]>([]);
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const since30 = daysAgo(30).toISOString();
      const since7 = daysAgo(7).toISOString();
      const since90 = daysAgo(90).toISOString();

      const [biz, prof, inv30, prof7, allSales90, audit] = await Promise.all([
        supabase.from("businesses").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("total_amount, business_id, invoice_date, created_at")
          .eq("type", "sale").gte("created_at", since30),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7),
        supabase.from("invoices").select("total_amount, business_id, created_at")
          .eq("type", "sale").gte("created_at", since90),
        supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(15),
      ]);

      const rev30 = (inv30.data ?? []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
      const activeIds = new Set((inv30.data ?? [])
        .filter((r: any) => new Date(r.created_at) >= daysAgo(7))
        .map((r: any) => r.business_id));

      // 90-day revenue series
      const buckets: Record<string, number> = {};
      const sBuckets: Record<string, number> = {};
      for (let i = 89; i >= 0; i--) {
        const d = daysAgo(i);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = 0;
        sBuckets[key] = 0;
      }
      (allSales90.data ?? []).forEach((r: any) => {
        const k = (r.created_at ?? "").slice(0, 10);
        if (k in buckets) buckets[k] += Number(r.total_amount || 0);
      });

      const { data: profs90 } = await supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", since90);
      (profs90 ?? []).forEach((p: any) => {
        const k = (p.created_at ?? "").slice(0, 10);
        if (k in sBuckets) sBuckets[k] += 1;
      });

      setRevenueSeries(Object.entries(buckets).map(([date, revenue]) => ({
        date: date.slice(5), revenue,
      })));
      setSignupsSeries(Object.entries(sBuckets).map(([date, count]) => ({
        date: date.slice(5), count,
      })));

      // Top shops by revenue (all-time)
      const { data: allInv } = await supabase
        .from("invoices")
        .select("business_id, total_amount")
        .eq("type", "sale");
      const tally: Record<string, { revenue: number; invoices: number }> = {};
      (allInv ?? []).forEach((r: any) => {
        const id = r.business_id;
        if (!tally[id]) tally[id] = { revenue: 0, invoices: 0 };
        tally[id].revenue += Number(r.total_amount || 0);
        tally[id].invoices += 1;
      });
      const topIds = Object.entries(tally)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 10)
        .map(([id]) => id);
      const { data: topBizs } = topIds.length
        ? await supabase.from("businesses").select("id, name").in("id", topIds)
        : { data: [] as any[] };
      const nameMap = new Map((topBizs ?? []).map((b: any) => [b.id, b.name]));
      setTopShops(topIds.map((id) => ({
        id,
        name: nameMap.get(id) ?? "—",
        revenue: tally[id].revenue,
        invoices: tally[id].invoices,
      })));

      setStats({
        businesses: biz.count ?? 0,
        users: prof.count ?? 0,
        invoices30: (inv30.data ?? []).length,
        revenue30: rev30,
        signups7: prof7.count ?? 0,
        activeShops7: activeIds.size,
      });
      setActivity(audit.data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <AdminTopbar
        title="Platform Overview"
        subtitle="Live snapshot of every shopkeeper using Bill Look."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Shopkeepers" value={stats.businesses} icon={Store} loading={loading} hint="active" />
        <KpiCard label="Users" value={stats.users} icon={Users} loading={loading} />
        <KpiCard label="Invoices (30d)" value={stats.invoices30} icon={Receipt} loading={loading} />
        <KpiCard label="Revenue (30d)" value={formatINR(stats.revenue30)} icon={IndianRupee} loading={loading} />
        <KpiCard label="New signups (7d)" value={stats.signups7} icon={UserPlus} loading={loading} />
        <KpiCard label="Active shops (7d)" value={stats.activeShops7} icon={Activity} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Revenue trend</h3>
            <span className="text-xs text-muted-foreground">Last 90 days</span>
          </div>
          <RevenueChart data={revenueSeries} />
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Signups</h3>
            <span className="text-xs text-muted-foreground">Last 90 days</span>
          </div>
          <SignupsChart data={signupsSeries} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mt-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Top shopkeepers</h3>
            <span className="text-xs text-muted-foreground">By gross sales</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shopkeeper</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topShops.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No data yet</TableCell></TableRow>
              ) : topShops.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link className="hover:underline font-medium" to={`/admin/shopkeepers/${s.id}`}>{s.name}</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{s.invoices}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatINR(s.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Recent admin activity</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="text-sm border-l-2 border-primary/30 pl-3">
                  <div className="font-medium capitalize">{a.action.replaceAll("_", " ")}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()} · {a.target_type ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
