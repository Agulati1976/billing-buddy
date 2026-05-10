import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { omInsert } from "@/lib/offlineMutate";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { formatINR } from "@/lib/states";
import { format, startOfMonth } from "date-fns";
import { DateRangeFilter, rangeFor, useDateFilter, type DatePreset } from "@/components/DateRangeFilter";

interface PaymentRow {
  id: string;
  direction: "in" | "out";
  method: string;
  amount: number;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  party_id: string | null;
  invoice_id: string | null;
  parties: { name: string } | null;
  invoices: { invoice_number: string } | null;
}

interface Party { id: string; name: string; type: "customer" | "supplier"; }
interface Invoice { id: string; invoice_number: string; balance_amount: number; type: string; }

export default function Payments() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const dateFiltered = useDateFilter(rows, (r) => r.payment_date, range);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter((r) => [r.parties?.name, r.invoices?.invoice_number, r.method, r.reference, r.notes].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [dateFiltered, search]);

  const load = async () => {
    if (!current) return;
    const [pays, prt] = await Promise.all([
      supabase.from("payments")
        .select("id, direction, method, amount, payment_date, reference, notes, party_id, invoice_id, parties(name), invoices(invoice_number)")
        .eq("business_id", current.id).order("payment_date", { ascending: false }),
      supabase.from("parties").select("id, name, type").eq("business_id", current.id).order("name"),
    ]);
    setRows((pays.data as any) ?? []);
    setParties((prt.data as any) ?? []);
  };
  useEffect(() => { load(); }, [current?.id]);

  // Load invoices for selected party
  useEffect(() => {
    if (!current || !partyId) { setInvoices([]); return; }
    const wantType = direction === "in" ? "sale" : "purchase";
    supabase.from("invoices")
      .select("id, invoice_number, balance_amount, type")
      .eq("business_id", current.id)
      .eq("party_id", partyId)
      .eq("type", wantType)
      .gt("balance_amount", 0)
      .then(({ data }) => setInvoices((data as any) ?? []));
  }, [partyId, direction, current?.id]);

  const submit = async () => {
    if (!current || !user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!partyId) { toast.error("Select a party"); return; }
    setSaving(true);
    const res = await omInsert("payments", {
      business_id: current.id,
      direction, method: method as any, amount: amt,
      payment_date: date, party_id: partyId,
      invoice_id: invoiceId || null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      created_by: user.id,
    });
    setSaving(false);
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    toast.success(res.queued ? "Saved offline — will sync" : "Payment recorded");
    setOpen(false);
    setAmount(""); setReference(""); setNotes(""); setInvoiceId(""); setPartyId("");
    load();
  };

  const totals = useMemo(() => {
    const inAmt = dateFiltered.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0);
    const outAmt = dateFiltered.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0);
    return { inAmt, outAmt, net: inAmt - outAmt };
  }, [dateFiltered]);

  const filteredParties = parties.filter((p) =>
    direction === "in" ? p.type === "customer" : p.type === "supplier"
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">Money in & money out</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Money In</div>
          <div className="text-2xl font-semibold mt-1 num text-success">{formatINR(totals.inAmt)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Money Out</div>
          <div className="text-2xl font-semibold mt-1 num text-danger">{formatINR(totals.outAmt)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Net Cashflow</div>
          <div className="text-2xl font-semibold mt-1 num">{formatINR(totals.net)}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by party, invoice, method, reference…" className="max-w-md flex-1 min-w-[220px]" />
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
        </div>
        {filteredRows.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{rows.length === 0 ? "No payments yet" : "No matches"}</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {filteredRows.map((r) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate text-sm">{r.parties?.name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(new Date(r.payment_date), "dd MMM yyyy")} · <span className="capitalize">{r.method}</span>
                        {r.invoices?.invoice_number && ` · ${r.invoices.invoice_number}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.direction === "in" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                        {r.direction === "in" ? "IN" : "OUT"}
                      </span>
                      <div className="text-sm font-semibold num mt-0.5">{formatINR(Number(r.amount))}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{format(new Date(r.payment_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded ${r.direction === "in" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                          {r.direction === "in" ? "IN" : "OUT"}
                        </span>
                      </TableCell>
                      <TableCell>{r.parties?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.invoices?.invoice_number ?? "—"}</TableCell>
                      <TableCell className="capitalize">{r.method}</TableCell>
                      <TableCell className="text-right num font-medium">{formatINR(Number(r.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select value={direction} onValueChange={(v: "in" | "out") => { setDirection(v); setPartyId(""); setInvoiceId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Money In (received)</SelectItem>
                    <SelectItem value="out">Money Out (paid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{direction === "in" ? "Customer" : "Supplier"} *</Label>
              <Select value={partyId} onValueChange={(v) => { setPartyId(v); setInvoiceId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select party" /></SelectTrigger>
                <SelectContent>
                  {filteredParties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {partyId && invoices.length > 0 && (
              <div className="space-y-2">
                <Label>Against Invoice (optional)</Label>
                <Select value={invoiceId} onValueChange={setInvoiceId}>
                  <SelectTrigger><SelectValue placeholder="On account (no specific invoice)" /></SelectTrigger>
                  <SelectContent>
                    {invoices.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.invoice_number} · Balance {formatINR(Number(i.balance_amount))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reference (cheque #, txn id)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
