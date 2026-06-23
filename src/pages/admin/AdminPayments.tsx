import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { KpiCard } from "@/components/admin/KpiCard";
import { Wallet, Hash, TrendingUp } from "lucide-react";
import { formatINR } from "@/lib/admin/api";

export default function AdminPayments() {
  const [rows, setRows] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [bizId, setBizId] = useState("all");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("businesses").select("id, name").order("name");
      setBusinesses(data ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from("payments").select("*").order("payment_date", { ascending: false }).limit(500);
      if (bizId !== "all") q = q.eq("business_id", bizId);
      if (method !== "all") q = q.eq("method", method as any);
      if (from) q = q.gte("payment_date", from);
      if (to) q = q.lte("payment_date", to);
      const { data } = await q;
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [bizId, method, from, to]);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const avg = rows.length ? total / rows.length : 0;
  const bizName = useMemo(() => {
    const m = new Map(businesses.map((b) => [b.id, b.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [businesses]);

  return (
    <div>
      <AdminTopbar title="Payments" subtitle="Cross-tenant payments (latest 500 matching filters)" />
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <KpiCard label="Total received" value={formatINR(total)} icon={Wallet} loading={loading} />
        <KpiCard label="Count" value={rows.length} icon={Hash} loading={loading} />
        <KpiCard label="Average" value={formatINR(avg)} icon={TrendingUp} loading={loading} />
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
          <label className="text-xs text-muted-foreground">Method</label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="other">Other</SelectItem>
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
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payments</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.payment_date ? new Date(r.payment_date).toLocaleDateString() : "—"}</TableCell>
                <TableCell><Link to={`/admin/shopkeepers/${r.business_id}`} className="hover:underline">{bizName(r.business_id)}</Link></TableCell>
                <TableCell className="capitalize text-sm">{r.method ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.reference ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatINR(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
