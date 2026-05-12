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
import { BookOpen, Loader2, Search, FileText, Wallet, Download } from "lucide-react";
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
  type: string; // sale | purchase | sale_return | purchase_return | quotation
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
}

type LedgerEntry = {
  date: string;
  ref: string;
  description: string;
  link?: string;
  debit: number;   // increases what party owes us (receivable)
  credit: number;  // decreases receivable
  running: number; // running outstanding (positive = party owes us; negative = we owe party)
  kind: "opening" | "invoice" | "payment";
};

export default function PartyLedger() {
  const { current } = useBusiness();
  const [search, setSearch] = useSearchParams();
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [filter, setFilter] = useState<"all" | "customer" | "supplier">("all");
  const [q, setQ] = useState("");
  const [partyId, setPartyId] = useState<string>(search.get("party") || "");
  const [party, setParty] = useState<PartyLite | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Load parties list
  useEffect(() => {
    if (!current) return;
    (async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name,type,phone,opening_balance")
        .eq("business_id", current.id)
        .order("name");
      if (error) toast.error(error.message);
      setParties((data as PartyLite[]) ?? []);
    })();
  }, [current?.id]);

  // Load ledger for selected party
  useEffect(() => {
    if (!current || !partyId) {
      setParty(null); setInvoices([]); setPayments([]);
      return;
    }
    setLoading(true);
    (async () => {
      const [pRes, iRes, payRes] = await Promise.all([
        supabase.from("parties").select("id,name,type,phone,opening_balance")
          .eq("id", partyId).maybeSingle(),
        supabase.from("invoices")
          .select("id,invoice_number,invoice_date,total_amount,type")
          .eq("business_id", current.id).eq("party_id", partyId)
          .is("deleted_at", null)
          .neq("type", "quotation")
          .order("invoice_date"),
        supabase.from("payments")
          .select("id,payment_date,amount,method,reference,invoice_id,direction,notes")
          .eq("business_id", current.id).eq("party_id", partyId)
          .is("deleted_at", null)
          .order("payment_date"),
      ]);
      if (pRes.error) toast.error(pRes.error.message);
      setParty((pRes.data as PartyLite) ?? null);
      setInvoices((iRes.data as InvoiceRow[]) ?? []);
      setPayments((payRes.data as PaymentRow[]) ?? []);
      setLoading(false);
    })();
    setSearch((s) => { const n = new URLSearchParams(s); n.set("party", partyId); return n; }, { replace: true });
  }, [current?.id, partyId]);

  const filteredParties = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parties
      .filter((p) => filter === "all" ? true : p.type === filter)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.phone || "").includes(needle));
  }, [parties, filter, q]);

  const ledger = useMemo<LedgerEntry[]>(() => {
    if (!party) return [];
    const isCustomer = party.type === "customer";
    const events: Array<{ date: string; sortKey: string; build: (running: number) => LedgerEntry }> = [];

    // Opening balance: positive means party owes us
    const opening = Number(party.opening_balance || 0);
    if (opening !== 0) {
      events.push({
        date: "0000-00-00", sortKey: "0", build: (run) => ({
          date: "—", ref: "Opening", description: "Opening balance",
          debit: opening > 0 ? opening : 0,
          credit: opening < 0 ? -opening : 0,
          running: run, kind: "opening",
        }),
      });
    }

    // Invoices
    for (const inv of invoices) {
      // For customers: sale = debit, sale_return = credit
      // For suppliers: purchase = credit (we owe), purchase_return = debit
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
        date: inv.invoice_date, sortKey: `${inv.invoice_date}-1-${inv.invoice_number}`,
        build: (run) => ({
          date: inv.invoice_date, ref: inv.invoice_number,
          description: t.replace("_", " "),
          link: `${route}/${inv.id}`,
          debit, credit, running: run, kind: "invoice",
        }),
      });
    }

    // Payments
    for (const p of payments) {
      // Customer: direction "in" = credit (reduces receivable). "out" (refund) = debit.
      // Supplier: direction "out" = debit (reduces our payable). "in" (refund received) = credit.
      let debit = 0, credit = 0;
      if (isCustomer) {
        if (p.direction === "in") credit = Number(p.amount);
        else debit = Number(p.amount);
      } else {
        if (p.direction === "out") debit = Number(p.amount);
        else credit = Number(p.amount);
      }
      events.push({
        date: p.payment_date, sortKey: `${p.payment_date}-2-${p.id}`,
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
  }, [party, invoices, payments]);

  const totals = useMemo(() => {
    const debit = ledger.reduce((s, e) => s + e.debit, 0);
    const credit = ledger.reduce((s, e) => s + e.credit, 0);
    const balance = debit - credit;
    return { debit, credit, balance };
  }, [ledger]);

  const isCustomer = party?.type === "customer";
  const balanceLabel = totals.balance >= 0
    ? (isCustomer ? "Receivable from party" : "Party owes us")
    : (isCustomer ? "Advance / we owe party" : "Payable to supplier");

  const exportCsv = () => {
    if (!party) return;
    const rows = [
      ["Date", "Ref", "Description", "Debit", "Credit", "Balance"],
      ...ledger.map((e) => [
        e.date, e.ref, e.description,
        e.debit ? e.debit.toFixed(2) : "",
        e.credit ? e.credit.toFixed(2) : "",
        e.running.toFixed(2),
      ]),
      [],
      ["", "", "Totals", totals.debit.toFixed(2), totals.credit.toFixed(2), totals.balance.toFixed(2)],
    ];
    downloadCsv(`ledger-${party.name.replace(/\s+/g, "_")}.csv`, rows);
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Party Ledger</h1>
      </div>

      {/* Picker */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">Select party</label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a customer or supplier" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {filteredParties.length === 0 && (
                  <div className="px-3 py-6 text-sm text-muted-foreground text-center">No parties found.</div>
                )}
                {filteredParties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="capitalize text-xs text-muted-foreground mr-2">{p.type}</span>
                    {p.name}{p.phone ? ` · ${p.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" className="pl-8" />
            </div>
          </div>
        </div>
      </Card>

      {!partyId ? (
        <Card className="p-10 text-center text-muted-foreground">
          Select a party above to view their ledger.
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading ledger…
        </div>
      ) : party ? (
        <>
          {/* Header strip */}
          <Card className="p-4 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">{party.type}</div>
              <Link to={`/${party.type === "customer" ? "customers" : "suppliers"}/${party.id}`}
                className="text-xl font-semibold hover:underline">{party.name}</Link>
              {party.phone && <div className="text-sm text-muted-foreground">{party.phone}</div>}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </Card>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Total Debit
              </div>
              <div className="text-2xl font-semibold num mt-1">{formatINR(totals.debit)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" /> Total Credit
              </div>
              <div className="text-2xl font-semibold num mt-1 text-green-600 dark:text-green-500">
                {formatINR(totals.credit)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">{balanceLabel}</div>
              <div className={`text-2xl font-semibold num mt-1 ${totals.balance > 0 ? "text-destructive" : totals.balance < 0 ? "text-green-600 dark:text-green-500" : ""}`}>
                {formatINR(Math.abs(totals.balance))}
              </div>
            </Card>
          </div>

          {/* Ledger table */}
          <Card>
            <div className="p-4 border-b flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Ledger entries</h2>
              <Badge variant="secondary" className="ml-1">{ledger.length}</Badge>
            </div>

            {/* Mobile */}
            <div className="sm:hidden p-3 space-y-2">
              {ledger.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No transactions yet.</div>
              ) : ledger.map((e, i) => {
                const inner = (
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{e.ref}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">{e.date} · {e.description}</div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 capitalize text-[10px]">{e.kind}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div><span className="text-muted-foreground">Debit:</span> <span className="num">{e.debit ? formatINR(e.debit) : "—"}</span></div>
                      <div><span className="text-muted-foreground">Credit:</span> <span className="num text-green-600">{e.credit ? formatINR(e.credit) : "—"}</span></div>
                      <div className="text-right"><span className="text-muted-foreground">Bal:</span> <span className="num font-semibold">{formatINR(Math.abs(e.running))}{e.running < 0 ? " Cr" : ""}</span></div>
                    </div>
                  </Card>
                );
                return e.link ? <Link key={i} to={e.link} className="block">{inner}</Link> : <div key={i}>{inner}</div>;
              })}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
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
                  {ledger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  ) : ledger.map((e, i) => (
                    <TableRow key={i} className="hover:bg-muted/40">
                      <TableCell className="text-sm whitespace-nowrap">{e.date}</TableCell>
                      <TableCell className="font-medium">
                        {e.link ? <Link to={e.link} className="text-primary hover:underline">{e.ref}</Link> : e.ref}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{e.description}</TableCell>
                      <TableCell className="text-right num">{e.debit ? formatINR(e.debit) : "—"}</TableCell>
                      <TableCell className="text-right num text-green-600 dark:text-green-500">
                        {e.credit ? formatINR(e.credit) : "—"}
                      </TableCell>
                      <TableCell className="text-right num font-semibold">
                        {formatINR(Math.abs(e.running))}{e.running < 0 ? " Cr" : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                  {ledger.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={3} className="text-right">Totals</TableCell>
                      <TableCell className="text-right num">{formatINR(totals.debit)}</TableCell>
                      <TableCell className="text-right num text-green-600 dark:text-green-500">{formatINR(totals.credit)}</TableCell>
                      <TableCell className="text-right num">
                        {formatINR(Math.abs(totals.balance))}{totals.balance < 0 ? " Cr" : ""}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
