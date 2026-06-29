import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { omInsert, omInsertMany, omUpdate, omDelete } from "@/lib/offlineMutate";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { usePosAccess } from "@/hooks/usePosAccess";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScanLine, Plus, Minus, Trash2, Pause, Play, Printer, Download, ShoppingCart, X, UserPlus, KeyboardIcon, Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { computeInvoice, nextInvoiceNumber, shopInvoiceBase, pickShopInvoiceNumber, composeItemName, type InvoiceLineInput } from "@/lib/invoice";
import { generateThermalReceipt } from "@/lib/thermalReceipt";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { savePdf } from "@/lib/pdfDownload";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { lookupBarcode, createItemFromCatalog } from "@/lib/barcodeCatalog";
import { SearchBar } from "@/components/SearchBar";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { Mic, MicOff } from "lucide-react";

interface Item {
  id: string; name: string; barcode: string | null; sale_price: number;
  tax_rate: number; unit: string; hsn_code: string | null; current_stock: number;
  image_url?: string | null;
  allow_decimal_qty?: boolean;
  brand?: string | null; flavour?: string | null; color?: string | null; sku?: string | null;
}
interface Party { id: string; name: string; phone: string | null; state_code: string | null; gstin: string | null; }
interface CartLine extends InvoiceLineInput { _key: string; max_stock?: number; allow_decimal_qty?: boolean; }


type PaymentMethod = "cash" | "card" | "upi" | "bank_transfer" | "cheque" | "other";

interface Split { method: PaymentMethod; amount: number; }

const newKey = () => Math.random().toString(36).slice(2);

export default function Pos() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const { canUsePos, posEnabled, hasPosAccess, loading: accessLoading } = usePosAccess();

  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [extraDiscount, setExtraDiscount] = useState("0");
  const [isGst, setIsGst] = useState(true);
  const [splits, setSplits] = useState<Split[]>([{ method: "cash", amount: 0 }]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [held, setHeld] = useState<any[]>([]);
  const [session, setSession] = useState<any | null>(null);
  const [openSessionDialog, setOpenSessionDialog] = useState(false);
  const [closeSessionDialog, setCloseSessionDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("0");
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [returnsItems, setReturnsItems] = useState<any[]>([]);
  const [returnsSearch, setReturnsSearch] = useState("");
  const [upiSettings, setUpiSettings] = useState<{ upi_id?: string | null; upi_payee_name?: string | null; show_upi_qr?: boolean | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput({ onResult: (text) => setSearch(text) });

  // Load reference data
  useEffect(() => {
    if (!current) return;
    Promise.all([
      supabase.from("items").select("id,name,barcode,sale_price,tax_rate,unit,hsn_code,current_stock,image_url,allow_decimal_qty,brand,flavour,color,sku").eq("business_id", current.id).order("name"),
      supabase.from("parties").select("id,name,phone,state_code,gstin").eq("business_id", current.id).eq("type", "customer").order("name"),
      supabase.from("invoice_settings").select("upi_id,upi_payee_name,show_upi_qr").eq("business_id", current.id).maybeSingle(),
    ]).then(([it, p, s]) => {
      setItems((it.data as any) ?? []);
      setParties((p.data as any) ?? []);
      setUpiSettings((s.data as any) ?? null);
    });
  }, [current?.id]);

  // Load active session
  useEffect(() => {
    if (!current || !user) return;
    supabase.from("pos_sessions").select("*")
      .eq("business_id", current.id).eq("opened_by", user.id).is("closed_at", null)
      .order("opened_at", { ascending: false }).limit(1)
      .then(({ data }) => setSession(data?.[0] ?? null));
  }, [current?.id, user?.id]);

  // Refresh held carts
  const refreshHeld = async () => {
    if (!current) return;
    const { data } = await supabase.from("pos_held_carts").select("*").eq("business_id", current.id).order("created_at", { ascending: false });
    setHeld(data ?? []);
  };
  useEffect(() => { refreshHeld(); }, [current?.id]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.slice(0, 60);
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.barcode || "").toLowerCase().includes(q) ||
      (i.hsn_code || "").toLowerCase().includes(q)
    ).slice(0, 60);
  }, [items, search]);

  const addToCart = (it: Item) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item_id === it.id);
      if (existing) {
        return prev.map((l) => l.item_id === it.id ? { ...l, quantity: Number(l.quantity) + 1 } : l);
      }
      return [...prev, {
        _key: newKey(), item_id: it.id, item_name: composeItemName(it), hsn_code: it.hsn_code,
        quantity: 1, unit: it.unit, price: Number(it.sale_price) || 0,
        discount_pct: 0, tax_rate: Number(it.tax_rate) || 0, batch_id: null,
        max_stock: Number(it.current_stock) || 0,
        allow_decimal_qty: !!it.allow_decimal_qty,
      }];
    });
  };


  const onScan = async (code: string) => {
    setScannerOpen(false);
    const trimmed = code.trim();
    const found = items.find((i) => (i.barcode ?? "").trim() === trimmed);
    if (found) { addToCart(found); toast.success(`Added ${found.name}`); return; }
    if (!current || !user) { toast.error(`No item with barcode ${code}`); return; }
    // Try global catalog
    const hit = await lookupBarcode(trimmed);
    if (!hit) {
      toast.error(`Unknown barcode ${code}. Add it from Items page first.`);
      return;
    }
    try {
      const created: any = await createItemFromCatalog(hit, current.id, user.id);
      const newItem: Item = {
        id: created.id,
        name: created.name,
        barcode: created.barcode,
        sale_price: Number(created.sale_price) || 0,
        tax_rate: Number(created.tax_rate) || 0,
        unit: created.unit,
        hsn_code: created.hsn_code,
        current_stock: Number(created.current_stock) || 0,
      };
      setItems((prev) => [newItem, ...prev]);
      addToCart(newItem);
      toast.success(`Added ${newItem.name} (from catalog) — set your sale price in Items.`);
    } catch (e: any) {
      toast.error(e.message || "Could not auto-create item from catalog");
    }
  };

  const updateLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => l._key === key ? { ...l, ...patch } : l));
  };
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l._key !== key));

  // Totals
  const party = parties.find((p) => p.id === partyId) ?? null;
  const isInter = !!(party?.state_code && current?.state_code && party.state_code !== current.state_code);
  const totals = useMemo(
    () => computeInvoice(cart, isInter, { isGst, extraDiscount: Number(extraDiscount) || 0 }),
    [cart, isInter, isGst, extraDiscount]
  );

  const totalPaid = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const change = totalPaid - totals.total_amount;

  const openPayment = () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    setSplits([{ method: "cash", amount: totals.total_amount }]);
    setPaymentOpen(true);
  };

  const completeSale = async () => {
    if (!current || !user) return;
    if (totalPaid <= 0) { toast.error("Enter payment amount"); return; }
    const recordedPaid = Math.min(totalPaid, totals.total_amount);
    try {
      // Suggest invoice number (cached GET works offline; suffix when offline to avoid clashes)
      let number: string;
      try {
        const pin = (current as any).pincode as string | null;
        const rank = (current as any).pincode_rank as number | null;
        if (pin && rank) {
          const todayISO = new Date().toISOString().slice(0, 10);
          const base = shopInvoiceBase(pin, rank, todayISO);
          const { data } = await supabase.from("invoices")
            .select("invoice_number").eq("business_id", current.id).eq("type", "sale")
            .like("invoice_number", `${base}%`);
          number = pickShopInvoiceNumber(base, (data ?? []).map((r: any) => r.invoice_number));
        } else {
          const { data: last } = await supabase.from("invoices")
            .select("invoice_number").eq("business_id", current.id).eq("type", "sale")
            .order("created_at", { ascending: false }).limit(1);
          number = nextInvoiceNumber("INV", last?.[0]?.invoice_number ?? null);
        }
      } catch {
        number = `INV-${Date.now()}`;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        number = `${number}-O${Date.now().toString().slice(-5)}`;
      }

      // POS sale is created as UNPAID — shopkeeper records payment from the Payments page.
      const status: "unpaid" = "unpaid";

      const invoiceId = crypto.randomUUID();
      const invRes = await omInsert("invoices", {
        id: invoiceId,
        business_id: current.id, party_id: partyId || null, type: "sale",
        invoice_number: number, invoice_date: new Date().toISOString().slice(0, 10),
        is_inter_state: isInter, is_gst: isGst,
        subtotal: totals.subtotal, discount_amount: totals.discount_amount,
        extra_discount: totals.extra_discount, tax_amount: totals.tax_amount,
        cgst_amount: totals.cgst_amount, sgst_amount: totals.sgst_amount, igst_amount: totals.igst_amount,
        round_off: totals.round_off, total_amount: totals.total_amount,
        paid_amount: 0, balance_amount: totals.total_amount, status,
        party_state_code: party?.state_code ?? null, created_by: user.id,
        pos_session_id: session?.id ?? null,
      });
      if (invRes.error) throw invRes.error;
      const queuedAny = invRes.queued;

      const lineRows = totals.lines.map((l) => ({
        invoice_id: invoiceId, item_id: l.item_id, item_name: l.item_name, hsn_code: l.hsn_code,
        quantity: l.quantity, unit: l.unit, price: l.price, discount_pct: l.discount_pct,
        tax_rate: l.tax_rate, taxable_amount: l.taxable_amount, tax_amount: l.tax_amount,
        total_amount: l.total_amount, batch_id: l.batch_id ?? null,
      }));
      const liRes = await omInsertMany("invoice_items", lineRows);
      if (liRes.error) throw liRes.error;

      // NOTE: Payments are no longer auto-recorded from POS.
      // Cashier must capture the payment from the Payments module.

      toast.success(queuedAny || liRes.queued ? `Sale ${number} saved offline — will sync` : `Sale ${number} completed`);

      // Print thermal
      const receipt = await generateThermalReceipt(
        { name: current.name, gstin: current.gstin, phone: current.phone, address: current.address },
        {
          invoice_number: number, invoice_date: new Date().toLocaleString(),
          party_name: party?.name ?? null, party_phone: party?.phone ?? null,
          cashier: user.email ?? null,
          lines: totals.lines.map((l) => ({
            item_name: l.item_name, quantity: l.quantity, unit: l.unit,
            price: l.price, total_amount: l.total_amount,
          })),
          subtotal: totals.subtotal, discount_amount: totals.discount_amount,
          tax_amount: totals.tax_amount, round_off: totals.round_off,
          total_amount: totals.total_amount, paid_amount: 0,
          balance_amount: totals.total_amount, payment_method: "Unpaid",
        },
        upiSettings ?? undefined,
      );
      receipt.autoPrint();
      await savePdf(receipt, `POS-Receipt-${Date.now()}.pdf`);

      // Reset
      setCart([]); setPartyId(""); setExtraDiscount("0");
      setSplits([{ method: "cash", amount: 0 }]); setPaymentOpen(false);
      // Refresh items stock
      const { data: it } = await supabase.from("items").select("id,name,barcode,sale_price,tax_rate,unit,hsn_code,current_stock,image_url,allow_decimal_qty,brand,flavour,color,sku").eq("business_id", current.id).order("name");
      setItems((it as any) ?? []);
    } catch (e: any) {
      toast.error(e.message || "Failed to save sale");
    }
  };

  const downloadA4 = async () => {
    // Build a lightweight A4 invoice from current cart (preview before sale)
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!current) return;
    const { data: design } = await supabase
      .from("invoice_settings").select("*").eq("business_id", current.id).maybeSingle();
    const pdf = await generateInvoicePdf(
      { name: current.name, gstin: current.gstin, phone: current.phone, email: current.email, address: current.address, state: current.state, state_code: current.state_code, logo_url: (current as any).logo_url },
      party ? { name: party.name, gstin: party.gstin, phone: party.phone, state_code: party.state_code } : null,
      {
        type: "sale", invoice_number: "DRAFT",
        invoice_date: new Date().toISOString().slice(0, 10),
        is_inter_state: isInter,
        subtotal: totals.subtotal, discount_amount: totals.discount_amount,
        taxable_total: totals.taxable_total, cgst_amount: totals.cgst_amount,
        sgst_amount: totals.sgst_amount, igst_amount: totals.igst_amount,
        round_off: totals.round_off, total_amount: totals.total_amount,
        lines: totals.lines.map((l) => ({
          item_name: l.item_name, hsn_code: l.hsn_code, quantity: l.quantity, unit: l.unit,
          price: l.price, discount_pct: l.discount_pct, tax_rate: l.tax_rate,
          taxable_amount: l.taxable_amount, tax_amount: l.tax_amount, total_amount: l.total_amount,
        })),
      },
      design ? {
        template: design.template, accent_color: design.accent_color,
        footer_text: design.footer_text, signature_label: design.signature_label,
        show_signature: design.show_signature, show_amount_in_words: design.show_amount_in_words,
        upi_id: (design as any).upi_id, upi_payee_name: (design as any).upi_payee_name,
        show_upi_qr: (design as any).show_upi_qr,
      } : undefined,
    );
    await savePdf(pdf, `POS-${Date.now()}.pdf`);
  };

  const downloadThermal = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (!current) return;
    const receipt = await generateThermalReceipt(
      { name: current.name, gstin: current.gstin, phone: current.phone, address: current.address },
      {
        invoice_number: "DRAFT",
        invoice_date: new Date().toLocaleString(),
        party_name: party?.name ?? null,
        party_phone: party?.phone ?? null,
        cashier: user?.email ?? null,
        lines: totals.lines.map((l) => ({
          item_name: l.item_name, quantity: l.quantity, unit: l.unit,
          price: l.price, total_amount: l.total_amount,
        })),
        subtotal: totals.subtotal,
        discount_amount: totals.discount_amount,
        tax_amount: totals.cgst_amount + totals.sgst_amount + totals.igst_amount,
        round_off: totals.round_off,
        total_amount: totals.total_amount,
        paid_amount: totals.total_amount,
        balance_amount: 0,
        payment_method: null,
      },
      upiSettings ?? undefined,
    );
    await savePdf(receipt, `POS-Receipt-${Date.now()}.pdf`);
  };

  const holdCart = async () => {
    if (!current || !user) return;
    if (cart.length === 0) { toast.error("Nothing to hold"); return; }
    const res = await omInsert("pos_held_carts", {
      business_id: current.id, created_by: user.id,
      label: holdLabel || `Cart ${new Date().toLocaleTimeString()}`,
      party_id: partyId || null, cart: { lines: cart, isGst, extraDiscount } as any,
    });
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    toast.success(res.queued ? "Cart held offline" : "Cart held");
    setCart([]); setPartyId(""); setHoldLabel(""); setHoldOpen(false);
    refreshHeld();
  };

  const resumeCart = async (h: any) => {
    setCart((h.cart?.lines ?? []).map((l: any) => ({ ...l, _key: newKey() })));
    setPartyId(h.party_id ?? "");
    setIsGst(h.cart?.isGst ?? true);
    setExtraDiscount(h.cart?.extraDiscount ?? "0");
    await omDelete("pos_held_carts", { column: "id", value: h.id });
    refreshHeld();
    setResumeOpen(false);
    toast.success("Cart resumed");
  };

  // Day open/close
  const openDay = async () => {
    if (!current || !user) return;
    const { data, error } = await supabase.from("pos_sessions").insert({
      business_id: current.id, opened_by: user.id, opening_cash: Number(openingCash) || 0,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setSession(data); setOpenSessionDialog(false);
    toast.success("Day opened");
  };
  const closeDay = async () => {
    if (!session) return;
    // expected = opening + sum cash payments today for this session
    const { data: pays } = await supabase.from("payments").select("amount,method")
      .eq("business_id", current!.id).eq("direction", "in").is("deleted_at", null)
      .gte("created_at", session.opened_at);
    const cashIn = (pays ?? []).filter((p: any) => p.method === "cash").reduce((s, p: any) => s + Number(p.amount), 0);
    const expected = Number(session.opening_cash) + cashIn;
    const { error } = await supabase.from("pos_sessions").update({
      closed_at: new Date().toISOString(),
      closing_cash: Number(closingCash) || 0, expected_cash: expected,
    }).eq("id", session.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Day closed. Expected Rs.${expected.toFixed(2)}, counted Rs.${closingCash}`);
    setSession(null); setCloseSessionDialog(false); setClosingCash("0");
  };

  // Returns: search recent sale invoices to return
  const openReturns = async () => {
    setReturnsOpen(true);
    if (!current) return;
    const { data } = await supabase.from("invoices").select("id,invoice_number,invoice_date,total_amount,party_id")
      .eq("business_id", current.id).eq("type", "sale").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(50);
    setReturnsItems(data ?? []);
  };
  const startReturn = async (inv: any) => {
    const { data: lines } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    setCart((lines ?? []).map((l: any) => ({
      _key: newKey(), item_id: l.item_id, item_name: l.item_name, hsn_code: l.hsn_code,
      quantity: -Math.abs(Number(l.quantity)), unit: l.unit, price: Number(l.price),
      discount_pct: Number(l.discount_pct), tax_rate: Number(l.tax_rate), batch_id: l.batch_id,
    })));
    setPartyId(inv.party_id ?? "");
    setReturnsOpen(false);
    toast.info("Loaded as return (negative quantities). Review then complete sale.");
  };

  // Quick-add customer
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const quickAddCustomer = async () => {
    if (!current) return;
    if (!quickName.trim()) { toast.error("Name required"); return; }
    const res = await omInsert("parties", {
      business_id: current.id, name: quickName.trim(), phone: quickPhone.trim() || null, type: "customer",
    });
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    setParties((p) => [...p, res.data as any]);
    setPartyId(res.data.id);
    setQuickName(""); setQuickPhone(""); setQuickOpen(false);
    toast.success(res.queued ? "Customer added (offline)" : "Customer added");
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") {
        if (e.key === "F2") { e.preventDefault(); setScannerOpen(true); }
        if (e.key === "F9") { e.preventDefault(); openPayment(); }
        return;
      }
      if (e.key === "F2") { e.preventDefault(); setScannerOpen(true); }
      if (e.key === "F3") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); setHoldOpen(true); }
      if (e.key === "F5") { e.preventDefault(); setResumeOpen(true); }
      if (e.key === "F9") { e.preventDefault(); openPayment(); }
      if (e.key === "F1") { e.preventDefault(); setHelpOpen(true); }
      if (e.key === "Escape") { setScannerOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPayment]);

  if (accessLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!posEnabled) {
    return (
      <Card className="p-6 max-w-xl">
        <h2 className="font-semibold mb-2">POS not enabled</h2>
        <p className="text-sm text-muted-foreground">
          Point of Sale is a premium feature. Please contact the platform admin to enable it for your business.
        </p>
      </Card>
    );
  }
  if (!hasPosAccess) {
    return (
      <Card className="p-6 max-w-xl">
        <h2 className="font-semibold mb-2">No POS access</h2>
        <p className="text-sm text-muted-foreground">
          POS is enabled for this business but you don't have permission to use it. Ask your owner/admin to grant you POS access in Settings → Team.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Point of Sale</h1>
          {session ? (
            <Badge variant="secondary">Day open · opening Rs.{Number(session.opening_cash).toFixed(0)}</Badge>
          ) : (
            <Badge variant="outline">Day closed</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!session && (
            <Button variant="outline" size="sm" onClick={() => setOpenSessionDialog(true)}>
              <Power className="h-4 w-4 mr-1" /> Open Day
            </Button>
          )}
          {session && (
            <Button variant="outline" size="sm" onClick={() => setCloseSessionDialog(true)}>
              <Power className="h-4 w-4 mr-1" /> Close Day
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openReturns}>
            <RotateCcw className="h-4 w-4 mr-1" /> Returns
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
            <KeyboardIcon className="h-4 w-4 mr-1" /> Shortcuts
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_440px] gap-4">
        {/* Catalogue */}
        <Card className="p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              ref={searchRef}
              placeholder="Search items by name / SKU / barcode (F3)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  addToCart(filtered[0]);
                  setSearch("");
                }
              }}
            />
            {voice.supported && (
              <Button
                variant={voice.listening ? "default" : "outline"}
                onClick={voice.toggle}
                title={voice.listening ? "Listening… click to stop" : "Voice search"}
                className={voice.listening ? "animate-pulse" : ""}
              >
                {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Button variant="outline" onClick={() => setScannerOpen(true)}><ScanLine className="h-4 w-4 mr-1" />Scan</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[calc(100vh-260px)] overflow-auto">
            {filtered.map((it) => (
              <button
                key={it.id}
                onClick={() => addToCart(it)}
                className="text-left p-2 border rounded-md hover:border-primary hover:bg-accent transition flex flex-col"
              >
                <div className="aspect-square w-full rounded bg-muted/40 overflow-hidden mb-2 flex items-center justify-center">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xs text-muted-foreground uppercase">{it.name.slice(0, 2)}</span>
                  )}
                </div>
                <div className="text-sm font-medium line-clamp-2">{it.name}</div>
                <div className="text-xs text-muted-foreground mt-1">Stock: {it.current_stock} {it.unit}</div>
                <div className="text-sm font-semibold mt-1">Rs.{Number(it.sale_price).toFixed(2)}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-sm text-muted-foreground col-span-full text-center py-8">No items.</div>}
          </div>
        </Card>

        {/* Cart */}
        <Card className="p-4 space-y-3 flex flex-col">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Customer</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.phone ? ` · ${p.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={() => setQuickOpen(true)}><UserPlus className="h-4 w-4" /></Button>
          </div>

          <div className="flex-1 min-h-[200px] max-h-[40vh] overflow-auto border rounded-md">
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-10">Cart is empty</div>
            ) : (
              <div className="divide-y">
                {cart.map((l) => (
                  <div key={l._key} className="p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{l.item_name}</div>
                        <div className="text-xs text-muted-foreground">Rs.{Number(l.price).toFixed(2)} × {l.quantity} {l.unit}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLine(l._key)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateLine(l._key, { quantity: Math.max(1, Number(l.quantity) - 1) })}><Minus className="h-3 w-3" /></Button>
                      <Input className="h-6 w-14 text-center" type="number" step={(l as any).allow_decimal_qty ? "0.01" : "1"} min="0" value={l.quantity} onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        updateLine(l._key, { quantity: (l as any).allow_decimal_qty ? n : Math.max(0, Math.floor(n)) });
                      }} />
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateLine(l._key, { quantity: Number(l.quantity) + 1 })}><Plus className="h-3 w-3" /></Button>
                      <span className="text-xs text-muted-foreground ml-1">Disc%</span>
                      <Input className="h-6 w-14" value={l.discount_pct} onChange={(e) => updateLine(l._key, { discount_pct: Number(e.target.value) || 0 })} />
                      <span className="ml-auto text-sm font-medium">Rs.{((Number(l.quantity) * Number(l.price)) * (1 - Number(l.discount_pct) / 100)).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1 text-sm border-t pt-2">
            <Row label="Subtotal" value={`Rs.${totals.subtotal.toFixed(2)}`} />
            <div className="flex items-center gap-2">
              <Label className="text-xs flex-1">Extra discount</Label>
              <Input className="h-7 w-24" value={extraDiscount} onChange={(e) => setExtraDiscount(e.target.value)} />
            </div>
            <Row label="Tax" value={`Rs.${totals.tax_amount.toFixed(2)}`} />
            <Row label="Round off" value={`Rs.${totals.round_off.toFixed(2)}`} />
            <Row label="TOTAL" value={`Rs.${totals.total_amount.toFixed(2)}`} bold />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setHoldOpen(true)}><Pause className="h-4 w-4 mr-1" /> Hold (F4)</Button>
            <Button variant="outline" onClick={() => setResumeOpen(true)}>
              <Play className="h-4 w-4 mr-1" /> Resume {held.length > 0 && `(${held.length})`}
            </Button>
          </div>
          <Button onClick={openPayment} size="lg" className="w-full">Pay (F9) · Rs.{totals.total_amount.toFixed(2)}</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={downloadThermal}><Download className="h-4 w-4 mr-1" /> POS PDF</Button>
            <Button variant="ghost" size="sm" onClick={downloadA4}><Download className="h-4 w-4 mr-1" /> A4 PDF</Button>
          </div>
        </Card>
      </div>

      {/* Scanner */}
      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={onScan} />

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Take Payment · Rs.{totals.total_amount.toFixed(2)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {splits.map((s, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_140px_36px] gap-2 items-end">
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select value={s.method} onValueChange={(v) => setSplits((arr) => arr.map((x, i) => i === idx ? { ...x, method: v as PaymentMethod } : x))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" value={s.amount} onChange={(e) => setSplits((arr) => arr.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} />
                </div>
                <Button variant="ghost" size="icon" disabled={splits.length === 1} onClick={() => setSplits((arr) => arr.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSplits((arr) => [...arr, { method: "cash", amount: Math.max(0, totals.total_amount - totalPaid) }])}>
              <Plus className="h-4 w-4 mr-1" /> Add split
            </Button>
            <div className="flex justify-between text-sm border-t pt-2">
              <span>Tendered</span><span className="font-medium">Rs.{totalPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{change >= 0 ? "Change" : "Balance due"}</span>
              <span className={`font-semibold ${change >= 0 ? "text-success" : "text-danger"}`}>
                Rs.{Math.abs(change).toFixed(2)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={completeSale}><Printer className="h-4 w-4 mr-1" /> Complete & Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hold cart</DialogTitle></DialogHeader>
          <Label>Label (optional)</Label>
          <Input placeholder="Customer Ravi" value={holdLabel} onChange={(e) => setHoldLabel(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Cancel</Button>
            <Button onClick={holdCart}>Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resume dialog */}
      <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Held carts</DialogTitle></DialogHeader>
          {held.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing held.</div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {held.map((h) => (
                <div key={h.id} className="flex items-center justify-between border rounded-md p-2">
                  <div>
                    <div className="text-sm font-medium">{h.label}</div>
                    <div className="text-xs text-muted-foreground">{(h.cart?.lines?.length ?? 0)} items · {new Date(h.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => resumeCart(h)}>Resume</Button>
                    <Button size="icon" variant="ghost" onClick={async () => { await omDelete("pos_held_carts", { column: "id", value: h.id }); refreshHeld(); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick add customer */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quick add customer</DialogTitle></DialogHeader>
          <Label>Name</Label>
          <Input value={quickName} onChange={(e) => setQuickName(e.target.value)} />
          <Label>Phone</Label>
          <Input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)}>Cancel</Button>
            <Button onClick={quickAddCustomer}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open day */}
      <Dialog open={openSessionDialog} onOpenChange={setOpenSessionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open Day</DialogTitle></DialogHeader>
          <Label>Opening cash in drawer</Label>
          <Input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSessionDialog(false)}>Cancel</Button>
            <Button onClick={openDay}>Open</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close day */}
      <Dialog open={closeSessionDialog} onOpenChange={setCloseSessionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close Day</DialogTitle></DialogHeader>
          <Label>Counted closing cash</Label>
          <Input type="number" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} />
          <p className="text-xs text-muted-foreground">Expected cash will be calculated from opening cash + cash sales since the day opened.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseSessionDialog(false)}>Cancel</Button>
            <Button onClick={closeDay}>Close Day</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Returns */}
      <Dialog open={returnsOpen} onOpenChange={setReturnsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Return from a recent sale</DialogTitle></DialogHeader>
          <SearchBar value={returnsSearch} onChange={setReturnsSearch} placeholder="Search invoice number" />
          <div className="max-h-[400px] overflow-auto divide-y">
            {returnsItems.filter((r) => !returnsSearch || r.invoice_number.toLowerCase().includes(returnsSearch.toLowerCase())).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">{r.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">{r.invoice_date} · Rs.{Number(r.total_amount).toFixed(2)}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => startReturn(r)}>Load as return</Button>
              </div>
            ))}
            {returnsItems.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No recent sales.</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <div className="text-sm space-y-1">
            <div><kbd className="px-1 border rounded">F1</kbd> Help</div>
            <div><kbd className="px-1 border rounded">F2</kbd> Open barcode scanner</div>
            <div><kbd className="px-1 border rounded">F3</kbd> Focus search</div>
            <div><kbd className="px-1 border rounded">F4</kbd> Hold cart</div>
            <div><kbd className="px-1 border rounded">F5</kbd> Resume held cart</div>
            <div><kbd className="px-1 border rounded">F9</kbd> Take payment</div>
            <div><kbd className="px-1 border rounded">Enter</kbd> in search adds first match</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
