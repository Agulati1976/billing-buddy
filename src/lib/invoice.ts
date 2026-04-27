// Invoice helpers — GST calculation, numbering, type labels
import type { Database } from "@/integrations/supabase/types";

export type InvoiceType = Database["public"]["Enums"]["invoice_type"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export interface InvoiceLineInput {
  item_id: string | null;
  item_name: string;
  hsn_code: string | null;
  quantity: number;
  unit: string | null;
  price: number;
  discount_pct: number;
  tax_rate: number;
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
  opts: { isGst?: boolean; extraDiscount?: number } = {}
): InvoiceTotals {
  const isGst = opts.isGst !== false; // default true
  const extraDiscount = Number(opts.extraDiscount) || 0;

  const computed: ComputedLine[] = lines.map((l) => {
    const gross = (Number(l.quantity) || 0) * (Number(l.price) || 0);
    const discount = (gross * (Number(l.discount_pct) || 0)) / 100;
    const taxable = gross - discount;
    const effectiveRate = isGst ? (Number(l.tax_rate) || 0) : 0;
    const tax = (taxable * effectiveRate) / 100;
    return {
      ...l,
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
    (s, l) => s + ((Number(l.quantity) || 0) * (Number(l.price) || 0) * (Number(l.discount_pct) || 0)) / 100,
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

export const INVOICE_TYPE_META: Record<
  InvoiceType,
  { label: string; prefix: string; color: string }
> = {
  sale: { label: "Sale Invoice", prefix: "INV", color: "primary" },
  purchase: { label: "Purchase Bill", prefix: "PUR", color: "primary" },
  quotation: { label: "Quotation", prefix: "QUO", color: "warning" },
  sale_return: { label: "Sale Return", prefix: "SR", color: "danger" },
  purchase_return: { label: "Purchase Return", prefix: "PR", color: "danger" },
  credit_note: { label: "Credit Note", prefix: "CN", color: "warning" },
  debit_note: { label: "Debit Note", prefix: "DN", color: "warning" },
};

export const STATUS_META: Record<InvoiceStatus, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-muted text-muted-foreground" },
  unpaid: { label: "Unpaid", classes: "bg-danger-soft text-danger" },
  partial: { label: "Partial", classes: "bg-warning-soft text-warning" },
  paid: { label: "Paid", classes: "bg-success-soft text-success" },
  overdue: { label: "Overdue", classes: "bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", classes: "bg-muted text-muted-foreground" },
};

// Suggest next invoice number: PREFIX/YYYY/0001
export function nextInvoiceNumber(prefix: string, lastNumber: string | null): string {
  const year = new Date().getFullYear();
  if (!lastNumber) return `${prefix}/${year}/0001`;
  const m = lastNumber.match(/(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `${prefix}/${year}/${String(n).padStart(4, "0")}`;
}
