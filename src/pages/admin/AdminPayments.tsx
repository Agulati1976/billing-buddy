import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { KpiCard } from "@/components/admin/KpiCard";
import { Wallet, TrendingUp, Users, RotateCw, Download } from "lucide-react";
import { formatINR } from "@/lib/admin/api";

export default function AdminPayments() {
  const [orders, setOrders] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string; email?: string | null }[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string; price_inr: number }[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bizId, setBizId] = useState("all");
  const [status, setStatus] = useState("all");
  const [planId, setPlanId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: b }, { data: p }, { data: s }] = await Promise.all([
      supabase.from("businesses").select("id, name, email").order("name"),
      supabase.from("subscription_plans").select("id, name, price_inr").order("price_inr"),
      supabase.from("business_subscriptions").select("*"),
    ]);
    setBusinesses(b ?? []);
    setPlans(p ?? []);
    setSubs(s ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      let q = supabase.from("subscription_orders").select("*").order("created_at", { ascending: false }).limit(1000);
      if (bizId !== "all") q = q.eq("business_id", bizId);
      if (status !== "all") q = q.eq("status", status);
      if (planId !== "all") q = q.eq("plan_id", planId);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      const { data } = await q;
      setOrders(data ?? []);
    })();
  }, [bizId, status, planId, from, to]);

  const bizMap = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);
  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const paid = orders.filter((o) => o.status === "PAID");
  const total = paid.reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayRev = paid.filter((o) => o.paid_at && new Date(o.paid_at) >= today).reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const mtd = paid.filter((o) => o.paid_at && new Date(o.paid_at) >= monthStart).reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const last30 = paid.filter((o) => o.paid_at && new Date(o.paid_at).getTime() > Date.now() - 30 * 86400000).reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const activePayers = new Set(subs.filter((s) => s.status === "active" && s.expires_at && new Date(s.expires_at) > new Date()).map((s) => s.business_id)).size;

  const exportCsv = () => {
    const header = ["Date", "Business", "Email", "Plan", "Amount", "Status", "Method", "CF Order ID"];
    const rows = orders.map((o) => {
      const biz = bizMap.get(o.business_id);
      return [
        o.created_at ? new Date(o.created_at).toLocaleString() : "",
        biz?.name ?? "",
        biz?.email ?? "",
        planMap.get(o.plan_id)?.name ?? "",
        o.order_amount,
        o.status,
        o.payment_method ?? "",
        o.cf_order_id ?? "",
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `saas-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const statusColor = (s: string) =>
    s === "PAID" ? "bg-emerald-500/15 text-emerald-700"
    : s === "FAILED" || s === "USER_DROPPED" ? "bg-destructive/15 text-destructive"
    : "bg-muted text-muted-foreground";

  return (
    <div>
      <AdminTopbar
        title="SaaS Revenue"
        subtitle="Payments from shopkeepers to Bill Look (plan purchases & renewals)"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />CSV</Button>
            <Button variant="ghost" size="sm" onClick={load}><RotateCw className="h-4 w-4" /></Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-4">
        <KpiCard label="Today" value={formatINR(todayRev)} icon={Wallet} loading={loading} />
        <KpiCard label="Month to date" value={formatINR(mtd)} icon={TrendingUp} loading={loading} />
        <KpiCard label="Last 30 days (MRR)" value={formatINR(last30)} icon={TrendingUp} loading={loading} />
        <KpiCard label="All-time" value={formatINR(total)} icon={Wallet} loading={loading} />
        <KpiCard label="Active paying" value={activePayers} icon={Users} loading={loading} />
      </div>

      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Shopkeeper</label>
          <Select value={bizId} onValueChange={setBizId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Plan</label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="USER_DROPPED">User dropped</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><label className="text-xs text-muted-foreground">From</label><Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">To</label><Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Shopkeeper</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>CF Order ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No payments match these filters</TableCell></TableRow>
            ) : orders.map((o) => {
              const biz = bizMap.get(o.business_id);
              return (
                <TableRow key={o.id}>
                  <TableCell className="text-sm">{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    <Link to={`/admin/shopkeepers/${o.business_id}`} className="hover:underline">
                      <div className="font-medium">{biz?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{biz?.email ?? ""}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{planMap.get(o.plan_id)?.name ?? "—"}</TableCell>
                  <TableCell className="capitalize text-sm">{o.payment_method ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{o.cf_order_id ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColor(o.status)}>{o.status}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatINR(o.order_amount)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
