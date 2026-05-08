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
import { lookupBarcode, createItemFromCatalog } from "@/lib/barcodeCatalog";
import { PurchaseInvoiceScanner, type ExtractedInvoice } from "@/components/PurchaseInvoiceScanner";
import { Sparkles } from "lucide-react";

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
  const [extraDiscountMode, setExtraDiscountMode] = useState<"amt" | "pct">("amt");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [rowScanIdx, setRowScanIdx] = useState<number | null>(null);
  const [billScanOpen, setBillScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [readOnly, setReadOnly] = useState(false);

  // Loyalty
  const [loyaltyCfg, setLoyaltyCfg] = useState<{ enabled: boolean; amount_per_point: number; point_value: number; min_redeem_points: number } | null>(null);
  const [partyPoints, setPartyPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);

  function emptyLine(): InvoiceLineInput {
    return { item_id: null, item_name: "", hsn_code: null, quantity: 1, unit: "pcs", price: 0, discount_pct: 0, discount_amount: 0, discount_mode: "pct", tax_rate: 0, batch_id: null };
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

  // Load loyalty config (sale only)
  useEffect(() => {
    if (!current || type !== "sale") return;
    supabase.from("loyalty_settings").select("*").eq("business_id", current.id).maybeSingle()
      .then(({ data }) => { if (data) setLoyaltyCfg(data as any); });
  }, [current?.id, type]);

  // Load points balance for selected customer
  useEffect(() => {
    if (!current || !partyId || type !== "sale") { setPartyPoints(0); setRedeemPoints(0); return; }
    supabase.from("loyalty_transactions")
      .select("points_earned, points_redeemed")
      .eq("business_id", current.id).eq("party_id", partyId)
      .then(({ data }) => {
        const bal = (data ?? []).reduce((s: number, t: any) => s + Number(t.points_earned || 0) - Number(t.points_redeemed || 0), 0);
        setPartyPoints(bal);
        setRedeemPoints(0);
      });
  }, [current?.id, partyId, type]);

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

  const redeemValue = useMemo(() => {
    if (type !== "sale" || !loyaltyCfg?.enabled) return 0;
    return (Number(redeemPoints) || 0) * Number(loyaltyCfg.point_value || 0);
  }, [redeemPoints, loyaltyCfg, type]);

  const extraDiscountValue = useMemo(() => {
    const v = Number(extraDiscount) || 0;
    let manual = v;
    if (extraDiscountMode === "pct") {
      const baseLines = computeInvoice(lines, isInterState, { isGst, extraDiscount: 0 });
      manual = (baseLines.taxable_total * v) / 100;
    }
    return manual + redeemValue;
  }, [extraDiscount, extraDiscountMode, lines, isInterState, isGst, redeemValue]);

  const totals = useMemo(
    () => computeInvoice(lines, isInterState, { isGst, extraDiscount: extraDiscountValue }),
    [lines, isInterState, isGst, extraDiscountValue]
  );

  const earnedPoints = useMemo(() => {
    if (type !== "sale" || !loyaltyCfg?.enabled) return 0;
    const per = Number(loyaltyCfg.amount_per_point) || 0;
    if (per <= 0) return 0;
    return Math.floor(Number(totals.total_amount || 0) / per);
  }, [totals.total_amount, loyaltyCfg, type]);

  const addItemToLines = (it: Item) => {
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

  const handleScanned = async (code: string) => {
    const trimmed = code.trim();
    const targetIdx = rowScanIdx;
    setRowScanIdx(null);
    const assign = (it: Item) => {
      if (targetIdx !== null) {
        const isPurchase = type === "purchase" || type === "purchase_return";
        updateLine(targetIdx, {
          item_id: it.id, item_name: it.name, hsn_code: it.hsn_code, unit: it.unit,
          price: isPurchase ? Number(it.purchase_price) : Number(it.sale_price),
          tax_rate: Number(it.tax_rate), batch_id: null,
        });
        toast.success(`Set: ${it.name}`);
      } else {
        addItemToLines(it);
      }
    };
    const it = items.find((x) => (x.barcode ?? "").trim() === trimmed);
    if (it) { assign(it); return; }
    if (!current || !user) { toast.error(`No item with barcode ${code}`); return; }
    const hit = await lookupBarcode(trimmed);
    if (!hit) {
      toast.error(`Unknown barcode ${code}. Add it from Items page first.`);
      return;
    }
    try {
      const created: any = await createItemFromCatalog(hit, current.id, user.id);
      const newItem: Item = {
        id: created.id, name: created.name, barcode: created.barcode,
        hsn_code: created.hsn_code,
        sale_price: Number(created.sale_price) || 0,
        purchase_price: Number(created.purchase_price) || 0,
        tax_rate: Number(created.tax_rate) || 0,
        unit: created.unit,
        is_batch_tracked: !!created.is_batch_tracked,
      };
      setItems((prev) => [newItem, ...prev]);
      assign(newItem);
      toast.success(`Added ${newItem.name} (from catalog)`);
    } catch (e: any) {
      toast.error(e.message || "Could not auto-create item from catalog");
    }
  };

  const applyExtractedBill = async (data: ExtractedInvoice) => {
    if (!current || !user) return;
    try {
      // Header
      if (data.invoice_number) setNumber(data.invoice_number);
      if (data.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(data.invoice_date)) setDate(data.invoice_date);

      // Find or create supplier
      if (data.supplier_name) {
        const target = data.supplier_name.trim().toLowerCase();
        let supplier = parties.find((p) => p.name.trim().toLowerCase() === target);
        if (!supplier) {
          const { data: created, error } = await supabase.from("parties").insert({
            business_id: current.id,
            type: "supplier",
            name: data.supplier_name.trim(),
            gstin: data.supplier_gstin || null,
            phone: data.supplier_phone || null,
            billing_address: data.supplier_address || null,
            created_by: user.id,
          }).select("id, name, state_code, gstin").single();
          if (!error && created) {
            supplier = created as any;
            setParties((ps) => [...ps, created as any]);
          }
        }
        if (supplier) setPartyId(supplier.id);
      }

      // Items: match by name (case-insensitive), else create new
      const newLines: InvoiceLineInput[] = [];
      let localItems = [...items];
      for (const ex of data.items) {
        const target = (ex.name || "").trim();
        if (!target) continue;
        let it = localItems.find((x) => x.name.trim().toLowerCase() === target.toLowerCase());
        if (!it) {
          const { data: created, error } = await supabase.from("items").insert({
            business_id: current.id,
            name: target,
            type: "product",
            unit: ex.unit || "pcs",
            hsn_code: ex.hsn_code || null,
            purchase_price: Number(ex.price) || 0,
            sale_price: Number(ex.price) || 0,
            tax_rate: Number(ex.tax_rate) || 0,
            opening_stock: 0,
            created_by: user.id,
          }).select("id, name, barcode, hsn_code, sale_price, purchase_price, tax_rate, unit, is_batch_tracked").single();
          if (error || !created) continue;
          it = created as any;
          localItems.push(it!);
        }
        newLines.push({
          item_id: it!.id,
          item_name: it!.name,
          hsn_code: ex.hsn_code || it!.hsn_code,
          quantity: Number(ex.quantity) || 1,
          unit: ex.unit || it!.unit,
          price: Number(ex.price) || Number(it!.purchase_price) || 0,
          discount_pct: Number(ex.discount_pct) || 0,
          tax_rate: Number(ex.tax_rate ?? it!.tax_rate) || 0,
          batch_id: null,
        });
      }
      setItems(localItems);
      if (newLines.length) setLines(newLines);
      toast.success(`Added ${newLines.length} item${newLines.length === 1 ? "" : "s"} from the bill. Review and Save to update inventory.`);
    } catch (e: any) {
      toast.error(e?.message || "Could not apply scanned bill");
    }
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
    for (const l of validLines) {
      const it = items.find(x => x.id === l.item_id);
      if (it?.is_batch_tracked && !l.batch_id) {
        toast.error(`Pick a batch for "${it.name}"`); return;
      }
    }

    setSaving(true);
    const computed = computeInvoice(validLines, isInterState, { isGst, extraDiscount: extraDiscountValue });
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

    // Loyalty: record earned + redeemed for sale
    if (type === "sale" && partyId && loyaltyCfg?.enabled && (earnedPoints > 0 || redeemPoints > 0)) {
      await supabase.from("loyalty_transactions").insert({
        business_id: current.id,
        party_id: partyId,
        invoice_id: inv.id,
        points_earned: earnedPoints,
        points_redeemed: Number(redeemPoints) || 0,
        redeem_value: redeemValue,
        created_by: user.id,
      });
    }

    setSaving(false);
    if (liErr) { toast.error(liErr.message); return; }
    toast.success(`${meta.label} saved`);
    navigate(`/${type}s`);
  };

  const downloadPdf = async () => {
    if (!current) return;
    const validLines = totals.lines.filter((l) => l.item_name.trim());
    if (validLines.length === 0) { toast.error("No items to export"); return; }
    // Load invoice design (best-effort; fall back to defaults)
    const { data: design } = await supabase
      .from("invoice_settings").select("*").eq("business_id", current.id).maybeSingle();
    const doc = await generateInvoicePdf(
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
      },
      design ? {
        template: design.template, accent_color: design.accent_color,
        footer_text: design.footer_text, signature_label: design.signature_label,
        show_signature: design.show_signature, show_amount_in_words: design.show_amount_in_words,
        upi_id: (design as any).upi_id, upi_payee_name: (design as any).upi_payee_name,
        show_upi_qr: (design as any).show_upi_qr,
      } : undefined,
    );
    const safeNum = number.replace(/[\/\\]/g, "-");
    doc.save(`${safeNum || "invoice"}.pdf`);
  };

  if (!loaded) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 sm:space-y-4 max-w-6xl pb-24 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/${type}s`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-semibold truncate">{readOnly ? "View" : "New"} {meta.label}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{readOnly ? "View mode" : "Fill the details below"}</p>
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          {!readOnly && (type === "purchase" || type === "purchase_return") && (
            <Button variant="outline" size="sm" onClick={() => setBillScanOpen(true)} className="gap-1.5 px-2 sm:px-3">
              <Sparkles className="h-4 w-4 text-primary" /> <span className="hidden sm:inline">Scan Bill</span>
            </Button>
          )}
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)} className="gap-1.5 px-2 sm:px-3">
              <ScanLine className="h-4 w-4" /> <span className="hidden sm:inline">Scan</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={downloadPdf} className="gap-1.5 px-2 sm:px-3">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">PDF</span>
          </Button>
          {readOnly && (
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 px-2 sm:px-3">
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span>
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 hidden sm:inline-flex">
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
        <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">Item</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead className="w-[80px]">Qty</TableHead>
              <TableHead className="w-[110px]">Price</TableHead>
              <TableHead className="w-[140px]">Discount</TableHead>
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
                    <div>
                      <span className="font-medium">{l.item_name}</span>
                      {l.batch_id && (
                        <div className="text-xs text-muted-foreground">Batch: {batches.find(b => b.id === l.batch_id)?.batch_number ?? "—"}</div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Select value={l.item_id ?? ""} onValueChange={(v) => pickItem(idx, v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Pick item" /></SelectTrigger>
                        <SelectContent>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={it.id}>{it.name}{it.is_batch_tracked ? " ⓑ" : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8"
                        value={l.item_name}
                        onChange={(e) => updateLine(idx, { item_name: e.target.value })}
                        placeholder="Or type name"
                      />
                      {(() => {
                        const it = items.find(x => x.id === l.item_id);
                        if (!it?.is_batch_tracked) return null;
                        const itemBatches = batches.filter(b => b.item_id === it.id);
                        return (
                          <Select value={l.batch_id ?? ""} onValueChange={(v) => updateLine(idx, { batch_id: v })}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Pick batch *" /></SelectTrigger>
                            <SelectContent>
                              {itemBatches.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No stock batches</div>
                              ) : itemBatches.map(b => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.batch_number} · qty {Number(b.quantity)}{b.expiry_date ? ` · exp ${b.expiry_date}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
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
                  {readOnly ? (
                    <span className="num">{l.discount_pct}%</span>
                  ) : (() => {
                    const mode = l.discount_mode ?? "pct";
                    const val = mode === "amt" ? (l.discount_amount ?? 0) : (l.discount_pct ?? 0);
                    return (
                      <div className="flex gap-1">
                        <Input
                          className="h-8 num"
                          type="number"
                          step="0.01"
                          value={val || ""}
                          onChange={(e) => {
                            const n = Number(e.target.value) || 0;
                            if (mode === "amt") updateLine(idx, { discount_amount: n, discount_pct: 0 });
                            else updateLine(idx, { discount_pct: n, discount_amount: 0 });
                          }}
                        />
                        <Select
                          value={mode}
                          onValueChange={(v: "pct" | "amt") => updateLine(idx, { discount_mode: v, discount_amount: 0, discount_pct: 0 })}
                        >
                          <SelectTrigger className="h-8 w-[58px] px-2"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pct">%</SelectItem>
                            <SelectItem value="amt">₹</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
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
        </div>
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
                <Label className="text-muted-foreground text-sm">Overall Discount</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 num text-right"
                    value={extraDiscount}
                    onChange={(e) => setExtraDiscount(e.target.value)}
                  />
                  <Select value={extraDiscountMode} onValueChange={(v: "amt" | "pct") => setExtraDiscountMode(v)}>
                    <SelectTrigger className="h-8 w-[58px] px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amt">₹</SelectItem>
                      <SelectItem value="pct">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {extraDiscountMode === "pct" && Number(extraDiscount) > 0 && (
              <Row label={`Overall Discount (${extraDiscount}%)`} value={`− ${formatINR(extraDiscountValue - redeemValue)}`} />
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
            {type === "sale" && loyaltyCfg?.enabled && partyId && !readOnly && (
              <div className="border-t pt-2 mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-1.5">
                    🎁 Loyalty points available
                  </Label>
                  <span className="text-sm font-medium">{partyPoints} pts <span className="text-xs text-muted-foreground">(₹{(partyPoints * loyaltyCfg.point_value).toFixed(2)})</span></span>
                </div>
                {partyPoints >= loyaltyCfg.min_redeem_points && (
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-muted-foreground text-sm">Redeem points</Label>
                    <div className="flex gap-1 items-center">
                      <Input
                        type="number" min="0" max={partyPoints}
                        className="h-8 w-24 num text-right"
                        value={redeemPoints || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(partyPoints, Math.floor(Number(e.target.value) || 0)));
                          setRedeemPoints(n);
                        }}
                      />
                      <span className="text-xs text-muted-foreground">pts</span>
                    </div>
                  </div>
                )}
                {redeemValue > 0 && <Row label={`Loyalty Redeemed (${redeemPoints} pts)`} value={`− ${formatINR(redeemValue)}`} />}
                {earnedPoints > 0 && (
                  <div className="text-xs text-success">Customer will earn {earnedPoints} point{earnedPoints === 1 ? "" : "s"} on this sale.</div>
                )}
              </div>
            )}
            <div className="border-t pt-2 mt-2">
              <Row label="Total" value={formatINR(totals.total_amount)} bold />
            </div>
          </dl>
        </Card>
      </div>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={handleScanned} />
      <PurchaseInvoiceScanner open={billScanOpen} onOpenChange={setBillScanOpen} onExtracted={applyExtractedBill} />

      {/* Mobile sticky save bar */}
      {!readOnly && (
        <div
          className="md:hidden fixed inset-x-0 z-30 bg-card border-t px-3 py-2 flex items-center gap-3 shadow-lg"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Total</div>
            <div className="text-base font-semibold num truncate">{formatINR(totals.total_amount)}</div>
          </div>
          <Button onClick={save} disabled={saving} className="gap-1.5 h-11 px-5">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="num">{value}</dd>
  </div>
);
