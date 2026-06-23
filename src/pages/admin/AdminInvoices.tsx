import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { formatINR } from "@/lib/admin/api";

const PAGE = 50;

export default function AdminInvoices() {
  const [rows, setRows] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [bizId, setBizId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("businesses").select("id, name").order("name");
      setBusinesses(data ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("invoices")
        .select("id, invoice_number, type, status, total_amount, paid_amount, balance_amount, invoice_date, business_id, party_id", { count: "exact" })
        .order("invoice_date", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (type !== "all") q = q.eq("type", type as any);
      if (status !== "all") q = q.eq("status", status as any);
      if (bizId !== "all") q = q.eq("business_id", bizId);
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      const { data, count: c } = await q;
      setRows(data ?? []);
      setCount(c ?? 0);
      setLoading(false);
    })();
  }, [page, type, status, bizId, from, to]);

  const bizName = useMemo(() => {
    const m = new Map(businesses.map((b) => [b.id, b.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [businesses]);

  const pages = Math.ceil(count / PAGE);

  return (
    <div>
      <AdminTopbar title="Invoices" subtitle={`${count.toLocaleString()} invoices across all shopkeepers`} />
      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="sale_return">Sale return</SelectItem>
              <SelectItem value="purchase_return">Purchase return</SelectItem>
              <SelectItem value="quotation">Quotation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Shopkeeper</label>
          <Select value={bizId} onValueChange={(v) => { setBizId(v); setPage(0); }}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shopkeepers</SelectItem>
              {businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-40" />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Shopkeeper</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="font-mono text-xs">{r.invoice_number ?? r.id.slice(0, 8)}</TableCell>
                <TableCell className="capitalize text-sm">{r.type.replace("_", " ")}</TableCell>
                <TableCell><Link to={`/admin/shopkeepers/${r.business_id}`} className="hover:underline">{bizName(r.business_id)}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.invoice_date ? new Date(r.invoice_date).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="capitalize text-sm">{r.status}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(r.total_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(r.paid_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(r.balance_amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.max(1, pages)}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
