// Thermal 80mm POS receipt (jsPDF)
import jsPDF from "jspdf";

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
  const M = 4;           // margin
  const innerW = W - M * 2;
  // Estimate height
  const estHeight = 80 + r.lines.length * 8 + (r.party_name ? 8 : 0);
  const doc = new jsPDF({ unit: "mm", format: [W, estHeight] });

  let y = M + 2;
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
  doc.line(M, y, W - M, y); y += 3;
  doc.setLineDashPattern([], 0);

  doc.setFontSize(8);
  doc.text(`Bill: ${r.invoice_number}`, M, y);
  doc.text(r.invoice_date, W - M, y, { align: "right" }); y += 4;
  if (r.party_name) { doc.text(`Customer: ${r.party_name}`, M, y); y += 3; }
  if (r.cashier) { doc.text(`Cashier: ${r.cashier}`, M, y); y += 3; }

  y += 1;
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 3;
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Item", M, y);
  doc.text("Qty", W - M - 22, y, { align: "right" });
  doc.text("Rate", W - M - 12, y, { align: "right" });
  doc.text("Amt", W - M, y, { align: "right" });
  y += 3;
  doc.line(M, y - 1, W - M, y - 1);
  doc.setFont("helvetica", "normal");

  for (const ln of r.lines) {
    const name = doc.splitTextToSize(ln.item_name, innerW - 30);
    doc.text(name, M, y);
    const lineH = name.length * 3;
    doc.text(`${ln.quantity}${ln.unit ? ln.unit : ""}`, W - M - 22, y, { align: "right" });
    doc.text(formatRs(ln.price).replace("Rs.", ""), W - M - 12, y, { align: "right" });
    doc.text(formatRs(ln.total_amount).replace("Rs.", ""), W - M, y, { align: "right" });
    y += Math.max(lineH, 3) + 1;
  }

  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 3;
  doc.setLineDashPattern([], 0);

  const row = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, M, y);
    doc.text(val, W - M, y, { align: "right" });
    y += bold ? 4 : 3.2;
  };
  row("Subtotal", formatRs(r.subtotal));
  if (r.discount_amount) row("Discount", `- ${formatRs(r.discount_amount)}`);
  if (r.tax_amount) row("Tax", formatRs(r.tax_amount));
  if (r.round_off) row("Round off", formatRs(r.round_off));
  doc.setFontSize(9);
  row("TOTAL", formatRs(r.total_amount), true);
  doc.setFontSize(7);
  if (r.payment_method) row(`Paid (${r.payment_method})`, formatRs(r.paid_amount));
  else row("Paid", formatRs(r.paid_amount));
  if (r.balance_amount > 0) row("Balance", formatRs(r.balance_amount), true);
  else if (r.balance_amount < 0) row("Change", formatRs(-r.balance_amount), true);

  y += 2;
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(M, y, W - M, y); y += 3;
  doc.setLineDashPattern([], 0);

  doc.setFontSize(7);
  doc.text("Thank you! Visit again.", W / 2, y, { align: "center" });
  if (r.footer) {
    y += 3;
    const f = doc.splitTextToSize(r.footer, innerW);
    doc.text(f, W / 2, y, { align: "center" });
  }

  return doc;
}
