// Professional Tax Invoice PDF generator (jsPDF + autotable)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
// PDF-safe currency: "Rs." prefix (built-in PDF fonts lack the ₹ glyph)
const formatINR = (n: number): string => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  return `${sign}Rs. ${formatted}`;
};
import { INVOICE_TYPE_META, type InvoiceType } from "@/lib/invoice";

/** Build a UPI deep-link string per NPCI spec. */
export function buildUpiUri(opts: { pa: string; pn?: string; am?: number; tn?: string; tr?: string }) {
  const params = new URLSearchParams();
  params.set("pa", opts.pa);
  if (opts.pn) params.set("pn", opts.pn);
  if (opts.am && opts.am > 0) params.set("am", opts.am.toFixed(2));
  params.set("cu", "INR");
  if (opts.tn) params.set("tn", opts.tn);
  if (opts.tr) params.set("tr", opts.tr);
  return `upi://pay?${params.toString()}`;
}

export interface PdfBusiness {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state?: string | null;
  state_code?: string | null;
}

export interface PdfParty {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  state?: string | null;
  state_code?: string | null;
}

export interface PdfLine {
  item_name: string;
  hsn_code?: string | null;
  quantity: number;
  unit?: string | null;
  price: number;
  discount_pct: number;
  tax_rate: number;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
}

export interface PdfInvoice {
  type: InvoiceType;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  is_inter_state: boolean;
  subtotal: number;
  discount_amount: number;
  taxable_total: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  total_amount: number;
  paid_amount?: number;
  balance_amount?: number;
  notes?: string | null;
  terms?: string | null;
  lines: PdfLine[];
}

export interface InvoiceDesign {
  template?: string;            // 'classic' | 'modern' | 'minimal'
  accent_color?: string;        // hex like '#2563EB'
  footer_text?: string | null;
  signature_label?: string | null;
  show_signature?: boolean;
  show_amount_in_words?: boolean;
  upi_id?: string | null;
  upi_payee_name?: string | null;
  show_upi_qr?: boolean;
}

const PAGE_W = 210; // A4 mm
const MARGIN = 12;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function generateInvoicePdf(
  business: PdfBusiness,
  party: PdfParty | null,
  invoice: PdfInvoice,
  design?: InvoiceDesign,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const meta = INVOICE_TYPE_META[invoice.type];
  const isQuotation = invoice.type === "quotation";
  const docTitle = isQuotation ? "QUOTATION" : "TAX INVOICE";

  const template = design?.template ?? "classic";
  const isMinimal = template === "minimal";
  const isModern = template === "modern";
  const accent: [number, number, number] = isMinimal
    ? [30, 30, 30]
    : hexToRgb(design?.accent_color ?? "#2563EB");
  const showSig = design?.show_signature ?? true;
  const showWords = design?.show_amount_in_words ?? true;
  const sigLabel = design?.signature_label ?? "Authorised Signatory";
  const footer = design?.footer_text ?? "This is a computer-generated invoice and does not require a physical signature.";

  // Header band
  if (isModern) {
    // Left accent stripe instead of full band
    doc.setFillColor(...accent);
    doc.rect(0, 0, 4, 297, "F");
    doc.setTextColor(30, 30, 30);
  } else {
    doc.setFillColor(...accent);
    doc.rect(0, 0, PAGE_W, 28, "F");
    doc.setTextColor(isMinimal ? 30 : 255, isMinimal ? 30 : 255, isMinimal ? 30 : 255);
    if (isMinimal) {
      // For minimal, draw only a bottom border line
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, PAGE_W, 28, "F");
      doc.setDrawColor(30);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, 28, PAGE_W - MARGIN, 28);
      doc.setTextColor(30, 30, 30);
    }
  }


  // Header text colour: white if dark band, dark for minimal/modern
  if (isModern || isMinimal) doc.setTextColor(30, 30, 30);
  else doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(business.name, isModern ? MARGIN + 4 : MARGIN, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const headerLines: string[] = [];
  if (business.address) headerLines.push(business.address);
  const cityLine = [business.state, business.state_code ? `State Code: ${business.state_code}` : null]
    .filter(Boolean).join(" · ");
  if (cityLine) headerLines.push(cityLine);
  const contact = [business.phone, business.email].filter(Boolean).join(" · ");
  if (contact) headerLines.push(contact);
  if (business.gstin) headerLines.push(`GSTIN: ${business.gstin}`);
  doc.text(headerLines, isModern ? MARGIN + 4 : MARGIN, 17, { maxWidth: 120 });

  // Title (right side)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(docTitle, PAGE_W - MARGIN, 12, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(meta.label, PAGE_W - MARGIN, 17, { align: "right" });

  // Invoice meta box
  let y = 36;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);

  // Two columns: Bill To (left), Invoice details (right)
  const colW = (PAGE_W - MARGIN * 2 - 4) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 4;

  // Bill To box
  doc.setDrawColor(220);
  doc.setFillColor(248, 250, 252);
  doc.rect(leftX, y, colW, 38, "FD");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("BILL TO", leftX + 3, y + 5);
  doc.setTextColor(30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(party?.name ?? "—", leftX + 3, y + 11, { maxWidth: colW - 6 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const partyLines: string[] = [];
  if (party?.billing_address) partyLines.push(party.billing_address);
  const partyState = [party?.state, party?.state_code ? `Code: ${party.state_code}` : null]
    .filter(Boolean).join(" · ");
  if (partyState) partyLines.push(partyState);
  const partyContact = [party?.phone, party?.email].filter(Boolean).join(" · ");
  if (partyContact) partyLines.push(partyContact);
  if (party?.gstin) partyLines.push(`GSTIN: ${party.gstin}`);
  doc.text(partyLines.length ? partyLines : ["—"], leftX + 3, y + 16, { maxWidth: colW - 6 });

  // Invoice details box
  doc.setDrawColor(220);
  doc.setFillColor(248, 250, 252);
  doc.rect(rightX, y, colW, 38, "FD");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("INVOICE DETAILS", rightX + 3, y + 5);
  doc.setTextColor(30);
  doc.setFontSize(9);

  const details: [string, string][] = [
    [`${isQuotation ? "Quotation" : "Invoice"} No.`, invoice.invoice_number],
    ["Date", formatDate(invoice.invoice_date)],
  ];
  if (invoice.due_date) details.push(["Due Date", formatDate(invoice.due_date)]);
  details.push(["Place of Supply", party?.state_code ? `${party.state ?? ""} (${party.state_code})` : "—"]);
  details.push(["Supply Type", invoice.is_inter_state ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"]);

  let dy = y + 10;
  details.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(k, rightX + 3, dy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text(v, rightX + colW - 3, dy, { align: "right" });
    dy += 5;
  });

  y += 42;

  // Line items table
  const showIgst = invoice.is_inter_state;
  const head = showIgst
    ? [["#", "Item", "HSN", "Qty", "Rate", "Disc%", "Taxable", "IGST%", "Amount"]]
    : [["#", "Item", "HSN", "Qty", "Rate", "Disc%", "Taxable", "GST%", "Amount"]];

  const body = invoice.lines.map((l, i) => [
    String(i + 1),
    l.item_name + (l.unit ? `\n(${l.unit})` : ""),
    l.hsn_code ?? "—",
    fmtNum(l.quantity),
    formatINR(l.price),
    l.discount_pct ? `${l.discount_pct}%` : "—",
    formatINR(l.taxable_amount),
    `${l.tax_rate}%`,
    formatINR(l.total_amount),
  ]);

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, lineColor: [220, 220, 220] },
    headStyles: { fillColor: accent, textColor: isMinimal ? 30 : 255, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: 50 },
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "right", cellWidth: 14 },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 24 },
      7: { halign: "right", cellWidth: 14 },
      8: { halign: "right", cellWidth: 24 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // @ts-ignore — autotable adds lastAutoTable
  let tableEnd: number = (doc as any).lastAutoTable?.finalY ?? y + 30;
  let cy = tableEnd + 4;

  // Totals box (right)
  const totalsW = 80;
  const totalsX = PAGE_W - MARGIN - totalsW;
  const totalsRows: [string, string][] = [
    ["Subtotal", formatINR(invoice.subtotal)],
  ];
  if (invoice.discount_amount > 0) totalsRows.push(["Discount", `− ${formatINR(invoice.discount_amount)}`]);
  totalsRows.push(["Taxable Amount", formatINR(invoice.taxable_total)]);
  if (showIgst) {
    totalsRows.push(["IGST", formatINR(invoice.igst_amount)]);
  } else {
    totalsRows.push(["CGST", formatINR(invoice.cgst_amount)]);
    totalsRows.push(["SGST", formatINR(invoice.sgst_amount)]);
  }
  if (invoice.round_off !== 0) totalsRows.push(["Round Off", formatINR(invoice.round_off)]);

  doc.setDrawColor(220);
  doc.setFillColor(248, 250, 252);
  const totalsH = totalsRows.length * 5.5 + 12;
  doc.rect(totalsX, cy, totalsW, totalsH, "FD");

  let ty = cy + 5;
  doc.setFontSize(9);
  totalsRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(k, totalsX + 3, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text(v, totalsX + totalsW - 3, ty, { align: "right" });
    ty += 5.5;
  });

  // Grand total bar
  doc.setFillColor(...accent);
  doc.rect(totalsX, ty - 1, totalsW, 8, "F");
  doc.setTextColor(isMinimal ? 30 : 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", totalsX + 3, ty + 4.5);
  doc.text(formatINR(invoice.total_amount), totalsX + totalsW - 3, ty + 4.5, { align: "right" });

  // Amount in words (left side)
  if (showWords) {
    doc.setTextColor(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("AMOUNT IN WORDS", MARGIN, cy + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(numberToWordsINR(invoice.total_amount), MARGIN, cy + 10, { maxWidth: PAGE_W - MARGIN * 2 - totalsW - 4 });
  }

  if (typeof invoice.paid_amount === "number" && invoice.paid_amount > 0) {
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Paid: ${formatINR(invoice.paid_amount)}   Balance: ${formatINR(invoice.balance_amount ?? 0)}`,
      MARGIN, cy + (showWords ? 18 : 6));
  }

  // Notes & Terms
  let by = cy + totalsH + 8;
  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text("Notes", MARGIN, by);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    const noteLines = doc.splitTextToSize(invoice.notes, PAGE_W - MARGIN * 2);
    doc.text(noteLines, MARGIN, by + 4);
    by += 4 + noteLines.length * 4 + 4;
  }
  if (invoice.terms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text("Terms & Conditions", MARGIN, by);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    const tLines = doc.splitTextToSize(invoice.terms, PAGE_W - MARGIN * 2);
    doc.text(tLines, MARGIN, by + 4);
    by += 4 + tLines.length * 4 + 4;
  }

  // UPI QR (sale invoices only, when configured)
  const showQr = (design?.show_upi_qr ?? true) && !!design?.upi_id && invoice.type === "sale" && invoice.total_amount > 0;
  const pageH = doc.internal.pageSize.getHeight();
  if (showQr) {
    try {
      const upiUri = buildUpiUri({
        pa: design!.upi_id!,
        pn: design!.upi_payee_name || business.name,
        am: invoice.balance_amount && invoice.balance_amount > 0 ? invoice.balance_amount : invoice.total_amount,
        tn: `Inv ${invoice.invoice_number}`,
        tr: invoice.invoice_number,
      });
      const dataUrl = await QRCode.toDataURL(upiUri, { margin: 1, width: 256, errorCorrectionLevel: "M" });
      const qrSize = 30;
      const qrY = Math.min(by + 4, pageH - qrSize - 22);
      doc.addImage(dataUrl, "PNG", MARGIN, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30);
      doc.text("Pay via UPI", MARGIN + qrSize + 3, qrY + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.text(`UPI ID: ${design!.upi_id}`, MARGIN + qrSize + 3, qrY + 10);
      doc.text(`Amount: ${formatINR(invoice.balance_amount && invoice.balance_amount > 0 ? invoice.balance_amount : invoice.total_amount)}`,
        MARGIN + qrSize + 3, qrY + 15);
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text("Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)", MARGIN + qrSize + 3, qrY + 20, { maxWidth: 90 });
      by = qrY + qrSize + 4;
    } catch (e) {
      // ignore QR failure — invoice still renders
    }
  }

  let sigY = by + 14;
  if (showSig) {
    sigY = Math.max(by + 14, pageH - 30);
    doc.setDrawColor(180);
    doc.line(PAGE_W - MARGIN - 60, sigY, PAGE_W - MARGIN, sigY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`For ${business.name}`, PAGE_W - MARGIN, sigY + 4, { align: "right" });
    doc.setFontSize(8);
    doc.text(sigLabel, PAGE_W - MARGIN, sigY + 9, { align: "right" });
  }

  // Footer
  if (footer) {
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(footer, PAGE_W / 2, pageH - 8, { align: "center" });
  }

  return doc;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

// Number to Indian Rupee words
function numberToWordsINR(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const words = inWords(rupees);
  let out = `${words} Rupees`;
  if (paise > 0) out += ` and ${inWords(paise)} Paise`;
  return out + " Only";
}

function inWords(num: number): string {
  if (num === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigits = (n: number): string => {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  };
  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
  };

  let n = num;
  let result = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;

  if (crore) result += twoDigits(crore) + " Crore ";
  if (lakh) result += twoDigits(lakh) + " Lakh ";
  if (thousand) result += twoDigits(thousand) + " Thousand ";
  if (hundred) result += threeDigits(hundred);
  return result.trim();
}
