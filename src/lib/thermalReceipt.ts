// Thermal 80mm POS receipt (jsPDF)
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { buildUpiUri } from "@/lib/invoicePdf";

export interface ThermalUpi {
  upi_id?: string | null;
  upi_payee_name?: string | null;
  show_upi_qr?: boolean | null;
}

const formatRs = (n: number): string => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}Rs.${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs)}`;
};

export interface ThermalBusiness {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  address?: string | null;
}
export interface ThermalLine {
  item_name: string;
  quantity: number;
  unit?: string | null;
  price: number;
  total_amount: number;
}
export interface ThermalReceipt {
  invoice_number: string;
  invoice_date: string;
  party_name?: string | null;
  party_phone?: string | null;
  cashier?: string | null;
  lines: ThermalLine[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  round_off: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_method?: string | null;
  footer?: string | null;
}

export function generateThermalReceipt(biz: ThermalBusiness, r: ThermalReceipt): jsPDF {
  const W = 80;          // 80mm paper width
  const M = 3;           // margin
  const innerW = W - M * 2;

  // Column layout (right-aligned columns) — widened gaps to avoid overlap
  const COL_AMT = W - M;            // right edge for Amount
  const COL_RATE = COL_AMT - 20;    // right edge for Rate
  const COL_QTY = COL_RATE - 18;    // right edge for Qty
  const NAME_W = COL_QTY - M - 14;  // wrap width for item name (gap before qty)

  // Estimate height (extra padding so nothing clips)
  const estHeight = 100 + r.lines.length * 10 + (r.party_name ? 6 : 0) + (r.footer ? 12 : 0);
  const doc = new jsPDF({ unit: "mm", format: [W, estHeight] });

  let y = M + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(biz.name, W / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  if (biz.address) {
    const addr = doc.splitTextToSize(biz.address, innerW);
    doc.text(addr, W / 2, y, { align: "center" });
    y += addr.length * 3;
  }
  if (biz.phone) { doc.text(`Ph: ${biz.phone}`, W / 2, y, { align: "center" }); y += 3; }
  if (biz.gstin) { doc.text(`GSTIN: ${biz.gstin}`, W / 2, y, { align: "center" }); y += 3; }

  y += 1;
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 3.5;
  doc.setLineDashPattern([], 0);

  doc.setFontSize(8);
  doc.text(`Bill: ${r.invoice_number}`, M, y);
  doc.text(r.invoice_date, W - M, y, { align: "right" }); y += 4;
  if (r.party_name) { doc.text(`Customer: ${r.party_name}`, M, y); y += 3.5; }
  if (r.cashier) { doc.text(`Cashier: ${r.cashier}`, M, y); y += 3.5; }

  y += 1;
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 3.5;
  doc.setLineDashPattern([], 0);

  // Item header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Item", M, y);
  doc.text("Qty", COL_QTY, y, { align: "right" });
  doc.text("Rate", COL_RATE, y, { align: "right" });
  doc.text("Amt", COL_AMT, y, { align: "right" });
  y += 2;
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += 4;
  doc.setFont("helvetica", "normal");

  // Items
  for (const ln of r.lines) {
    const nameLines = doc.splitTextToSize(ln.item_name, NAME_W);
    const qty = `${ln.quantity}${ln.unit ? " " + ln.unit : ""}`;
    doc.text(nameLines, M, y);
    doc.text(qty, COL_QTY, y, { align: "right" });
    doc.text(formatRs(ln.price).replace("Rs.", ""), COL_RATE, y, { align: "right" });
    doc.text(formatRs(ln.total_amount).replace("Rs.", ""), COL_AMT, y, { align: "right" });
    const lineH = Math.max(nameLines.length * 3.2, 3.2);
    y += lineH + 2;
  }

  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 3.5;
  doc.setLineDashPattern([], 0);

  const row = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, M, y);
    doc.text(val, W - M, y, { align: "right" });
    y += bold ? 4.2 : 3.6;
  };
  doc.setFontSize(8);
  row("Subtotal", formatRs(r.subtotal));
  if (r.discount_amount) row("Discount", `- ${formatRs(r.discount_amount)}`);
  if (r.tax_amount) row("Tax", formatRs(r.tax_amount));
  if (r.round_off) row("Round off", formatRs(r.round_off));
  y += 0.5;
  doc.setFontSize(10);
  row("TOTAL", formatRs(r.total_amount), true);
  doc.setFontSize(8);
  if (r.payment_method) row(`Paid (${r.payment_method})`, formatRs(r.paid_amount));
  else row("Paid", formatRs(r.paid_amount));
  if (r.balance_amount > 0) row("Balance", formatRs(r.balance_amount), true);
  else if (r.balance_amount < 0) row("Change", formatRs(-r.balance_amount), true);

  y += 2;
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 4;
  doc.setLineDashPattern([], 0);

  doc.setFontSize(8);
  doc.text("Thank you! Visit again.", W / 2, y, { align: "center" });
  if (r.footer) {
    y += 3.5;
    doc.setFontSize(7);
    const f = doc.splitTextToSize(r.footer, innerW);
    doc.text(f, W / 2, y, { align: "center" });
  }

  return doc;
}
