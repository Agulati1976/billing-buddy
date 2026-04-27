import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, ArrowLeft, Save, Printer, Download, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import {
  computeInvoice, INVOICE_TYPE_META, nextInvoiceNumber,
  type InvoiceLineInput, type InvoiceType,
} from "@/lib/invoice";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { BarcodeScanner } from "@/components/BarcodeScanner";

interface Props { type: InvoiceType; }
interface Party { id: string; name: string; state_code: string | null; gstin: string | null; }
interface Item { id: string; name: string; barcode: string | null; hsn_code: string | null; sale_price: number; purchase_price: number; tax_rate: number; unit: string; is_batch_tracked: boolean; }
interface Batch { id: string; item_id: string; batch_number: string; expiry_date: string | null; quantity: number; }

export default function InvoiceEditor({ type }: Props) {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const { current } = useBusiness();
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = INVOICE_TYPE_META[type];

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<InvoiceLineInput[]>([emptyLine()]);
  const [isGst, setIsGst] = useState(true);
  const [extraDiscount, setExtraDiscount] = useState("0");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [readOnly, setReadOnly] = useState(false);

  function emptyLine(): InvoiceLineInput {
    return { item_id: null, item_name: "", hsn_code: null, quantity: 1, unit: "pcs", price: 0, discount_pct: 0, tax_rate: 0, batch_id: null };
  }

  // Load parties & items
  useEffect(() => {
    if (!current) return;
    const partyType = type === "purchase" || type === "purchase_return" ? "supplier" : "customer";
    Promise.all([
      supabase.from("parties").select("id, name, state_code, gstin").eq("business_id", current.id).eq("type", partyType).order("name"),
      supabase.from("items").select("id, name, barcode, hsn_code, sale_price, purchase_price, tax_rate, unit, is_batch_tracked").eq("business_id", current.id).order("name"),
      supabase.from("batches").select("id, item_id, batch_number, expiry_date, quantity").eq("business_id", current.id).gt("quantity", 0).order("expiry_date", { ascending: true, nullsFirst: false }),
    ]).then(([p, it, b]) => {
      setParties((p.data as any) ?? []);
      setItems((it.data as any) ?? []);
      setBatches((b.data as any) ?? []);
    });
  }, [current?.id, type]);

  // Suggest invoice number for new
  useEffect(() => {
    if (!current || !isNew) return;
    supabase
      .from("invoices")
      .select("invoice_number")
      .eq("business_id", current.id)
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const last = data?.[0]?.invoice_number ?? null;
        setNumber(nextInvoiceNumber(meta.prefix, last));
      });
  }, [current?.id, isNew, type]);

  // Load existing
  useEffect(() => {
    if (isNew || !id || !current) return;
    Promise.all([
      supabase.from("invoices").select("*").eq("id", id).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id),
    ]).then(([inv, ln]) => {
      if (inv.error) { toast.error(inv.error.message); return; }
      const i = inv.data as any;
      setPartyId(i.party_id ?? "");
      setNumber(i.invoice_number);
      setDate(i.invoice_date);
      setDueDate(i.due_date ?? "");
      setNotes(i.notes ?? "");
      setTerms(i.terms ?? "");
      setIsGst(i.is_gst !== false);
      setExtraDiscount(String(i.extra_discount ?? 0));
      setReadOnly(true); // existing invoices are view-only in MVP
      const ls = (ln.data as any[]) ?? [];
      setLines(ls.length ? ls.map((l) => ({
        item_id: l.item_id, item_name: l.item_name, hsn_code: l.hsn_code,
        quantity: Number(l.quantity), unit: l.unit, price: Number(l.price),
        discount_pct: Number(l.discount_pct), tax_rate: Number(l.tax_rate),
        batch_id: l.batch_id ?? null,
      })) : [emptyLine()]);
      setLoaded(true);
    });
  }, [id, isNew, current?.id]);

  const party = parties.find((p) => p.id === partyId) ?? null;
  const isInterState = useMemo(() => {
    if (!party?.state_code || !current?.state_code) return false;
    return party.state_code !== current.state_code;
  }, [party, current]);

  const totals = useMemo(
    () => computeInvoice(lines, isInterState, { isGst, extraDiscount: Number(extraDiscount) || 0 }),
    [lines, isInterState, isGst, extraDiscount]
  );

  const handleScanned = (code: string) => {
    const it = items.find((x) => (x.barcode ?? "").trim() === code.trim());
    if (!it) {
      toast.error(`No item with barcode ${code}`);
      return;
    }
    const isPurchase = type === "purchase" || type === "purchase_return";
    setLines((ls) => {
      const existingIdx = ls.findIndex((l) => l.item_id === it.id);
      if (existingIdx >= 0) {
        return ls.map((l, i) => i === existingIdx ? { ...l, quantity: Number(l.quantity) + 1 } : l);
      }
      const newLine: InvoiceLineInput = {
        item_id: it.id, item_name: it.name, hsn_code: it.hsn_code,
        quantity: 1, unit: it.unit,
        price: isPurchase ? Number(it.purchase_price) : Number(it.sale_price),
        discount_pct: 0, tax_rate: Number(it.tax_rate),
      };
      const lastEmpty = ls.length > 0 && !ls[ls.length - 1].item_name.trim();
      return lastEmpty ? [...ls.slice(0, -1), newLine] : [...ls, newLine];
    });
    toast.success(`Added: ${it.name}`);
  };

  const updateLine = (idx: number, patch: Partial<InvoiceLineInput>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const pickItem = (idx: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    const isPurchase = type === "purchase" || type === "purchase_return";
    updateLine(idx, {
      item_id: it.id,
      item_name: it.name,
      hsn_code: it.hsn_code,
      unit: it.unit,
      price: isPurchase ? Number(it.purchase_price) : Number(it.sale_price),
      tax_rate: Number(it.tax_rate),
      batch_id: null,
    });
  };

  const save = async () => {
    if (!current || !user) return;
    if (!number.trim()) { toast.error("Invoice number is required"); return; }
    if (!partyId && type !== "quotation") { toast.error("Select a party"); return; }
    const validLines = lines.filter((l) => l.item_name.trim() && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one line item"); return; }

    setSaving(true);
    const computed = computeInvoice(validLines, isInterState, { isGst, extraDiscount: Number(extraDiscount) || 0 });
    const status = type === "quotation" ? "draft" : "unpaid";

    const { data: inv, error } = await supabase.from("invoices").insert({
      business_id: current.id,
      party_id: partyId || null,
      type,
      status,
      invoice_number: number.trim(),
      invoice_date: date,
      due_date: dueDate || null,
      party_state_code: party?.state_code ?? null,
      is_inter_state: isInterState,
      is_gst: isGst,
      extra_discount: computed.extra_discount,
      subtotal: computed.subtotal,
      discount_amount: computed.discount_amount,
      tax_amount: computed.tax_amount,
      cgst_amount: computed.cgst_amount,
      sgst_amount: computed.sgst_amount,
      igst_amount: computed.igst_amount,
      round_off: computed.round_off,
      total_amount: computed.total_amount,
      paid_amount: 0,
      balance_amount: computed.total_amount,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      created_by: user.id,
    }).select().single();

    if (error || !inv) { setSaving(false); toast.error(error?.message ?? "Failed"); return; }

    const { error: liErr } = await supabase.from("invoice_items").insert(
      computed.lines.map((l) => ({
        invoice_id: inv.id,
        item_id: l.item_id,
        item_name: l.item_name,
        hsn_code: l.hsn_code,
        quantity: l.quantity,
        unit: l.unit,
        price: l.price,
        discount_pct: l.discount_pct,
        tax_rate: l.tax_rate,
        batch_id: l.batch_id ?? null,
        taxable_amount: l.taxable_amount,
        tax_amount: l.tax_amount,
        total_amount: l.total_amount,
      }))
    );

    setSaving(false);
    if (liErr) { toast.error(liErr.message); return; }
    toast.success(`${meta.label} saved`);
    navigate(`/${type}s`);
  };

  const downloadPdf = () => {
    if (!current) return;
    const validLines = totals.lines.filter((l) => l.item_name.trim());
    if (validLines.length === 0) { toast.error("No items to export"); return; }
    const doc = generateInvoicePdf(
      {
        name: current.name,
        gstin: current.gstin, phone: current.phone, email: current.email,
        address: current.address, state: current.state, state_code: current.state_code,
      },
      party ? {
        name: party.name, gstin: party.gstin, state_code: party.state_code,
        billing_address: (party as any).billing_address ?? null,
        phone: (party as any).phone ?? null, email: (party as any).email ?? null,
        state: (party as any).state ?? null,
      } : null,
      {
        type, invoice_number: number, invoice_date: date, due_date: dueDate || null,
        is_inter_state: isInterState,
        subtotal: totals.subtotal, discount_amount: totals.discount_amount,
        taxable_total: totals.taxable_total, cgst_amount: totals.cgst_amount,
        sgst_amount: totals.sgst_amount, igst_amount: totals.igst_amount,
        round_off: totals.round_off, total_amount: totals.total_amount,
        notes, terms, lines: validLines,
      }
    );
    const safeNum = number.replace(/[\/\\]/g, "-");
    doc.save(`${safeNum || "invoice"}.pdf`);
  };

  if (!loaded) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/${type}s`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{readOnly ? "View" : "New"} {meta.label}</h1>
            <p className="text-sm text-muted-foreground">{readOnly ? "View mode" : "Fill the details below"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!readOnly && (
            <Button variant="outline" onClick={() => setScannerOpen(true)} className="gap-1.5">
              <ScanLine className="h-4 w-4" /> Scan
            </Button>
          )}
          <Button variant="outline" onClick={downloadPdf} className="gap-1.5">
            <Download className="h-4 w-4" /> Download PDF
          </Button>
          {readOnly && (
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
          )}
          {!readOnly && (
            <Button onClick={save} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{meta.label} Number *</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{type === "purchase" || type === "purchase_return" ? "Supplier" : "Customer"} {type === "quotation" ? "" : "*"}</Label>
          <Select value={partyId} onValueChange={setPartyId} disabled={readOnly}>
            <SelectTrigger><SelectValue placeholder="Select party" /></SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.state_code ? `· ${p.state_code}` : ""} {p.gstin ? `· ${p.gstin}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {party && (
            <p className="text-xs text-muted-foreground">
              {isInterState ? (
                <span className="text-warning">Inter-state · IGST applicable</span>
              ) : (
                <span className="text-success">Intra-state · CGST + SGST applicable</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Switch id="gst-toggle" checked={isGst} onCheckedChange={setIsGst} disabled={readOnly} />
            <Label htmlFor="gst-toggle" className="cursor-pointer">
              {isGst ? "GST Invoice" : "Non-GST Invoice (no tax)"}
            </Label>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">Item</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead className="w-[80px]">Qty</TableHead>
              <TableHead className="w-[110px]">Price</TableHead>
              <TableHead className="w-[80px]">Disc %</TableHead>
              <TableHead className="w-[80px]">Tax %</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {!readOnly && <TableHead className="w-[40px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.lines.map((l, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  {readOnly ? (
                    <span className="font-medium">{l.item_name}</span>
                  ) : (
                    <div className="space-y-1">
                      <Select value={l.item_id ?? ""} onValueChange={(v) => pickItem(idx, v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Pick item" /></SelectTrigger>
                        <SelectContent>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8"
                        value={l.item_name}
                        onChange={(e) => updateLine(idx, { item_name: e.target.value })}
                        placeholder="Or type name"
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? l.hsn_code ?? "—" : (
                    <Input className="h-8" value={l.hsn_code ?? ""} onChange={(e) => updateLine(idx, { hsn_code: e.target.value })} />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? <span className="num">{l.quantity}</span> : (
                    <Input className="h-8 num" type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? <span className="num">{formatINR(l.price)}</span> : (
                    <Input className="h-8 num" type="number" step="0.01" value={l.price} onChange={(e) => updateLine(idx, { price: Number(e.target.value) })} />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? <span className="num">{l.discount_pct}</span> : (
                    <Input className="h-8 num" type="number" step="0.01" value={l.discount_pct} onChange={(e) => updateLine(idx, { discount_pct: Number(e.target.value) })} />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? <span className="num">{l.tax_rate}</span> : (
                    <Input className="h-8 num" type="number" step="0.01" value={l.tax_rate} onChange={(e) => updateLine(idx, { tax_rate: Number(e.target.value) })} />
                  )}
                </TableCell>
                <TableCell className="text-right num">{formatINR(l.total_amount)}</TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!readOnly && (
          <div className="p-3 border-t">
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label>Terms & Conditions</Label>
            <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} disabled={readOnly} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Summary</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatINR(totals.subtotal)} />
            {totals.discount_amount > 0 && <Row label="Discount" value={`− ${formatINR(totals.discount_amount)}`} />}
            {!readOnly && (
              <div className="flex items-center justify-between gap-2 py-1">
                <Label className="text-muted-foreground text-sm">Extra Discount (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 w-32 num text-right"
                  value={extraDiscount}
                  onChange={(e) => setExtraDiscount(e.target.value)}
                />
              </div>
            )}
            <Row label="Taxable Amount" value={formatINR(totals.taxable_total)} />
            {isGst && isInterState && <Row label="IGST" value={formatINR(totals.igst_amount)} />}
            {isGst && !isInterState && (
              <>
                <Row label="CGST" value={formatINR(totals.cgst_amount)} />
                <Row label="SGST" value={formatINR(totals.sgst_amount)} />
              </>
            )}
            {totals.round_off !== 0 && <Row label="Round Off" value={formatINR(totals.round_off)} />}
            <div className="border-t pt-2 mt-2">
              <Row label="Total" value={formatINR(totals.total_amount)} bold />
            </div>
          </dl>
        </Card>
      </div>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={handleScanned} />
    </div>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="num">{value}</dd>
  </div>
);
