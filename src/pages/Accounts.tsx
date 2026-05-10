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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wallet, Banknote, Smartphone, CreditCard, FileText, Wallet2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { formatINR } from "@/lib/states";
import { format, startOfMonth } from "date-fns";
import { DateRangeFilter, rangeFor, useDateFilter, type DatePreset } from "@/components/DateRangeFilter";

type Direction = "in" | "out";
type Method = "cash" | "bank" | "upi" | "cheque" | "card" | "other";

interface PaymentRow {
  id: string;
  source: "payment";
  direction: Direction;
  method: Method;
  amount: number;
  date: string;
  reference: string | null;
  notes: string | null;
  party_name: string | null;
  invoice_number: string | null;
  category: string | null;
}
interface ExpenseRow {
  id: string;
  source: "expense";
  direction: "out";
  method: Method;
  amount: number;
  date: string;
  reference: string | null;
  notes: string | null;
  party_name: null;
  invoice_number: null;
  category: string;
}
type LedgerRow = PaymentRow | ExpenseRow;

interface Party { id: string; name: string; type: "customer" | "supplier"; }

const METHOD_META: { key: Method; label: string; icon: any; tone: string }[] = [
  { key: "cash",   label: "Cash",   icon: Banknote,   tone: "bg-success-soft text-success" },
  { key: "bank",   label: "Bank",   icon: Wallet2,    tone: "bg-primary-soft text-primary" },
  { key: "upi",    label: "UPI",    icon: Smartphone, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  { key: "card",   label: "Card",   icon: CreditCard, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { key: "cheque", label: "Cheque", icon: FileText,   tone: "bg-warning-soft text-warning" },
  { key: "other",  label: "Other",  icon: Wallet,     tone: "bg-muted text-muted-foreground" },
];

export default function Accounts() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<Direction>("in");
  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState<string>("");
  const [category, setCategory] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // filters
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<Method | "all">("all");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const [pays, exps, prt] = await Promise.all([
      supabase.from("payments")
        .select("id, direction, method, amount, payment_date, reference, notes, parties(name), invoices(invoice_number)")
        .eq("business_id", current.id),
      supabase.from("expenses")
        .select("id, category, method, amount, expense_date, reference, description")
        .eq("business_id", current.id),
      supabase.from("parties").select("id, name, type").eq("business_id", current.id).order("name"),
    ]);
    const p: PaymentRow[] = ((pays.data as any[]) ?? []).map((r) => {
      // Manual entries store category prefix in notes as "[Category] rest"
      let cat: string | null = null;
      let cleanNotes = r.notes as string | null;
      if (cleanNotes) {
        const m = cleanNotes.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (m) { cat = m[1]; cleanNotes = m[2] || null; }
      }
      return {
        id: r.id, source: "payment", direction: r.direction, method: r.method,
        amount: Number(r.amount), date: r.payment_date,
        reference: r.reference, notes: cleanNotes,
        party_name: r.parties?.name ?? null,
        invoice_number: r.invoices?.invoice_number ?? null,
        category: cat,
      };
    });
    const e: ExpenseRow[] = ((exps.data as any[]) ?? []).map((r) => ({
      id: r.id, source: "expense", direction: "out", method: r.method,
      amount: Number(r.amount), date: r.expense_date,
      reference: r.reference, notes: r.description,
      party_name: null, invoice_number: null,
      category: r.category,
    }));
    const merged = [...p, ...e].sort((a, b) => (a.date < b.date ? 1 : -1));
    setRows(merged);
    setParties((prt.data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [current?.id]);

  const dateFiltered = useDateFilter(rows, (r) => r.date, range);
  const methodFiltered = useMemo(
    () => methodFilter === "all" ? dateFiltered : dateFiltered.filter((r) => r.method === methodFilter),
    [dateFiltered, methodFilter],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return methodFiltered;
    return methodFiltered.filter((r) => [r.party_name, r.invoice_number, r.method, r.reference, r.notes, r.category]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [methodFiltered, search]);

  // balance per method (uses date-filtered rows; ignores method filter so cards always show all)
  const perMethod = useMemo(() => {
    const map: Record<Method, { in: number; out: number }> = {
      cash: { in: 0, out: 0 }, bank: { in: 0, out: 0 }, upi: { in: 0, out: 0 },
      card: { in: 0, out: 0 }, cheque: { in: 0, out: 0 }, other: { in: 0, out: 0 },
    };
    for (const r of dateFiltered) {
      const m = (map[r.method] ?? map.other);
      if (r.direction === "in") m.in += r.amount; else m.out += r.amount;
    }
    return map;
  }, [dateFiltered]);

  const totals = useMemo(() => {
    const inAmt = dateFiltered.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
    const outAmt = dateFiltered.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);
    return { inAmt, outAmt, net: inAmt - outAmt };
  }, [dateFiltered]);

  const submit = async () => {
    if (!current || !user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const tag = category.trim();
    const composedNotes = [tag ? `[${tag}]` : "", notes.trim()].filter(Boolean).join(" ");
    const res = await omInsert("payments", {
      business_id: current.id,
      direction, method, amount: amt,
      payment_date: date,
      party_id: partyId || null,
      reference: reference.trim() || null,
      notes: composedNotes || null,
      created_by: user.id,
    });
    setSaving(false);
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    toast.success(res.queued ? "Saved offline — will sync" : "Entry recorded");
    setOpen(false);
    setAmount(""); setReference(""); setNotes(""); setCategory(""); setPartyId("");
    load();
  };

  const filteredParties = parties.filter((p) =>
    direction === "in" ? p.type === "customer" : p.type === "supplier"
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Accounts
          </h1>
          <p className="text-sm text-muted-foreground">Track every rupee in and out — including manual book entries.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Entry
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground flex items-center gap-1.5"><ArrowDownLeft className="h-4 w-4 text-success" /> Money In</div>
          <div className="text-2xl font-semibold mt-1 num text-success">{formatINR(totals.inAmt)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground flex items-center gap-1.5"><ArrowUpRight className="h-4 w-4 text-danger" /> Money Out</div>
          <div className="text-2xl font-semibold mt-1 num text-danger">{formatINR(totals.outAmt)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Net Balance</div>
          <div className={`text-2xl font-semibold mt-1 num ${totals.net >= 0 ? "text-success" : "text-danger"}`}>{formatINR(totals.net)}</div>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground">By account</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {METHOD_META.map((m) => {
            const v = perMethod[m.key];
            const net = v.in - v.out;
            return (
              <Card key={m.key} className="p-3 cursor-pointer hover:border-primary/40 transition" onClick={() => setMethodFilter(methodFilter === m.key ? "all" : m.key)}>
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${m.tone}`}>
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium">{m.label}</div>
                </div>
                <div className={`mt-2 text-lg font-semibold num ${net >= 0 ? "" : "text-danger"}`}>{formatINR(net)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="text-success">+{formatINR(v.in)}</span> · <span className="text-danger">−{formatINR(v.out)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <SearchBar value={search} onChange={setSearch} placeholder="Search party, invoice, category, notes…" className="max-w-md flex-1 min-w-[220px]" />
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
        </div>

        <Tabs value={methodFilter} onValueChange={(v) => setMethodFilter(v as any)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            {METHOD_META.map((m) => <TabsTrigger key={m.key} value={m.key}>{m.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No entries</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {visible.map((r) => (
                <Card key={`${r.source}-${r.id}`} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate text-sm">
                        {r.party_name ?? r.category ?? (r.source === "expense" ? "Expense" : "Manual entry")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(new Date(r.date), "dd MMM yyyy")} · <span className="capitalize">{r.method}</span>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold num shrink-0 ${r.direction === "in" ? "text-success" : "text-danger"}`}>
                      {r.direction === "in" ? "+" : "−"}{formatINR(r.amount)}
                    </div>
                  </div>
                  {(r.invoice_number || r.reference || r.notes) && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[r.invoice_number, r.reference, r.notes].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </Card>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={`${r.source}-${r.id}`}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded ${r.direction === "in" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                          {r.direction === "in" ? "IN" : "OUT"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="font-medium truncate">
                          {r.party_name ?? r.category ?? (r.source === "expense" ? "Expense" : "Manual entry")}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[r.invoice_number, r.reference, r.notes].filter(Boolean).join(" · ") || (r.source === "expense" ? "Expense" : "—")}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{r.method}</TableCell>
                      <TableCell className={`text-right num font-medium ${r.direction === "in" ? "text-success" : "text-danger"}`}>
                        {r.direction === "in" ? "+" : "−"}{formatINR(r.amount)}
                      </TableCell>
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
          <DialogHeader><DialogTitle>Add Account Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Direction *</Label>
                <Select value={direction} onValueChange={(v: Direction) => { setDirection(v); setPartyId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Money In (received)</SelectItem>
                    <SelectItem value="out">Money Out (paid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Method *</Label>
                <Select value={method} onValueChange={(v: Method) => setMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHOD_META.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category / reason (optional)</Label>
              <Input list="account-cats" value={category} maxLength={60}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Owner deposit, Cash to bank, Refund…" />
              <datalist id="account-cats">
                <option value="Owner deposit" />
                <option value="Owner withdrawal" />
                <option value="Cash to bank" />
                <option value="Bank to cash" />
                <option value="Refund" />
                <option value="Loan received" />
                <option value="Loan repayment" />
                <option value="Opening balance" />
                <option value="Other" />
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Party (optional)</Label>
              <Select value={partyId || "none"} onValueChange={(v) => setPartyId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No party (manual entry)</SelectItem>
                  {filteredParties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reference (cheque #, txn id)</Label>
              <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Entry"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
