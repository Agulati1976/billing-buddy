import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BookOpen, Loader2, Search, FileText, Wallet, Download, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import { downloadCsv } from "@/lib/csv";

interface PartyLite {
  id: string;
  name: string;
  type: "customer" | "supplier";
  phone: string | null;
  opening_balance: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  type: string;
  party_id: string | null;
}

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  invoice_id: string | null;
  direction: "in" | "out";
  notes: string | null;
  party_id: string | null;
}

type LedgerEntry = {
  date: string;
  ref: string;
  description: string;
  link?: string;
  debit: number;
  credit: number;
  running: number;
  kind: "opening" | "invoice" | "payment";
};

function computeLedger(party: PartyLite, invoices: InvoiceRow[], payments: PaymentRow[]): LedgerEntry[] {
  const isCustomer = party.type === "customer";
  const events: Array<{ sortKey: string; build: (running: number) => LedgerEntry }> = [];

  const opening = Number(party.opening_balance || 0);
  if (opening !== 0) {
    events.push({
      sortKey: "0", build: (run) => ({
        date: "—", ref: "Opening", description: "Opening balance",
        debit: opening > 0 ? opening : 0,
        credit: opening < 0 ? -opening : 0,
        running: run, kind: "opening",
      }),
    });
  }
  for (const inv of invoices) {
    const t = inv.type;
    let debit = 0, credit = 0;
    if (isCustomer) {
      if (t === "sale") debit = Number(inv.total_amount);
      else if (t === "sale_return") credit = Number(inv.total_amount);
    } else {
      if (t === "purchase") credit = Number(inv.total_amount);
      else if (t === "purchase_return") debit = Number(inv.total_amount);
    }
    if (debit === 0 && credit === 0) continue;
    const route = t === "purchase" || t === "purchase_return" ? "/purchases"
      : t === "sale_return" ? "/sale_returns" : "/sales";
    events.push({
      sortKey: `${inv.invoice_date}-1-${inv.invoice_number}`,
      build: (run) => ({
        date: inv.invoice_date, ref: inv.invoice_number,
        description: t.replace("_", " "),
        link: `${route}/${inv.id}`,
        debit, credit, running: run, kind: "invoice",
      }),
    });
  }
  for (const p of payments) {
    let debit = 0, credit = 0;
    if (isCustomer) {
      if (p.direction === "in") credit = Number(p.amount);
      else debit = Number(p.amount);
    } else {
      if (p.direction === "out") debit = Number(p.amount);
      else credit = Number(p.amount);
    }
    events.push({
      sortKey: `${p.payment_date}-2-${p.id}`,
      build: (run) => ({
        date: p.payment_date, ref: p.reference || "Payment",
        description: `${p.direction === "in" ? "Received" : "Paid"} (${p.method})${p.notes ? ` · ${p.notes}` : ""}`,
        debit, credit, running: run, kind: "payment",
      }),
    });
  }
  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  let running = 0;
  const out: LedgerEntry[] = [];
  for (const e of events) {
    const tmp = e.build(0);
    running += tmp.debit - tmp.credit;
    out.push({ ...tmp, running });
  }
  return out;
}

export default function PartyLedger() {
  const { current } = useBusiness();
  const [search, setSearch] = useSearchParams();
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceRow[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentRow[]>([]);
  const [filter, setFilter] = useState<"all" | "customer" | "supplier">("all");
  const [q, setQ] = useState("");
  const [partyId, setPartyId] = useState<string>(search.get("party") || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    (async () => {
      const [pRes, iRes, payRes] = await Promise.all([
        supabase.from("parties").select("id,name,type,phone,opening_balance")
          .eq("business_id", current.id).order("name"),
        supabase.from("invoices")
          .select("id,invoice_number,invoice_date,total_amount,type,party_id")
          .eq("business_id", current.id).is("deleted_at", null)
          .neq("type", "quotation").not("party_id", "is", null).order("invoice_date"),
        supabase.from("payments")
          .select("id,payment_date,amount,method,reference,invoice_id,direction,notes,party_id")
          .eq("business_id", current.id).is("deleted_at", null)
          .not("party_id", "is", null).order("payment_date"),
      ]);
      if (pRes.error) toast.error(pRes.error.message);
      setParties((pRes.data as PartyLite[]) ?? []);
      setAllInvoices((iRes.data as InvoiceRow[]) ?? []);
      setAllPayments((payRes.data as PaymentRow[]) ?? []);
      setLoading(false);
    })();
  }, [current?.id]);

  useEffect(() => {
    setSearch((s) => {
      const n = new URLSearchParams(s);
      if (partyId) n.set("party", partyId); else n.delete("party");
      return n;
    }, { replace: true });
  }, [partyId]);

  // Per-party computed totals
  const summary = useMemo(() => {
    const invByParty = new Map<string, InvoiceRow[]>();
    const payByParty = new Map<string, PaymentRow[]>();
    for (const i of allInvoices) {
      if (!i.party_id) continue;
      (invByParty.get(i.party_id) ?? invByParty.set(i.party_id, []).get(i.party_id)!).push(i);
    }
    for (const p of allPayments) {
      if (!p.party_id) continue;
      (payByParty.get(p.party_id) ?? payByParty.set(p.party_id, []).get(p.party_id)!).push(p);
    }
    return parties.map((p) => {
      const entries = computeLedger(p, invByParty.get(p.id) ?? [], payByParty.get(p.id) ?? []);
      const debit = entries.reduce((s, e) => s + e.debit, 0);
      const credit = entries.reduce((s, e) => s + e.credit, 0);
      return { party: p, debit, credit, balance: debit - credit, count: entries.length };
    });
  }, [parties, allInvoices, allPayments]);

  const filteredSummary = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return summary
      .filter((s) => filter === "all" ? true : s.party.type === filter)
      .filter((s) => !needle || s.party.name.toLowerCase().includes(needle) || (s.party.phone || "").includes(needle));
  }, [summary, filter, q]);

  const grandTotals = useMemo(() => {
    const debit = filteredSummary.reduce((s, r) => s + r.debit, 0);
    const credit = filteredSummary.reduce((s, r) => s + r.credit, 0);
    const receivable = filteredSummary.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);
    const payable = filteredSummary.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0);
    return { debit, credit, receivable, payable };
  }, [filteredSummary]);

  // Selected party detail
  const selected = useMemo(() => summary.find((s) => s.party.id === partyId) || null, [summary, partyId]);
  const detailEntries = useMemo(() => {
    if (!selected) return [];
    return computeLedger(
      selected.party,
      allInvoices.filter((i) => i.party_id === selected.party.id),
      allPayments.filter((p) => p.party_id === selected.party.id),
    );
  }, [selected, allInvoices, allPayments]);

  const exportSummaryCsv = () => {
    const rows: (string | number)[][] = [
      ["Name", "Type", "Phone", "Debit", "Credit", "Balance", "Receivable/Payable"],
      ...filteredSummary.map((r) => [
        r.party.name, r.party.type, r.party.phone || "",
        r.debit.toFixed(2), r.credit.toFixed(2),
        r.balance.toFixed(2),
        r.balance > 0 ? "Receivable" : r.balance < 0 ? "Payable" : "Settled",
      ]),
      [],
      ["", "", "Totals", grandTotals.debit.toFixed(2), grandTotals.credit.toFixed(2),
        (grandTotals.debit - grandTotals.credit).toFixed(2), ""],
    ];
    downloadCsv("party-ledger-summary.csv", rows);
  };

  const exportDetailCsv = () => {
    if (!selected) return;
    const rows: (string | number)[][] = [
      ["Date", "Ref", "Description", "Debit", "Credit", "Balance"],
      ...detailEntries.map((e) => [
        e.date, e.ref, e.description,
        e.debit ? e.debit.toFixed(2) : "",
        e.credit ? e.credit.toFixed(2) : "",
        e.running.toFixed(2),
      ]),
    ];
    downloadCsv(`ledger-${selected.party.name.replace(/\s+/g, "_")}.csv`, rows);
  };

  // ---------------- DETAIL VIEW ----------------
  if (selected) {
    const isCustomer = selected.party.type === "customer";
    const balanceLabel = selected.balance >= 0
      ? (isCustomer ? "Receivable from party" : "Party owes us")
      : (isCustomer ? "Advance / we owe party" : "Payable to supplier");
    return (
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setPartyId("")} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Back to all parties
          </Button>
          <Button variant="outline" size="sm" onClick={exportDetailCsv} className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">{selected.party.type}</div>
          <Link to={`/${isCustomer ? "customers" : "suppliers"}/${selected.party.id}`}
            className="text-xl font-semibold hover:underline">{selected.party.name}</Link>
          {selected.party.phone && <div className="text-sm text-muted-foreground">{selected.party.phone}</div>}
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Total Debit</div>
            <div className="text-2xl font-semibold num mt-1">{formatINR(selected.debit)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Total Credit</div>
            <div className="text-2xl font-semibold num mt-1 text-green-600 dark:text-green-500">{formatINR(selected.credit)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">{balanceLabel}</div>
            <div className={`text-2xl font-semibold num mt-1 ${selected.balance > 0 ? "text-destructive" : selected.balance < 0 ? "text-green-600 dark:text-green-500" : ""}`}>
              {formatINR(Math.abs(selected.balance))}
            </div>
          </Card>
        </div>
        <Card>
          <div className="p-4 border-b flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Ledger entries</h2>
            <Badge variant="secondary" className="ml-1">{detailEntries.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No transactions yet.</TableCell></TableRow>
                ) : detailEntries.map((e, i) => (
                  <TableRow key={i} className="hover:bg-muted/40">
                    <TableCell className="text-sm whitespace-nowrap">{e.date}</TableCell>
                    <TableCell className="font-medium">
                      {e.link ? <Link to={e.link} className="text-primary hover:underline">{e.ref}</Link> : e.ref}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{e.description}</TableCell>
                    <TableCell className="text-right num">{e.debit ? formatINR(e.debit) : "—"}</TableCell>
                    <TableCell className="text-right num text-green-600 dark:text-green-500">{e.credit ? formatINR(e.credit) : "—"}</TableCell>
                    <TableCell className="text-right num font-semibold">
                      {formatINR(Math.abs(e.running))}{e.running < 0 ? " Cr" : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    );
  }

  // ---------------- SUMMARY (DEFAULT) VIEW ----------------
  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Party Ledger</h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportSummaryCsv} className="gap-1.5"
          disabled={filteredSummary.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Debit</div>
          <div className="text-2xl font-semibold num mt-1">{formatINR(grandTotals.debit)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Credit</div>
          <div className="text-2xl font-semibold num mt-1 text-green-600 dark:text-green-500">{formatINR(grandTotals.credit)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Receivable</div>
          <div className="text-2xl font-semibold num mt-1 text-destructive">{formatINR(grandTotals.receivable)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Payable</div>
          <div className="text-2xl font-semibold num mt-1">{formatINR(grandTotals.payable)}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="text-xs text-muted-foreground">Type</label>
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="supplier">Suppliers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" className="pl-8" />
            </div>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="p-4 border-b flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">All parties</h2>
          <Badge variant="secondary" className="ml-1">{filteredSummary.length}</Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden p-3 space-y-2">
              {filteredSummary.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No parties.</div>
              ) : filteredSummary.map((r) => (
                <button key={r.party.id} onClick={() => setPartyId(r.party.id)} className="block w-full text-left">
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{r.party.name}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">{r.party.type}{r.party.phone ? ` · ${r.party.phone}` : ""}</div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{r.count} txn</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div><span className="text-muted-foreground">Dr:</span> <span className="num">{formatINR(r.debit)}</span></div>
                      <div><span className="text-muted-foreground">Cr:</span> <span className="num text-green-600">{formatINR(r.credit)}</span></div>
                      <div className="text-right">
                        <span className="text-muted-foreground">Bal:</span>{" "}
                        <span className={`num font-semibold ${r.balance > 0 ? "text-destructive" : r.balance < 0 ? "text-green-600" : ""}`}>
                          {formatINR(Math.abs(r.balance))}{r.balance < 0 ? " Cr" : ""}
                        </span>
                      </div>
                    </div>
                  </Card>
                </button>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummary.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No parties.</TableCell></TableRow>
                  ) : filteredSummary.map((r) => (
                    <TableRow key={r.party.id} className="hover:bg-muted/40 cursor-pointer"
                      onClick={() => setPartyId(r.party.id)}>
                      <TableCell className="font-medium text-primary">{r.party.name}</TableCell>
                      <TableCell className="text-sm capitalize">{r.party.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.party.phone || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{r.count}</TableCell>
                      <TableCell className="text-right num">{formatINR(r.debit)}</TableCell>
                      <TableCell className="text-right num text-green-600 dark:text-green-500">{formatINR(r.credit)}</TableCell>
                      <TableCell className={`text-right num font-semibold ${r.balance > 0 ? "text-destructive" : r.balance < 0 ? "text-green-600 dark:text-green-500" : ""}`}>
                        {formatINR(Math.abs(r.balance))}{r.balance < 0 ? " Cr" : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSummary.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={4} className="text-right">Totals</TableCell>
                      <TableCell className="text-right num">{formatINR(grandTotals.debit)}</TableCell>
                      <TableCell className="text-right num text-green-600 dark:text-green-500">{formatINR(grandTotals.credit)}</TableCell>
                      <TableCell className="text-right num">
                        {formatINR(Math.abs(grandTotals.debit - grandTotals.credit))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
