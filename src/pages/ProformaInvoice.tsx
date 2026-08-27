import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchBar } from "@/components/SearchBar";
import { Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import { generateProformaDeliveryPdf } from "@/lib/proformaPdf";
import { savePdf } from "@/lib/pdfDownload";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  party_id: string | null;
  parties: { name: string } | null;
}

export default function ProformaInvoice() {
  const { current } = useBusiness();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, party_id, parties(name)")
      .eq("business_id", current.id)
      .eq("type", "sale")
      .is("deleted_at", null)
      .order("invoice_date", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as any as InvoiceRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [current?.id]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const hay = `${r.invoice_number} ${r.parties?.name ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const generate = async (row: InvoiceRow) => {
    if (!current) return;
    setGeneratingId(row.id);
    try {
      const [{ data: inv, error: invErr }, { data: lines, error: liErr }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", row.id).single(),
        supabase.from("invoice_items")
          .select("item_name, hsn_code, quantity, unit, price, discount_pct, tax_rate, taxable_amount, tax_amount, total_amount")
          .eq("invoice_id", row.id),
      ]);
      if (invErr || !inv) throw invErr ?? new Error("Invoice not found");
      if (liErr) throw liErr;

      let party: any = null;
      if ((inv as any).party_id) {
        const { data: p } = await supabase
          .from("parties")
          .select("name, gstin, phone, email, billing_address, state, state_code")
          .eq("id", (inv as any).party_id)
          .maybeSingle();
        party = p;
      }

      const doc = generateProformaDeliveryPdf(
        {
          name: current.name,
          gstin: current.gstin, phone: current.phone, email: current.email,
          address: current.address, state: current.state, state_code: current.state_code,
        },
        party ? {
          name: party.name, gstin: party.gstin, phone: party.phone, email: party.email,
          billing_address: party.billing_address, state: party.state, state_code: party.state_code,
        } : null,
        {
          type: "sale",
          invoice_number: (inv as any).invoice_number,
          invoice_date: (inv as any).invoice_date,
          due_date: (inv as any).due_date,
          is_inter_state: (inv as any).is_inter_state,
          subtotal: (inv as any).subtotal,
          discount_amount: (inv as any).discount_amount,
          taxable_total: (inv as any).subtotal - (inv as any).discount_amount,
          cgst_amount: (inv as any).cgst_amount,
          sgst_amount: (inv as any).sgst_amount,
          igst_amount: (inv as any).igst_amount,
          round_off: (inv as any).round_off,
          total_amount: (inv as any).total_amount,
          notes: (inv as any).notes,
          terms: (inv as any).terms,
          lines: (lines ?? []) as any,
        },
      );
      const safeNum = row.invoice_number.replace(/[\/\\]/g, "-");
      await savePdf(doc, `Proforma-${safeNum || "Invoice"}.pdf`);
      toast.success("Proforma copy generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate");
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Copy className="h-6 w-6 text-primary" /> Proforma Invoice
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Generate an Original + Duplicate copy PDF from an existing sale invoice — the duplicate copy has a Receiver's Signature line for delivery confirmation.
        </p>
      </div>

      <SearchBar value={q} onChange={setQ} placeholder="Search by invoice number or customer..." />

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No sale invoices found
          </Card>
        ) : filtered.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.invoice_number}</div>
                <div className="text-xs text-muted-foreground">{r.parties?.name ?? "Walking Customer"}</div>
              </div>
              <div className="text-sm font-semibold num shrink-0">{formatINR(Number(r.total_amount))}</div>
            </div>
            <Button size="sm" className="w-full gap-1.5" disabled={generatingId === r.id} onClick={() => generate(r)}>
              <Download className="h-3.5 w-3.5" /> {generatingId === r.id ? "Generating…" : "Generate Proforma"}
            </Button>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sale invoices found</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.invoice_number}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.invoice_date).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{r.parties?.name ?? "Walking Customer"}</TableCell>
                <TableCell className="text-right num">{formatINR(Number(r.total_amount))}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={generatingId === r.id} onClick={() => generate(r)}>
                    <Download className="h-3.5 w-3.5" /> {generatingId === r.id ? "Generating…" : "Generate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
