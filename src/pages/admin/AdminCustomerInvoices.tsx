import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { KpiCard } from "@/components/admin/KpiCard";
import { Plus, MoreHorizontal, FileText, Printer, Trash2, Loader2, Receipt, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/admin/api";

type LineItem = { description: string; qty: number; rate: number };

type SaasInvoice = {
  id: string;
  invoice_no: string;
  business_id: string;
  plan_id: string | null;
  line_items: LineItem[];
  subtotal: number;
  gst_percent: number;
  gst_amount: number;
  total: number;
  status: string;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
};

const STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"];

const nextInvoiceNo = (existing: string[]) => {
  const nums = existing
    .map((n) => Number((n.match(/(\d+)$/) || [])[1]))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `BL-INV-${String(next).padStart(4, "0")}`;
};

export default function AdminCustomerInvoices() {
  const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: inv }, { data: b }, { data: p }] = await Promise.all([
      supabase.from("saas_invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("businesses").select("id, name, email").order("name"),
      supabase.from("subscription_plans").select("id, name, price_inr, duration_days").order("price_inr"),
    ]);
    setInvoices((inv as any) ?? []);
    setBusinesses(b ?? []);
    setPlans(p ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const bizMap = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);

  const open = (i?: SaasInvoice) => {
    if (i) {
      setEditing({ ...i, line_items: Array.isArray(i.line_items) ? i.line_items : [] });
    } else {
      setEditing({
        id: "",
        invoice_no: nextInvoiceNo(invoices.map((x) => x.invoice_no)),
        business_id: "",
        plan_id: null,
        line_items: [{ description: "", qty: 1, rate: 0 }],
        gst_percent: 18,
        status: "draft",
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: "",
        notes: "",
      });
    }
  };

  const applyPlan = (planId: string) => {
    const p = plans.find((x) => x.id === planId);
    if (!p) return;
    setEditing((e: any) => ({
      ...e,
      plan_id: planId,
      line_items: [{ description: `${p.name} subscription (${p.duration_days} days)`, qty: 1, rate: Number(p.price_inr) }],
    }));
  };

  const totals = useMemo(() => {
    if (!editing) return { subtotal: 0, gst: 0, total: 0 };
    const subtotal = (editing.line_items as LineItem[]).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
    const gst = subtotal * (Number(editing.gst_percent) || 0) / 100;
    return { subtotal, gst, total: subtotal + gst };
  }, [editing]);

  const save = async () => {
    if (!editing.business_id) { toast.error("Select a shopkeeper"); return; }
    if (!editing.line_items.length || editing.line_items.every((l: LineItem) => !l.description)) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    const payload = {
      invoice_no: editing.invoice_no,
      business_id: editing.business_id,
      plan_id: editing.plan_id || null,
      line_items: editing.line_items,
      subtotal: totals.subtotal,
      gst_percent: Number(editing.gst_percent) || 0,
      gst_amount: totals.gst,
      total: totals.total,
      status: editing.status,
      issue_date: editing.issue_date,
      due_date: editing.due_date || null,
      notes: editing.notes || null,
    };
    const { error } = editing.id
      ? await supabase.from("saas_invoices").update(payload).eq("id", editing.id)
      : await supabase.from("saas_invoices").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Invoice updated" : "Invoice created");
    setEditing(null);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("saas_invoices").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Status updated"); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    const { error } = await supabase.from("saas_invoices").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  };

  const printInvoice = (inv: SaasInvoice) => {
    const biz = bizMap.get(inv.business_id);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${inv.invoice_no}</title>
      <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:780px;margin:auto;color:#111}
      h1{margin:0 0 4px;font-size:28px}h2{margin:32px 0 8px;font-size:16px}
      .row{display:flex;justify-content:space-between;gap:24px;margin-top:24px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{text-align:left;padding:10px;border-bottom:1px solid #e5e5e5}
      th{background:#f9fafb;font-size:12px;text-transform:uppercase;color:#666}
      .totals{margin-top:16px;text-align:right}.totals div{padding:4px 0}.totals .grand{font-weight:700;font-size:18px;border-top:2px solid #111;margin-top:8px;padding-top:8px}
      .muted{color:#666;font-size:13px}</style></head><body>
      <div class="row"><div><h1>Bill Look</h1><div class="muted">SaaS Invoice</div></div>
      <div style="text-align:right"><div><strong>Invoice #</strong> ${inv.invoice_no}</div>
      <div class="muted">Issued ${new Date(inv.issue_date).toLocaleDateString()}</div>
      ${inv.due_date ? `<div class="muted">Due ${new Date(inv.due_date).toLocaleDateString()}</div>` : ""}</div></div>
      <h2>Billed to</h2><div><strong>${biz?.name ?? ""}</strong><br/><span class="muted">${biz?.email ?? ""}</span></div>
      <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${inv.line_items.map((l) => `<tr><td>${l.description}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">₹${Number(l.rate).toLocaleString("en-IN")}</td><td style="text-align:right">₹${(l.qty * l.rate).toLocaleString("en-IN")}</td></tr>`).join("")}</tbody></table>
      <div class="totals"><div>Subtotal: ₹${Number(inv.subtotal).toLocaleString("en-IN")}</div>
      <div>GST (${inv.gst_percent}%): ₹${Number(inv.gst_amount).toLocaleString("en-IN")}</div>
      <div class="grand">Total: ₹${Number(inv.total).toLocaleString("en-IN")}</div></div>
      ${inv.notes ? `<h2>Notes</h2><div class="muted">${inv.notes}</div>` : ""}
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
  };

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const pending = invoices.filter((i) => ["sent", "overdue"].includes(i.status));
    return {
      outstanding: pending.reduce((s, i) => s + Number(i.total || 0), 0),
      paid: paid.reduce((s, i) => s + Number(i.total || 0), 0),
      pendingCount: pending.length,
    };
  }, [invoices]);

  const statusColor = (s: string) =>
    s === "paid" ? "bg-emerald-500/15 text-emerald-700"
    : s === "overdue" ? "bg-destructive/15 text-destructive"
    : s === "sent" ? "bg-blue-500/15 text-blue-700"
    : s === "cancelled" ? "bg-muted text-muted-foreground line-through"
    : "bg-muted text-muted-foreground";

  return (
    <div>
      <AdminTopbar
        title="Customer Invoices"
        subtitle="Issue invoices to shopkeepers for plans, manual deals or custom pricing"
        actions={<Button onClick={() => open()}><Plus className="h-4 w-4 mr-2" />New Invoice</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <KpiCard label="Outstanding" value={formatINR(stats.outstanding)} icon={Clock} loading={loading} />
        <KpiCard label="Pending invoices" value={stats.pendingCount} icon={Receipt} loading={loading} />
        <KpiCard label="Total paid (all time)" value={formatINR(stats.paid)} icon={CheckCircle2} loading={loading} />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Shopkeeper</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : invoices.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No invoices yet</TableCell></TableRow>
            ) : invoices.map((i) => {
              const biz = bizMap.get(i.business_id);
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-sm">{i.invoice_no}</TableCell>
                  <TableCell>
                    <div className="font-medium">{biz?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{biz?.email ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{new Date(i.issue_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatINR(i.total)}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColor(i.status)}>{i.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => open(i)}><FileText className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => printInvoice(i)}><Printer className="h-4 w-4 mr-2" />Print / PDF</DropdownMenuItem>
                        {STATUSES.filter((s) => s !== i.status).map((s) => (
                          <DropdownMenuItem key={s} onClick={() => updateStatus(i.id, s)} className="capitalize">Mark as {s}</DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => remove(i.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit invoice" : "New invoice"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div><Label>Invoice #</Label><Input value={editing.invoice_no} onChange={(e) => setEditing({ ...editing, invoice_no: e.target.value })} /></div>
                <div><Label>Issue date</Label><Input type="date" value={editing.issue_date} onChange={(e) => setEditing({ ...editing, issue_date: e.target.value })} /></div>
                <div><Label>Due date</Label><Input type="date" value={editing.due_date ?? ""} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Shopkeeper</Label>
                  <Select value={editing.business_id} onValueChange={(v) => setEditing({ ...editing, business_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quick-fill from plan</Label>
                  <Select value={editing.plan_id ?? ""} onValueChange={applyPlan}>
                    <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                    <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} – ₹{p.price_inr}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Line items</Label>
                <div className="space-y-2 mt-1">
                  {editing.line_items.map((l: LineItem, idx: number) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <Input className="col-span-6" placeholder="Description" value={l.description} onChange={(e) => {
                        const li = [...editing.line_items]; li[idx] = { ...li[idx], description: e.target.value }; setEditing({ ...editing, line_items: li });
                      }} />
                      <Input className="col-span-2" type="number" placeholder="Qty" value={l.qty} onChange={(e) => {
                        const li = [...editing.line_items]; li[idx] = { ...li[idx], qty: Number(e.target.value) }; setEditing({ ...editing, line_items: li });
                      }} />
                      <Input className="col-span-3" type="number" placeholder="Rate" value={l.rate} onChange={(e) => {
                        const li = [...editing.line_items]; li[idx] = { ...li[idx], rate: Number(e.target.value) }; setEditing({ ...editing, line_items: li });
                      }} />
                      <Button className="col-span-1" size="icon" variant="ghost" onClick={() => {
                        const li = editing.line_items.filter((_: any, i: number) => i !== idx); setEditing({ ...editing, line_items: li });
                      }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, line_items: [...editing.line_items, { description: "", qty: 1, rate: 0 }] })}>
                    <Plus className="h-4 w-4 mr-1" />Add line
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>GST %</Label>
                  <Input type="number" value={editing.gst_percent} onChange={(e) => setEditing({ ...editing, gst_percent: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} />
              </div>

              <Card className="p-4 bg-muted/30">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span className="tabular-nums">{formatINR(totals.subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span>GST ({editing.gst_percent}%)</span><span className="tabular-nums">{formatINR(totals.gst)}</span></div>
                <div className="flex justify-between font-semibold text-base mt-2 pt-2 border-t"><span>Total</span><span className="tabular-nums">{formatINR(totals.total)}</span></div>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
