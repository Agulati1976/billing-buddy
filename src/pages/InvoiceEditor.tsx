import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { omInsert, omInsertMany } from "@/lib/offlineMutate";
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
import { Plus, Trash2, ArrowLeft, Save, Printer, Download, ScanLine, UserPlus, Undo2, Pencil, History, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PartyDialog } from "@/components/PartyDialog";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import {
  computeInvoice, INVOICE_TYPE_META, nextInvoiceNumber,
  shopInvoiceBase, pickShopInvoiceNumber, composeItemName,
  type InvoiceLineInput, type InvoiceType,
} from "@/lib/invoice";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { savePdf } from "@/lib/pdfDownload";
import { generateThermalReceipt } from "@/lib/thermalReceipt";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { lookupBarcode, createItemFromCatalog } from "@/lib/barcodeCatalog";
import { PurchaseInvoiceScanner, type ExtractedInvoice } from "@/components/PurchaseInvoiceScanner";
import { Sparkles } from "lucide-react";

interface Props { type: InvoiceType; }
interface Party { id: string; name: string; state_code: string | null; gstin: string | null; phone?: string | null; }
interface Item { id: string; name: string; barcode: string | null; hsn_code: string | null; sale_price: number; purchase_price: number; tax_rate: number; unit: string; is_batch_tracked: boolean; brand?: string | null; flavour?: string | null; color?: string | null; sku?: string | null; }
interface Batch { id: string; item_id: string; batch_number: string; expiry_date: string | null; quantity: number; }

export default function InvoiceEditor({ type }: Props) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromInvoiceId = searchParams.get("from");
  const isNew = !id || id === "new";
  const { current } = useBusiness();
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = INVOICE_TYPE_META[type];

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string; code: string }[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<InvoiceLineInput[]>([emptyLine()]);
  const [isGst, setIsGst] = useState(true);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [isOnlineOrder, setIsOnlineOrder] = useState(false);
  const [branchId, setBranchId] = useState<string>("");
  const [extraDiscount, setExtraDiscount] = useState("0");
  const [extraDiscountMode, setExtraDiscountMode] = useState<"amt" | "pct">("amt");

  // Payment splits (only used when creating a new sale/purchase invoice)
  type PayMethod = "cash" | "upi" | "card" | "bank" | "cheque" | "other" | "credit";
  const PAY_LABEL: Record<PayMethod, string> = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank Transfer", cheque: "Cheque", other: "Other", credit: "Credit (Unpaid)" };
  const [paySplits, setPaySplits] = useState<Array<{ method: PayMethod; amount: number }>>([{ method: "credit", amount: 0 }]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [rowScanIdx, setRowScanIdx] = useState<number | null>(null);
  const [billScanOpen, setBillScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [readOnly, setReadOnly] = useState(false);
  const [originalSnapshot, setOriginalSnapshot] = useState<null | {
    invoice: any;
    lines: any[];
  }>(null);
  const [history, setHistory] = useState<Array<{ id: string; edited_at: string; summary: string | null; changes: any; editor_email?: string | null }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Party quick add / full add
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const partyKind: "customer" | "supplier" = (type === "purchase" || type === "purchase_return") ? "supplier" : "customer";

  const reloadParties = async () => {
    if (!current) return;
    const { data } = await supabase.from("parties")
      .select("id, name, state_code, gstin, phone")
      .eq("business_id", current.id).eq("type", partyKind).order("name");
    setParties((data as any) ?? []);
    return data as any[] | null;
  };

  const quickAddParty = async () => {
    if (!current) return;
    if (!quickName.trim()) { toast.error("Name required"); return; }
    const res = await omInsert("parties", {
      business_id: current.id, name: quickName.trim(),
      phone: quickPhone.trim() || null, type: partyKind,
    });
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    setParties((p) => [...p, res.data as any]);
    setPartyId((res.data as any).id);
    setQuickName(""); setQuickPhone(""); setQuickOpen(false);
    toast.success(res.queued ? "Added (offline)" : `${partyKind === "customer" ? "Customer" : "Supplier"} added`);
  };

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
      supabase.from("parties").select("id, name, state_code, gstin, phone").eq("business_id", current.id).eq("type", partyType).order("name"),
      supabase.from("items").select("id, name, barcode, hsn_code, sale_price, purchase_price, tax_rate, unit, is_batch_tracked, allow_decimal_qty, brand, flavour, color, sku").eq("business_id", current.id).order("name"),
      supabase.from("batches").select("id, item_id, batch_number, expiry_date, quantity").eq("business_id", current.id).gt("quantity", 0).order("expiry_date", { ascending: true, nullsFirst: false }),
      supabase.from("branches" as any).select("id, name, code").eq("business_id", current.id).order("name"),
    ]).then(([p, it, b, br]) => {
      setParties((p.data as any) ?? []);
      setItems((it.data as any) ?? []);
      setBatches((b.data as any) ?? []);
      setBranches(((br as any).data as any) ?? []);
    });
  }, [current?.id, type]);

  // Suggest invoice number for new (re-runs when branch/online flag changes)
  const branchCodeForNumber = useMemo(() => {
    if (!isOnlineOrder || !branchId) return null;
    return branches.find((b) => b.id === branchId)?.code ?? null;
  }, [isOnlineOrder, branchId, branches]);

  useEffect(() => {
    if (!current || !isNew) return;
    const todayISO = new Date().toISOString().slice(0, 10);
    const pin = (current as any).pincode as string | null;
    const rank = (current as any).pincode_rank as number | null;
    if (pin && rank) {
      const base = shopInvoiceBase(pin, rank, todayISO, branchCodeForNumber);
      supabase.from("invoices")
        .select("invoice_number")
        .eq("business_id", current.id)
        .eq("type", type)
        .like("invoice_number", `${base}%`)
        .then(({ data }) => {
          const existing = (data ?? []).map((r: any) => r.invoice_number as string);
          setNumber(pickShopInvoiceNumber(base, existing));
        });
      return;
    }
    supabase
      .from("invoices")
      .select("invoice_number")
      .eq("business_id", current.id)
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const last = data?.[0]?.invoice_number ?? null;
        setNumber(nextInvoiceNumber(meta.prefix, last, branchCodeForNumber));
      });
  }, [current?.id, isNew, type, branchCodeForNumber]);

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
      const ls = (ln.data as any[]) ?? [];
      setPartyId(i.party_id ?? "");
      setNumber(i.invoice_number);
      setDate(i.invoice_date);
      setDueDate(i.due_date ?? "");
      setNotes(i.notes ?? "");
      setTerms(i.terms ?? "");
      setIsGst(i.is_gst !== false);
      setIsOnlineOrder(!!i.is_online_order);
      setBranchId(i.branch_id ?? "");
      setExtraDiscount(String(i.extra_discount ?? 0));
      setReadOnly(true);
      setOriginalSnapshot({ invoice: i, lines: ls });
      setLines(ls.length ? ls.map((l) => ({
        item_id: l.item_id, item_name: l.item_name, hsn_code: l.hsn_code,
        quantity: Number(l.quantity), unit: l.unit, price: Number(l.price),
        discount_pct: Number(l.discount_pct), tax_rate: Number(l.tax_rate),
        batch_id: l.batch_id ?? null,
      })) : [emptyLine()]);
      setLoaded(true);
    });
  }, [id, isNew, current?.id]);

  // Load edit history for this invoice
  const loadHistory = async () => {
    if (isNew || !id) return;
    const { data } = await supabase
      .from("invoice_edit_log")
      .select("id, edited_at, summary, changes, edited_by")
      .eq("invoice_id", id)
      .order("edited_at", { ascending: false });
    const rows = (data as any[]) ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.edited_by).filter(Boolean)));
    let emailMap: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, email, full_name").in("user_id", userIds);
      for (const p of (profs as any[]) ?? []) {
        emailMap[p.user_id] = p.full_name || p.email || "Unknown";
      }
    }
    setHistory(rows.map((r) => ({ ...r, editor_email: emailMap[r.edited_by] ?? "Unknown" })));
  };
  useEffect(() => { if (!isNew && id) void loadHistory(); }, [id, isNew]);


  // Source-invoice picker (sale return creation)
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceList, setSourceList] = useState<{ id: string; invoice_number: string; invoice_date: string; total_amount: number; party: string | null }[]>([]);
  const [sourceQ, setSourceQ] = useState("");
  const [sourceLoaded, setSourceLoaded] = useState<{ id: string; number: string } | null>(null);

  const applySourceInvoice = async (invoiceId: string) => {
    if (!current) return;
    const [inv, ln] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId),
    ]);
    if (inv.error || !inv.data) { toast.error(inv.error?.message ?? "Source invoice not found"); return; }
    const i = inv.data as any;
    setPartyId(i.party_id ?? "");
    setNotes(`Return against ${i.invoice_number}`);
    setIsGst(i.is_gst !== false);
    const ls = (ln.data as any[]) ?? [];
    if (!ls.length) { toast.error("Source invoice has no items"); return; }
    setLines(ls.map((l) => ({
      item_id: l.item_id, item_name: l.item_name, hsn_code: l.hsn_code,
      quantity: Number(l.quantity), unit: l.unit, price: Number(l.price),
      discount_pct: Number(l.discount_pct), discount_amount: 0, discount_mode: "pct" as const,
      tax_rate: Number(l.tax_rate), batch_id: l.batch_id ?? null,
    })));
    setSourceLoaded({ id: i.id, number: i.invoice_number });
    setSourceOpen(false);
    toast.success(`Loaded ${ls.length} item(s) from ${i.invoice_number}. Adjust quantities to return.`);
  };

  // Auto-prefill from ?from= query param
  useEffect(() => {
    if (!isNew || !fromInvoiceId || !current) return;
    void applySourceInvoice(fromInvoiceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInvoiceId, isNew, current?.id]);

  // Load sale list for the picker (sale_return + new only) and auto-open if no source given
  useEffect(() => {
    if (!isNew || type !== "sale_return" || !current) return;
    supabase.from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, parties(name)")
      .eq("business_id", current.id).eq("type", "sale")
      .order("invoice_date", { ascending: false }).limit(200)
      .then(({ data }) => {
        const list = ((data as any[]) ?? []).map((r) => ({
          id: r.id, invoice_number: r.invoice_number, invoice_date: r.invoice_date,
          total_amount: Number(r.total_amount), party: r.parties?.name ?? null,
        }));
        setSourceList(list);
        if (!fromInvoiceId && list.length > 0 && !sourceLoaded) setSourceOpen(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, isNew, type]);

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
      const baseLines = computeInvoice(lines, isInterState, { isGst, extraDiscount: 0, pricesIncludeTax });
      manual = (baseLines.taxable_total * v) / 100;
    }
    return manual + redeemValue;
  }, [extraDiscount, extraDiscountMode, lines, isInterState, isGst, pricesIncludeTax, redeemValue]);

  const totals = useMemo(
    () => computeInvoice(lines, isInterState, { isGst, extraDiscount: extraDiscountValue, pricesIncludeTax }),
    [lines, isInterState, isGst, extraDiscountValue, pricesIncludeTax]
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
        item_id: it.id, item_name: composeItemName(it), hsn_code: it.hsn_code,
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
          item_id: it.id, item_name: composeItemName(it), hsn_code: it.hsn_code, unit: it.unit,
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
          const res = await omInsert("parties", {
            business_id: current.id,
            type: "supplier",
            name: data.supplier_name.trim(),
            gstin: data.supplier_gstin || null,
            phone: data.supplier_phone || null,
            billing_address: data.supplier_address || null,
            created_by: user.id,
          });
          if (!res.error) {
            const created: any = {
              id: res.data.id, name: data.supplier_name.trim(),
              state_code: null, gstin: data.supplier_gstin || null,
            };
            supplier = created;
            setParties((ps) => [...ps, created]);
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
          const res = await omInsert("items", {
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
          });
          if (res.error) continue;
          it = {
            id: res.data.id, name: target,
            barcode: null, hsn_code: ex.hsn_code || null,
            sale_price: Number(ex.price) || 0, purchase_price: Number(ex.price) || 0,
            tax_rate: Number(ex.tax_rate) || 0, unit: ex.unit || "pcs",
            is_batch_tracked: false,
          } as any;
          localItems.push(it!);
        }
        newLines.push({
          item_id: it!.id,
          item_name: composeItemName(it!),
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

  // Edit final line amount → back-calculate unit price (clears line discount for clarity)
  const setLineAmount = (idx: number, newTotal: number) => {
    setLines((ls) => ls.map((l, i) => {
      if (i !== idx) return l;
      const qty = Number(l.quantity) || 0;
      if (qty <= 0 || !Number.isFinite(newTotal) || newTotal < 0) return l;
      const rate = isGst ? Number(l.tax_rate) || 0 : 0;
      // In inclusive mode the entered price already includes tax → price = total / qty
      // In exclusive mode → price = total / (qty * (1 + rate/100))
      const denom = qty * (pricesIncludeTax ? 1 : (1 + rate / 100));
      const newPrice = denom > 0 ? newTotal / denom : 0;
      return { ...l, price: Math.round(newPrice * 100) / 100, discount_amount: 0, discount_pct: 0, discount_mode: "pct" as const };
    }));
  };

  const pickItem = (idx: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    const isPurchase = type === "purchase" || type === "purchase_return";
    updateLine(idx, {
      item_id: it.id,
      item_name: composeItemName(it),
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
    if (!partyId && type !== "quotation" && type !== "sale_return") { toast.error("Select a party"); return; }
    const validLines = lines.filter((l) => l.item_name.trim() && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one line item"); return; }
    for (const l of validLines) {
      const it = items.find(x => x.id === l.item_id);
      if (it?.is_batch_tracked && !l.batch_id) {
        toast.error(`Pick a batch for "${it.name}"`); return;
      }
    }

    setSaving(true);
    // If user entered inclusive prices, convert to exclusive so storage stays consistent
    const linesForSave = pricesIncludeTax && isGst
      ? validLines.map((l) => {
          const rate = Number(l.tax_rate) || 0;
          if (rate <= 0) return l;
          const factor = 1 + rate / 100;
          return {
            ...l,
            price: (Number(l.price) || 0) / factor,
            discount_amount: l.discount_amount ? (Number(l.discount_amount) || 0) / factor : l.discount_amount,
          };
        })
      : validLines;
    const computed = computeInvoice(linesForSave, isInterState, { isGst, extraDiscount: extraDiscountValue });
    const status = type === "quotation" ? "draft"
      : (type === "sale_return" || type === "purchase_return") ? "paid"
      : "unpaid";
    const isReturn = type === "sale_return" || type === "purchase_return";

    // ==== EDIT (UPDATE) PATH ====
    if (!isNew && id && originalSnapshot) {
      try {
        const oldLines = originalSnapshot.lines;
        const oldInv = originalSnapshot.invoice;

        // 1. Reverse batch quantities for old batch-tracked lines
        for (const ol of oldLines) {
          if (!ol.batch_id) continue;
          let delta = 0;
          if (type === "sale") delta = Number(ol.quantity);
          else if (type === "purchase") delta = -Number(ol.quantity);
          else if (type === "sale_return") delta = -Number(ol.quantity);
          else if (type === "purchase_return") delta = Number(ol.quantity);
          if (delta !== 0) {
            const { data: b } = await supabase.from("batches").select("quantity").eq("id", ol.batch_id).single();
            if (b) {
              await supabase.from("batches").update({ quantity: Number((b as any).quantity) + delta }).eq("id", ol.batch_id);
            }
          }
        }

        // 2. Delete stock_movements that reference the old invoice lines
        const oldLineIds = oldLines.map((l) => l.id).filter(Boolean);
        if (oldLineIds.length) {
          await supabase.from("stock_movements").delete().in("reference_id", oldLineIds);
        }

        // 3. Delete old invoice_items
        await supabase.from("invoice_items").delete().eq("invoice_id", id);

        // 4. Insert new invoice_items
        const liRes = await supabase.from("invoice_items").insert(
          computed.lines.map((l) => ({
            invoice_id: id,
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
        if (liRes.error) throw liRes.error;

        // 5. Recompute paid/balance/status from existing payments
        const { data: pays } = await supabase.from("payments")
          .select("amount").eq("invoice_id", id).is("deleted_at", null);
        const paid = ((pays as any[]) ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
        const balance = Math.max(0, Number(computed.total_amount) - paid);
        const newStatus: any = type === "quotation" ? "draft"
          : isReturn ? "paid"
          : balance <= 0 ? "paid"
          : paid > 0 ? "partial"
          : "unpaid";

        // 6. Update invoice header
        const updRes = await supabase.from("invoices").update({
          party_id: partyId || null,
          status: newStatus,
          invoice_number: number.trim(),
          invoice_date: date,
          due_date: dueDate || null,
          party_state_code: party?.state_code ?? null,
          is_inter_state: isInterState,
          is_gst: isGst,
          is_online_order: type === "sale" ? isOnlineOrder : false,
          branch_id: type === "sale" && isOnlineOrder && branchId ? branchId : null,
          extra_discount: computed.extra_discount,
          subtotal: computed.subtotal,
          discount_amount: computed.discount_amount,
          tax_amount: computed.tax_amount,
          cgst_amount: computed.cgst_amount,
          sgst_amount: computed.sgst_amount,
          igst_amount: computed.igst_amount,
          round_off: computed.round_off,
          total_amount: computed.total_amount,
          paid_amount: paid,
          balance_amount: isReturn ? 0 : balance,
          notes: notes.trim() || null,
          terms: terms.trim() || null,
        }).eq("id", id);
        if (updRes.error) throw updRes.error;

        // 7. Build diff & write audit log
        const diff = buildInvoiceDiff(
          oldInv, oldLines,
          {
            invoice_number: number.trim(), invoice_date: date, due_date: dueDate || null,
            party_id: partyId || null, is_gst: isGst, notes: notes.trim() || null,
            terms: terms.trim() || null, total_amount: computed.total_amount,
            subtotal: computed.subtotal, discount_amount: computed.discount_amount,
            tax_amount: computed.tax_amount, extra_discount: computed.extra_discount,
          },
          computed.lines
        );
        const summary = summarizeDiff(diff);
        await supabase.from("invoice_edit_log").insert({
          invoice_id: id,
          business_id: current.id,
          edited_by: user.id,
          changes: diff,
          summary,
        });

        setSaving(false);
        toast.success(`${meta.label} updated`);
        await loadHistory();
        // refresh snapshot
        const [invFresh, lnFresh] = await Promise.all([
          supabase.from("invoices").select("*").eq("id", id).single(),
          supabase.from("invoice_items").select("*").eq("invoice_id", id),
        ]);
        if (invFresh.data) setOriginalSnapshot({ invoice: invFresh.data, lines: (lnFresh.data as any[]) ?? [] });
        setReadOnly(true);
        return;
      } catch (e: any) {
        setSaving(false);
        toast.error(e?.message || "Failed to update invoice");
        return;
      }
    }

    // ==== NEW INVOICE PATH ====
    // Compute payment split totals (only for sale/purchase — returns are auto-paid; quotations have no payment)
    const supportsPayment = type === "sale" || type === "purchase";
    const cashSplitTotal = supportsPayment
      ? paySplits.filter((s) => s.method !== "credit").reduce((s, x) => s + (Number(x.amount) || 0), 0)
      : 0;
    const newPaid = isReturn ? computed.total_amount
      : supportsPayment ? Math.min(cashSplitTotal, computed.total_amount)
      : 0;
    const newBalance = isReturn ? 0 : Math.max(0, computed.total_amount - newPaid);
    let newStatus: any = status;
    if (supportsPayment) {
      newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    }

    const invoiceId = crypto.randomUUID();
    // NOTE: We intentionally insert the invoice with paid_amount=0 / balance=total
    // for sale & purchase. The `apply_payment_to_invoice` trigger will fire when
    // we insert the payment rows below and correctly compute paid/balance/status.
    // Setting paid_amount=newPaid here AND inserting payment rows caused the
    // trigger to double-count (paid_amount = newPaid + payment.amount), which
    // pushed balance_amount negative and mis-labelled partial-credit invoices
    // as fully paid — hiding the credit portion from To Receive / Outstanding.
    const seedPaid = isReturn ? computed.total_amount : 0;
    const seedBalance = isReturn ? 0 : computed.total_amount;
    const seedStatus: any = supportsPayment ? "unpaid" : newStatus;

    const invRes = await omInsert("invoices", {
      id: invoiceId,
      business_id: current.id,
      party_id: partyId || null,
      type,
      status: seedStatus,
      invoice_number: number.trim(),
      invoice_date: date,
      due_date: dueDate || null,
      party_state_code: party?.state_code ?? null,
      is_inter_state: isInterState,
      is_gst: isGst,
      is_online_order: type === "sale" ? isOnlineOrder : false,
      branch_id: type === "sale" && isOnlineOrder && branchId ? branchId : null,
      extra_discount: computed.extra_discount,
      subtotal: computed.subtotal,
      discount_amount: computed.discount_amount,
      tax_amount: computed.tax_amount,
      cgst_amount: computed.cgst_amount,
      sgst_amount: computed.sgst_amount,
      igst_amount: computed.igst_amount,
      round_off: computed.round_off,
      total_amount: computed.total_amount,
      paid_amount: seedPaid,
      balance_amount: seedBalance,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      created_by: user.id,
    });



    if (invRes.error) { setSaving(false); toast.error((invRes.error as any).message ?? "Failed"); return; }

    const liRes = await omInsertMany("invoice_items",
      computed.lines.map((l) => ({
        invoice_id: invoiceId,
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
      await omInsert("loyalty_transactions", {
        business_id: current.id,
        party_id: partyId,
        invoice_id: invoiceId,
        points_earned: earnedPoints,
        points_redeemed: Number(redeemPoints) || 0,
        redeem_value: redeemValue,
        created_by: user.id,
      });
    }

    // Record payment rows (non-credit splits only) for new sale/purchase
    if (supportsPayment && newPaid > 0) {
      let remaining = computed.total_amount;
      const direction = type === "sale" ? "in" : "out";
      const payRows = [] as any[];
      for (const s of paySplits) {
        if (s.method === "credit") continue;
        const amt = Math.min(Number(s.amount) || 0, remaining);
        if (amt <= 0) continue;
        remaining -= amt;
        payRows.push({
          business_id: current.id, party_id: partyId || null, invoice_id: invoiceId,
          direction, method: s.method, amount: amt,
          payment_date: date,
          notes: `Recorded with invoice · ${PAY_LABEL[s.method]}`,
          created_by: user.id,
        });
        if (remaining <= 0) break;
      }
      if (payRows.length) await omInsertMany("payments", payRows);
    }

    setSaving(false);
    if (liRes.error) { toast.error((liRes.error as any).message ?? "Failed"); return; }
    toast.success(invRes.queued || liRes.queued ? `${meta.label} saved offline — will sync` : `${meta.label} saved`);
    navigate(`/${meta.route}`);
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
        logo_url: (current as any).logo_url,
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
    const label = type === "sale" ? "Invoice" : type === "purchase" ? "Purchase" : type === "sale_return" ? "SalesReturn" : type === "purchase_return" ? "PurchaseReturn" : type === "quotation" ? "Quotation" : type === "credit_note" ? "CreditNote" : "DebitNote";
    await savePdf(doc, `${label}-${safeNum || "Document"}.pdf`);
  };

  const downloadThermal = async () => {
    if (!current) return;
    const validLines = totals.lines.filter((l) => l.item_name.trim());
    if (validLines.length === 0) { toast.error("No items to export"); return; }
    const { data: design } = await supabase
      .from("invoice_settings").select("upi_id,upi_payee_name,show_upi_qr").eq("business_id", current.id).maybeSingle();
    const receipt = await generateThermalReceipt(
      { name: current.name, gstin: current.gstin, phone: current.phone, address: current.address },
      {
        invoice_number: number,
        invoice_date: new Date(date).toLocaleString(),
        party_name: party?.name ?? null,
        party_phone: (party as any)?.phone ?? null,
        cashier: user?.email ?? null,
        lines: validLines.map((l) => ({
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
      design ? { upi_id: (design as any).upi_id, upi_payee_name: (design as any).upi_payee_name, show_upi_qr: (design as any).show_upi_qr } : undefined,
    );
    const safeNum = number.replace(/[\/\\]/g, "-");
    await savePdf(receipt, `POS-${safeNum || "Receipt"}.pdf`);
  };

  if (!loaded) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 sm:space-y-4 max-w-6xl pb-24 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/${meta.route}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-semibold truncate">
              {isNew ? "New" : readOnly ? "View" : "Edit"} {meta.label}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              {isNew ? "Fill the details below" : readOnly ? "View mode" : "Editing — changes will be logged in history"}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          {!readOnly && type === "sale_return" && isNew && (
            <Button variant="outline" size="sm" onClick={() => setSourceOpen(true)} className="gap-1.5 px-2 sm:px-3">
              <Undo2 className="h-4 w-4 text-primary" /> <span>{sourceLoaded ? `From ${sourceLoaded.number}` : "Pick sale"}</span>
            </Button>
          )}
          {!readOnly && (type === "purchase" || type === "purchase_return") && (
            <Button variant="outline" size="sm" onClick={() => setBillScanOpen(true)} className="gap-1.5 px-2 sm:px-3">
              <Sparkles className="h-4 w-4 text-primary" /> <span>Scan Bill</span>
            </Button>
          )}
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)} className="gap-1.5 px-2 sm:px-3">
              <ScanLine className="h-4 w-4" /> <span>Scan</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={downloadPdf} className="gap-1.5 px-2 sm:px-3" title="Download A4 PDF">
            <Download className="h-4 w-4" /> <span>A4 PDF</span>
          </Button>
          {(type === "sale" || type === "sale_return") && (
            <Button variant="outline" size="sm" onClick={downloadThermal} className="gap-1.5 px-2 sm:px-3" title="Download POS Receipt PDF">
              <Download className="h-4 w-4" /> <span>POS PDF</span>
            </Button>
          )}
          {readOnly && type === "sale" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/sale_returns/new?from=${id}`)} className="gap-1.5 px-2 sm:px-3" title="Create Return">
              <Undo2 className="h-4 w-4" /> <span>Return</span>
            </Button>
          )}
          {readOnly && (
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 px-2 sm:px-3" title="Print">
              <Printer className="h-4 w-4" /> <span>Print</span>
            </Button>
          )}
          {readOnly && !isNew && history.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5 px-2 sm:px-3" title="View edit history">
              <History className="h-4 w-4" /> <span>History ({history.length})</span>
            </Button>
          )}
          {readOnly && !isNew && (
            <Button variant="outline" size="sm" onClick={() => setReadOnly(false)} className="gap-1.5 px-2 sm:px-3" title="Edit invoice">
              <Pencil className="h-4 w-4" /> <span>Edit</span>
            </Button>
          )}
          {!readOnly && !isNew && (
            <Button variant="ghost" size="sm" onClick={() => {
              // Reset to snapshot
              if (originalSnapshot) {
                const i = originalSnapshot.invoice;
                const ls = originalSnapshot.lines;
                setPartyId(i.party_id ?? "");
                setNumber(i.invoice_number);
                setDate(i.invoice_date);
                setDueDate(i.due_date ?? "");
                setNotes(i.notes ?? "");
                setTerms(i.terms ?? "");
                setIsGst(i.is_gst !== false);
                setExtraDiscount(String(i.extra_discount ?? 0));
                setLines(ls.length ? ls.map((l: any) => ({
                  item_id: l.item_id, item_name: l.item_name, hsn_code: l.hsn_code,
                  quantity: Number(l.quantity), unit: l.unit, price: Number(l.price),
                  discount_pct: Number(l.discount_pct), tax_rate: Number(l.tax_rate),
                  batch_id: l.batch_id ?? null,
                })) : [emptyLine()]);
              }
              setReadOnly(true);
            }} className="gap-1.5 px-2 sm:px-3">
              <X className="h-4 w-4" /> <span>Cancel</span>
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : isNew ? "Save" : "Save Changes"}
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
          <Label>{partyKind === "supplier" ? "Supplier" : "Customer"} {type === "quotation" ? "" : "*"}</Label>
          <div className="flex gap-2">
            <Select value={partyId} onValueChange={setPartyId} disabled={readOnly}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={`Select ${partyKind}`} /></SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.phone ? ` · ${p.phone}` : ""}{p.state_code ? ` · ${p.state_code}` : ""}{p.gstin ? ` · ${p.gstin}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!readOnly && (
              <>
                <Button type="button" variant="outline" size="icon" title={`Quick add ${partyKind}`} onClick={() => setQuickOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" title={`New ${partyKind} (full details)`} onClick={() => setPartyDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {!readOnly && (
            <p className="text-xs text-muted-foreground">
              <UserPlus className="inline h-3 w-3 mr-1" /> Quick add (name + phone) ·{" "}
              <Plus className="inline h-3 w-3 mx-1" /> New {partyKind} with full details
            </p>
          )}
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
        <div className="flex items-center justify-between gap-3 pt-2 border-t flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch id="gst-toggle" checked={isGst} onCheckedChange={setIsGst} disabled={readOnly} />
              <Label htmlFor="gst-toggle" className="cursor-pointer">
                {isGst ? "GST Invoice" : "Non-GST Invoice (no tax)"}
              </Label>
            </div>
            {isGst && (
              <div className="flex items-center gap-2">
                <Switch
                  id="incl-tax-toggle"
                  checked={pricesIncludeTax}
                  onCheckedChange={setPricesIncludeTax}
                  disabled={readOnly}
                />
                <Label htmlFor="incl-tax-toggle" className="cursor-pointer text-sm">
                  {pricesIncludeTax ? "Prices include GST (inclusive)" : "Prices exclude GST (add tax on top)"}
                </Label>
              </div>
            )}
          </div>
          {type === "sale" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Switch
                id="online-order-toggle"
                checked={isOnlineOrder}
                onCheckedChange={(v) => { setIsOnlineOrder(v); if (!v) setBranchId(""); }}
                disabled={readOnly}
              />
              <Label htmlFor="online-order-toggle" className="cursor-pointer">Online order</Label>
              {isOnlineOrder && (
                <Select value={branchId} onValueChange={setBranchId} disabled={readOnly}>
                  <SelectTrigger className="h-8 min-w-[180px]"><SelectValue placeholder={branches.length ? "Select branch" : "No branches yet"} /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isOnlineOrder && branches.length === 0 && !readOnly && (
                <Button type="button" size="sm" variant="outline" onClick={() => navigate("/branches")}>Add branch</Button>
              )}
            </div>
          )}
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
                      <div className="flex gap-1">
                        <Select value={l.item_id ?? ""} onValueChange={(v) => pickItem(idx, v)}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Pick item" /></SelectTrigger>
                          <SelectContent>
                            {items.map((it) => (
                              <SelectItem key={it.id} value={it.id}>{it.name}{it.is_batch_tracked ? " ⓑ" : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0"
                          onClick={() => { setRowScanIdx(idx); setScannerOpen(true); }}
                          title="Scan barcode for this row"
                        >
                          <ScanLine className="h-4 w-4" />
                        </Button>
                      </div>
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
                  {readOnly ? <span className="num">{l.quantity}</span> : (() => {
                    const it = l.item_id ? items.find((x: any) => x.id === l.item_id) : null;
                    const allowDec = it ? !!(it as any).allow_decimal_qty : true;
                    return (
                      <Input
                        className="h-8 num"
                        type="number"
                        step={allowDec ? "0.01" : "1"}
                        min="0"
                        value={l.quantity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = Number(raw);
                          if (!Number.isFinite(n)) return;
                          updateLine(idx, { quantity: allowDec ? n : Math.max(0, Math.floor(n)) });
                        }}
                      />
                    );
                  })()}
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
                <TableCell className="text-right num">
                  {readOnly ? (
                    formatINR(l.total_amount)
                  ) : (
                    <Input
                      className="h-8 num text-right"
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.total_amount}
                      onChange={(e) => setLineAmount(idx, Number(e.target.value))}
                      title="Edit final amount — unit price recalculates automatically"
                    />
                  )}
                </TableCell>
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

            {isNew && !readOnly && (type === "sale" || type === "purchase") && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Payment received now</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      const remaining = Math.max(0, totals.total_amount - paySplits.reduce((s, x) => s + (Number(x.amount) || 0), 0));
                      setPaySplits((arr) => [...arr, { method: "cash", amount: remaining }]);
                    }}
                  >+ Add split</button>
                </div>
                {paySplits.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_28px] gap-2 items-center">
                    <Select value={s.method} onValueChange={(v) => setPaySplits((arr) => arr.map((x, i) => i === idx ? { ...x, method: v as PayMethod } : x))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="credit">Credit (Unpaid)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" className="h-8 text-right num" value={s.amount || ""} placeholder="0"
                      onChange={(e) => setPaySplits((arr) => arr.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) || 0 } : x))} />
                    <button type="button" className="text-muted-foreground hover:text-danger text-xs"
                      disabled={paySplits.length === 1}
                      onClick={() => setPaySplits((arr) => arr.filter((_, i) => i !== idx))}>✕</button>
                  </div>
                ))}
                {(() => {
                  const cashTot = paySplits.filter((x) => x.method !== "credit").reduce((s, x) => s + (Number(x.amount) || 0), 0);
                  const creditTot = paySplits.filter((x) => x.method === "credit").reduce((s, x) => s + (Number(x.amount) || 0), 0);
                  const bal = Math.max(0, totals.total_amount - Math.min(cashTot, totals.total_amount));
                  return (
                    <div className="text-xs space-y-1 pt-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Paid (cash/upi/card/etc.)</span><span className="font-medium">{formatINR(cashTot)}</span></div>
                      {creditTot > 0 && <div className="flex justify-between"><span className="text-muted-foreground">On credit</span><span className="font-medium text-amber-600">{formatINR(creditTot)}</span></div>}
                      <div className="flex justify-between"><span className="text-muted-foreground">Outstanding balance</span><span className={`font-semibold ${bal > 0 ? "text-danger" : "text-success"}`}>{formatINR(bal)}</span></div>
                    </div>
                  );
                })()}
              </div>
            )}
          </dl>
        </Card>
      </div>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={handleScanned} />
      <PurchaseInvoiceScanner open={billScanOpen} onOpenChange={setBillScanOpen} onExtracted={applyExtractedBill} />

      <PartyDialog
        open={partyDialogOpen}
        onOpenChange={setPartyDialogOpen}
        type={partyKind}
        party={null}
        onSaved={async () => {
          setPartyDialogOpen(false);
          const before = parties.map((p) => p.id);
          const list = await reloadParties();
          const created = (list ?? []).find((p) => !before.includes(p.id));
          if (created) setPartyId(created.id);
        }}
      />

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Quick add {partyKind}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qn">Name *</Label>
              <Input id="qn" autoFocus value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qp">Mobile number</Label>
              <Input id="qp" value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} placeholder="Optional" inputMode="tel" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)}>Cancel</Button>
            <Button onClick={quickAddParty} disabled={!quickName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale-return: pick source sale invoice */}
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Pick the sale invoice to return</DialogTitle></DialogHeader>
          <Input placeholder="Search by invoice number or customer…" value={sourceQ} onChange={(e) => setSourceQ(e.target.value)} />
          <div className="overflow-y-auto border rounded-md divide-y">
            {sourceList.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No sale invoices found.</div>
            ) : (
              sourceList
                .filter((r) => {
                  const q = sourceQ.trim().toLowerCase();
                  if (!q) return true;
                  return r.invoice_number.toLowerCase().includes(q) || (r.party ?? "").toLowerCase().includes(q);
                })
                .map((r) => (
                  <button key={r.id} onClick={() => applySourceInvoice(r.id)}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/60">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.invoice_number}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.party ?? "—"} · {r.invoice_date}</div>
                    </div>
                    <div className="num font-semibold shrink-0">{formatINR(r.total_amount)}</div>
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit history dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Edit history
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto space-y-3">
            {history.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center">No edits yet.</div>
            ) : history.map((h) => (
              <div key={h.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium">{h.editor_email}</div>
                  <div className="text-xs text-muted-foreground">{new Date(h.edited_at).toLocaleString()}</div>
                </div>
                {h.summary && <div className="text-sm mb-2">{h.summary}</div>}
                <HistoryDiffView changes={h.changes} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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

// ===== Edit-diff helpers =====

const HEADER_FIELDS: Array<{ key: string; label: string; money?: boolean }> = [
  { key: "invoice_number", label: "Invoice number" },
  { key: "invoice_date", label: "Date" },
  { key: "due_date", label: "Due date" },
  { key: "party_id", label: "Party" },
  { key: "is_gst", label: "GST" },
  { key: "notes", label: "Notes" },
  { key: "terms", label: "Terms" },
  { key: "subtotal", label: "Subtotal", money: true },
  { key: "discount_amount", label: "Discount", money: true },
  { key: "tax_amount", label: "Tax", money: true },
  { key: "extra_discount", label: "Overall discount", money: true },
  { key: "total_amount", label: "Total", money: true },
];

function fmtVal(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function buildInvoiceDiff(
  oldInv: any, oldLines: any[],
  newInv: Record<string, any>, newLines: any[]
) {
  const header: Record<string, { old: any; new: any; label: string; money?: boolean }> = {};
  for (const f of HEADER_FIELDS) {
    const a = oldInv?.[f.key] ?? null;
    const b = newInv[f.key] ?? null;
    const norm = (x: any) => (x === null || x === undefined ? null : typeof x === "number" ? Number(x) : x);
    if (norm(a) !== norm(b) && !(a == null && b == null)) {
      header[f.key] = { old: a, new: b, label: f.label, money: f.money };
    }
  }

  const keyOf = (l: any) => (l.item_id || l.item_name || "").toString();
  const oldMap = new Map<string, any>();
  for (const l of oldLines) oldMap.set(keyOf(l), l);
  const newMap = new Map<string, any>();
  for (const l of newLines) newMap.set(keyOf(l), l);

  const added: any[] = [];
  const removed: any[] = [];
  const modified: any[] = [];

  for (const [k, n] of newMap.entries()) {
    const o = oldMap.get(k);
    if (!o) {
      added.push({ item_name: n.item_name, quantity: Number(n.quantity), price: Number(n.price), total: Number(n.total_amount) });
    } else {
      const fields: Record<string, { old: any; new: any }> = {};
      if (Number(o.quantity) !== Number(n.quantity)) fields.quantity = { old: Number(o.quantity), new: Number(n.quantity) };
      if (Number(o.price) !== Number(n.price)) fields.price = { old: Number(o.price), new: Number(n.price) };
      if (Number(o.discount_pct) !== Number(n.discount_pct)) fields.discount_pct = { old: Number(o.discount_pct), new: Number(n.discount_pct) };
      if (Number(o.tax_rate) !== Number(n.tax_rate)) fields.tax_rate = { old: Number(o.tax_rate), new: Number(n.tax_rate) };
      if (Number(o.total_amount) !== Number(n.total_amount)) fields.total = { old: Number(o.total_amount), new: Number(n.total_amount) };
      if (Object.keys(fields).length) modified.push({ item_name: n.item_name, fields });
    }
  }
  for (const [k, o] of oldMap.entries()) {
    if (!newMap.has(k)) removed.push({ item_name: o.item_name, quantity: Number(o.quantity), price: Number(o.price), total: Number(o.total_amount) });
  }

  return { header, lines: { added, removed, modified } };
}

function summarizeDiff(diff: any): string {
  const parts: string[] = [];
  const hKeys = Object.keys(diff.header || {});
  if (hKeys.length) parts.push(`${hKeys.length} field${hKeys.length === 1 ? "" : "s"} changed`);
  const a = diff.lines?.added?.length ?? 0;
  const r = diff.lines?.removed?.length ?? 0;
  const m = diff.lines?.modified?.length ?? 0;
  if (a) parts.push(`+${a} line${a === 1 ? "" : "s"}`);
  if (r) parts.push(`−${r} line${r === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} line${m === 1 ? "" : "s"} modified`);
  return parts.join(" · ") || "No changes";
}

function HistoryDiffView({ changes }: { changes: any }) {
  const header = changes?.header ?? {};
  const lines = changes?.lines ?? { added: [], removed: [], modified: [] };
  const hKeys = Object.keys(header);
  return (
    <div className="space-y-2 text-xs">
      {hKeys.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Header changes</div>
          {hKeys.map((k) => {
            const v = header[k];
            return (
              <div key={k} className="flex items-baseline gap-2">
                <span className="font-medium">{v.label}:</span>
                <span className="line-through text-danger">{fmtVal(v.old)}</span>
                <span>→</span>
                <span className="text-success">{fmtVal(v.new)}</span>
              </div>
            );
          })}
        </div>
      )}
      {lines.added?.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Added lines</div>
          {lines.added.map((l: any, i: number) => (
            <div key={i} className="text-success">+ {l.item_name} × {l.quantity} @ {l.price}</div>
          ))}
        </div>
      )}
      {lines.removed?.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Removed lines</div>
          {lines.removed.map((l: any, i: number) => (
            <div key={i} className="text-danger">− {l.item_name} × {l.quantity} @ {l.price}</div>
          ))}
        </div>
      )}
      {lines.modified?.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Modified lines</div>
          {lines.modified.map((l: any, i: number) => (
            <div key={i}>
              <div className="font-medium">{l.item_name}</div>
              {Object.entries(l.fields).map(([fk, fv]: any) => (
                <div key={fk} className="ml-3 flex items-baseline gap-2">
                  <span className="text-muted-foreground">{fk}:</span>
                  <span className="line-through text-danger">{fmtVal(fv.old)}</span>
                  <span>→</span>
                  <span className="text-success">{fmtVal(fv.new)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

