// Invoice helpers — GST calculation, numbering, type labels
import type { Database } from "@/integrations/supabase/types";

export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export type DiscountMode = "pct" | "amt";

export interface InvoiceLineInput {
  item_id: string | null;
  item_name: string;
  hsn_code: string | null;
  quantity: number;
  unit: string | null;
  price: number;
  discount_pct: number;
  /** Optional flat ₹ discount on this line. When set & > 0, overrides discount_pct. */
  discount_amount?: number;
  /** UI-only: how the user is entering the discount. Not persisted. */
  discount_mode?: DiscountMode;
  tax_rate: number;
  batch_id?: string | null;
}

export interface ComputedLine extends InvoiceLineInput {
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
}

export interface InvoiceTotals {
  lines: ComputedLine[];
  subtotal: number;
  discount_amount: number;
  extra_discount: number;
  taxable_total: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  total_amount: number;
}

export function computeInvoice(
  lines: InvoiceLineInput[],
  isInterState: boolean,
  opts: { isGst?: boolean; extraDiscount?: number; pricesIncludeTax?: boolean } = {}
): InvoiceTotals {
  const isGst = opts.isGst !== false; // default true
  const extraDiscount = Number(opts.extraDiscount) || 0;
  const pricesIncludeTax = !!opts.pricesIncludeTax;

  const computed: ComputedLine[] = lines.map((l) => {
    const qty = Number(l.quantity) || 0;
    const enteredPrice = Number(l.price) || 0;
    const effectiveRate = isGst ? (Number(l.tax_rate) || 0) : 0;
    // When prices are tax-inclusive, derive net unit price from the entered (gross) price
    const unitNet = pricesIncludeTax && effectiveRate > 0
      ? enteredPrice / (1 + effectiveRate / 100)
      : enteredPrice;
    const gross = qty * unitNet;
    // Flat ₹ discount: if user entered it in inclusive mode, convert to net
    const flatEntered = Number(l.discount_amount) || 0;
    const flat = pricesIncludeTax && effectiveRate > 0 && flatEntered > 0
      ? flatEntered / (1 + effectiveRate / 100)
      : flatEntered;
    const pct = Number(l.discount_pct) || 0;
    const discount = flat > 0 ? Math.min(flat, gross) : (gross * pct) / 100;
    const effectivePct = gross > 0 ? (discount / gross) * 100 : 0;
    const taxable = gross - discount;
    const tax = (taxable * effectiveRate) / 100;
    return {
      ...l,
      discount_pct: round2(effectivePct),
      tax_rate: effectiveRate,
      taxable_amount: round2(taxable),
      tax_amount: round2(tax),
      total_amount: round2(taxable + tax),
    };
  });

  const subtotal = computed.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0),
    0
  );
  const lineDiscount = computed.reduce(
    (s, l) => s + ((Number(l.quantity) || 0) * (Number(l.price) || 0) - l.taxable_amount),
    0
  );
  const discount_amount = lineDiscount + extraDiscount;
  const taxable_after_lines = computed.reduce((s, l) => s + l.taxable_amount, 0);
  const taxable_total = Math.max(0, taxable_after_lines - extraDiscount);
  const tax_amount = computed.reduce((s, l) => s + l.tax_amount, 0);

  const cgst_amount = isInterState ? 0 : tax_amount / 2;
  const sgst_amount = isInterState ? 0 : tax_amount / 2;
  const igst_amount = isInterState ? tax_amount : 0;

  const raw_total = taxable_total + tax_amount;
  const total_amount = Math.round(raw_total);
  const round_off = round2(total_amount - raw_total);

  return {
    lines: computed,
    subtotal: round2(subtotal),
    discount_amount: round2(discount_amount),
    extra_discount: round2(extraDiscount),
    taxable_total: round2(taxable_total),
    tax_amount: round2(tax_amount),
    cgst_amount: round2(cgst_amount),
    sgst_amount: round2(sgst_amount),
    igst_amount: round2(igst_amount),
    round_off,
    total_amount,
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compose a descriptive item label with brand / variant / color / SKU
 *  so it shows on invoices, POS receipts and PDFs. */
export function composeItemName(it: {
  name: string;
  brand?: string | null;
  flavour?: string | null;
  color?: string | null;
  sku?: string | null;
  unit?: string | null;
  unit_size?: number | null;
}): string {
  const packSize = it.unit_size != null && Number(it.unit_size) > 0
    ? `${Number(it.unit_size)}${(it.unit ?? "").toString().trim().toUpperCase()}`
    : "";
  const variant = [it.brand, it.flavour, it.color, packSize]
    .map((v) => (v ?? "").toString().trim())
    .filter(Boolean)
    .join(" · ");
  const sku = (it.sku ?? "").toString().trim();
  let out = it.name;
  if (variant) out += ` (${variant})`;
  if (sku) out += ` [SKU: ${sku}]`;
  return out;
}

/** Return labeled lines describing an item, for rich UI display.
 *  Only non-empty fields are included. */
export function composeItemLines(it: {
  name: string;
  brand?: string | null;
  flavour?: string | null;
  color?: string | null;
  sku?: string | null;
  unit?: string | null;
  unit_size?: number | null;
}): { label: string; value: string }[] {
  const clean = (v: unknown) => (v ?? "").toString().trim();
  const rows: { label: string; value: string }[] = [];
  if (clean(it.brand)) rows.push({ label: "Brand Name", value: clean(it.brand) });
  if (clean(it.name)) rows.push({ label: "Product Name", value: clean(it.name) });
  if (clean(it.flavour)) rows.push({ label: "Flavour", value: clean(it.flavour) });
  if (clean(it.color)) rows.push({ label: "Color", value: clean(it.color) });
  const unit = clean(it.unit).toUpperCase();
  const size = it.unit_size != null && Number(it.unit_size) > 0 ? Number(it.unit_size) : null;
  if (size != null && unit) rows.push({ label: "Unit", value: `${size} ${unit}` });
  else if (unit) rows.push({ label: "Unit", value: unit });
  if (clean(it.sku)) rows.push({ label: "SKU", value: clean(it.sku) });
  return rows;
}

export const INVOICE_TYPE_META: Record<
  InvoiceType,
  { label: string; prefix: string; color: string; route: string }
> = {
  sale: { label: "Sale Invoice", prefix: "INV", color: "primary", route: "sales" },
  purchase: { label: "Purchase Bill", prefix: "PUR", color: "primary", route: "purchases" },
  quotation: { label: "Quotation", prefix: "QUO", color: "warning", route: "quotations" },
  sale_return: { label: "Sale Return", prefix: "SR", color: "danger", route: "sale_returns" },
  purchase_return: { label: "Purchase Return", prefix: "PR", color: "danger", route: "purchase_returns" },
  credit_note: { label: "Credit Note", prefix: "CN", color: "warning", route: "credit_notes" },
  debit_note: { label: "Debit Note", prefix: "DN", color: "warning", route: "debit_notes" },
  non_inventory: { label: "Quick Invoice", prefix: "QINV", color: "primary", route: "quick_invoices" },
};

export const STATUS_META: Record<InvoiceStatus, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-muted text-muted-foreground" },
  unpaid: { label: "Unpaid", classes: "bg-danger-soft text-danger" },
  partial: { label: "Partial", classes: "bg-warning-soft text-warning" },
  paid: { label: "Paid", classes: "bg-success-soft text-success" },
  overdue: { label: "Overdue", classes: "bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", classes: "bg-muted text-muted-foreground" },
};

// Suggest next invoice number: PREFIX/YYYY/0001 (with optional branch code segment)
export function nextInvoiceNumber(prefix: string, lastNumber: string | null, branchCode?: string | null): string {
  const year = new Date().getFullYear();
  const branchSeg = branchCode ? `/${branchCode}` : "";
  if (!lastNumber) return `${prefix}${branchSeg}/${year}/0001`;
  const m = lastNumber.match(/(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `${prefix}${branchSeg}/${year}/${String(n).padStart(4, "0")}`;
}

// New shop-style invoice number: PINCODE/RANK(3)[/BRANCH]/DDMMYY
export function shopInvoiceBase(pincode: string, rank: number, dateISO: string, branchCode?: string | null): string {
  const d = dateISO ? new Date(dateISO) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const branchSeg = branchCode ? `/${branchCode}` : "";
  return `${pincode}/${String(rank).padStart(3, "0")}${branchSeg}/${dd}${mm}${yy}`;
}

// Pick next available number, adding -N suffix only if base is already taken that day
export function pickShopInvoiceNumber(base: string, existingForDay: string[]): string {
  if (!existingForDay.includes(base)) return base;
  let max = 1;
  for (const n of existingForDay) {
    const m = n.match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${base}-${max + 1}`;
}

