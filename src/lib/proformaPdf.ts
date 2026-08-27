// Proforma / Delivery-Copy PDF — renders the SAME sale invoice twice on one A4 page,
// "Original Copy" on top and "Duplicate Copy" on the bottom, matching the classic
// two-copy printed tax-invoice slip shopkeepers hand to a delivery agent: the top
// copy stays with the customer, the bottom copy is signed by the receiver and kept
// as proof of delivery.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PdfBusiness, PdfParty, PdfInvoice } from "@/lib/invoicePdf";

const formatINR = (n: number): string => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  return `${sign}Rs. ${formatted}`;
};

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 8;

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
      " (" + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + ")";
  } catch { return iso; }
}

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
  const twoDigits = (n: number): string => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""));
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

/** Renders one "copy" (Original / Duplicate) into the given vertical slot of the page. */
function renderCopy(
  doc: jsPDF,
  business: PdfBusiness,
  party: PdfParty | null,
  invoice: PdfInvoice,
  taxableTotal: number,
  startY: number,
  blockH: number,
  copyLabel: "Original Copy" | "Duplicate Copy",
) {
  const contentW = PAGE_W - MARGIN * 2;
  let y = startY;

  // Outer border for this copy
  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, startY, contentW, blockH);

  const padX = 3;

  // Top strip: business GSTIN | TAX INVOICE | copy label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60);
  if (business.gstin) doc.text(`GSTIN: ${business.gstin}`, MARGIN + padX, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text("TAX INVOICE", PAGE_W / 2, y + 5.5, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(copyLabel, PAGE_W - MARGIN - padX, y + 5, { align: "right" });

  y += 8;
  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  // Business (left) / Billed to (right)
  const colW = contentW / 2;
  const leftX = MARGIN + padX;
  const rightX = MARGIN + colW + padX;
  const boxTop = y + 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(business.name || "—", leftX, boxTop + 4, { maxWidth: colW - padX * 2 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70);
  const bizLines: string[] = [];
  if (business.address) bizLines.push(business.address);
  const bizCity = [business.state, business.state_code ? `State Code: ${business.state_code}` : null].filter(Boolean).join(" · ");
  if (bizCity) bizLines.push(bizCity);
  const bizContact = [business.phone, business.email].filter(Boolean).join(" · ");
  if (bizContact) bizLines.push(bizContact);
  doc.text(bizLines, leftX, boxTop + 9, { maxWidth: colW - padX * 2 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(20);
  doc.text(`Billed to: ${party?.name ?? "Walking Customer"}`, rightX, boxTop + 4, { maxWidth: colW - padX * 2 });
  doc.setFontSize(8);
  doc.setTextColor(70);
  doc.text(`Address : ${party?.billing_address ?? ""}`, rightX, boxTop + 9, { maxWidth: colW - padX * 2 });
  doc.text(`GSTIN : ${party?.gstin ?? ""}`, rightX, boxTop + 14, { maxWidth: colW - padX * 2 });

  y = boxTop + 18;
  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);

  // Meta strip: Invoice No. | Dated | Place of Supply
  const metaColW = contentW / 3;
  doc.setFontSize(8);
  doc.setTextColor(20);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice No. : ${invoice.invoice_number}`, MARGIN + padX, y + 5);
  doc.text(`Dated : ${formatDateTime(invoice.invoice_date)}`, MARGIN + metaColW + padX, y + 5);
  const placeOfSupply = party?.state_code ? `${party.state ?? ""} (${party.state_code})` : (business.state_code ? `${business.state ?? ""} (${business.state_code})` : "—");
  doc.text(`Place of Supply : ${placeOfSupply}`, MARGIN + metaColW * 2 + padX, y + 5);

  y += 8;
  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 1.5;

  // Line items table
  const showIgst = invoice.is_inter_state;
  const head = showIgst
    ? [["Goods / Services supplied", "HSN/SAC", "Qty.", "Unit", "List Price", "IGST (%)", "IGST Amt.", "Amount (Rs.)"]]
    : [["Goods / Services supplied", "HSN/SAC", "Qty.", "Unit", "List Price", "CGST (%)", "CGST Amt.", "SGST (%)", "SGST Amt.", "Amount (Rs.)"]];

  const body = invoice.lines.map((l) => {
    const cgstPct = showIgst ? 0 : l.tax_rate / 2;
    const sgstPct = showIgst ? 0 : l.tax_rate / 2;
    const cgstAmt = showIgst ? 0 : l.tax_amount / 2;
    const sgstAmt = showIgst ? 0 : l.tax_amount / 2;
    return showIgst
      ? [l.item_name, l.hsn_code ?? "—", fmtNum(l.quantity), l.unit ?? "—", fmtAmt(l.price), `${l.tax_rate}%`, fmtAmt(l.tax_amount), fmtAmt(l.total_amount)]
      : [l.item_name, l.hsn_code ?? "—", fmtNum(l.quantity), l.unit ?? "—", fmtAmt(l.price), `${cgstPct}%`, fmtAmt(cgstAmt), `${sgstPct}%`, fmtAmt(sgstAmt), fmtAmt(l.total_amount)];
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.3, lineColor: [180, 180, 180], textColor: 30 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold", halign: "center", fontSize: 6.5 },
    columnStyles: showIgst ? {
      0: { cellWidth: 56 }, 1: { halign: "center", cellWidth: 20 }, 2: { halign: "right", cellWidth: 14 },
      3: { halign: "center", cellWidth: 16 }, 4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 16 }, 6: { halign: "right", cellWidth: 20 }, 7: { halign: "right", cellWidth: 22 },
    } : {
      0: { cellWidth: 40 }, 1: { halign: "center", cellWidth: 16 }, 2: { halign: "right", cellWidth: 10 },
      3: { halign: "center", cellWidth: 12 }, 4: { halign: "right", cellWidth: 18 },
      5: { halign: "right", cellWidth: 12 }, 6: { halign: "right", cellWidth: 16 },
      7: { halign: "right", cellWidth: 12 }, 8: { halign: "right", cellWidth: 16 }, 9: { halign: "right", cellWidth: 20 },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: contentW,
    pageBreak: "avoid",
  });

  // @ts-ignore
  let cy: number = ((doc as any).lastAutoTable?.finalY ?? y + 10) + 2;

  // Grand Total bar (right-aligned)
  const gtW = 70;
  const gtX = PAGE_W - MARGIN - gtW;

  // Round off (shown so the Grand Total reconciles with Taxable + CGST/SGST below)
  if (invoice.round_off) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(70);
    doc.text(`Round Off: ${invoice.round_off > 0 ? "+" : "-"}Rs. ${Math.abs(invoice.round_off).toFixed(2)}`, gtX + gtW - 2, cy - 1, { align: "right" });
    cy += 4;
  }

  doc.setDrawColor(150);
  doc.setFillColor(245, 245, 245);
  doc.rect(gtX, cy, gtW, 7, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20);
  doc.text("Grand Total Rs.", gtX + 2, cy + 4.8);
  doc.text(formatINR(invoice.total_amount).replace("Rs. ", ""), gtX + gtW - 2, cy + 4.8, { align: "right" });
  cy += 10;

  // GST summary strip
  const sumHead = showIgst
    ? [["Tax Rate", "Taxable Amt.", "IGST Amt.", "Total Tax"]]
    : [["Tax Rate", "Taxable Amt.", "CGST Amt.", "SGST Amt.", "Total Tax"]];
  const effRate = taxableTotal > 0 ? Math.round(((invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount) / taxableTotal) * 10000) / 100 : 0;
  const totalTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount;
  const sumBody = showIgst
    ? [[`${effRate}%`, fmtAmt(taxableTotal), fmtAmt(invoice.igst_amount), fmtAmt(totalTax)]]
    : [[`${effRate}%`, fmtAmt(taxableTotal), fmtAmt(invoice.cgst_amount), fmtAmt(invoice.sgst_amount), fmtAmt(totalTax)]];

  autoTable(doc, {
    startY: cy,
    head: sumHead,
    body: sumBody,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.2, lineColor: [180, 180, 180], textColor: 30, halign: "right" },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold", halign: "right", fontSize: 6.5 },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: contentW,
    pageBreak: "avoid",
  });
  // @ts-ignore
  cy = ((doc as any).lastAutoTable?.finalY ?? cy + 8) + 2;

  // Amount in words
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30);
  doc.text(numberToWordsINR(invoice.total_amount), MARGIN + padX, cy + 3.5, { maxWidth: contentW - padX * 2 });

  // Signature row — pinned to the bottom of this copy's block
  const sigY = startY + blockH - 6;
  doc.setDrawColor(160);
  doc.setLineWidth(0.2);
  doc.line(MARGIN + padX, sigY, MARGIN + 45, sigY);
  doc.line(PAGE_W - MARGIN - 45, sigY, PAGE_W - MARGIN - padX, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(50);
  doc.text(copyLabel === "Duplicate Copy" ? "Receiver's Signature" : "Signature", MARGIN + padX, sigY + 4);
  doc.text("Authorised Signatory", PAGE_W - MARGIN - padX, sigY + 4, { align: "right" });
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
function fmtAmt(n: number): string {
  return (Number(n) || 0).toFixed(2);
}

/** Generates one A4 page with the invoice printed twice — Original Copy (top) and
 *  Duplicate Copy (bottom, for the delivery agent to get signed). */
export function generateProformaDeliveryPdf(
  business: PdfBusiness,
  party: PdfParty | null,
  invoice: PdfInvoice,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Derived from the invoice's own saved totals (not summed from lines) so the
  // printed Taxable / CGST / SGST / Round Off always add up to the Grand Total —
  // an invoice-level extra discount reduces the total without being redistributed
  // back onto each line's own taxable_amount.
  const taxableTotal = invoice.total_amount - invoice.cgst_amount - invoice.sgst_amount - invoice.igst_amount - invoice.round_off;

  const usableH = PAGE_H - MARGIN * 2;
  const gap = 4;
  const blockH = (usableH - gap) / 2;
  const topY = MARGIN;
  const bottomY = MARGIN + blockH + gap;

  renderCopy(doc, business, party, invoice, taxableTotal, topY, blockH, "Original Copy");

  // Cut line between the two copies
  doc.setDrawColor(140);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(MARGIN, topY + blockH + gap / 2, PAGE_W - MARGIN, topY + blockH + gap / 2);
  doc.setLineDashPattern([], 0);

  renderCopy(doc, business, party, invoice, taxableTotal, bottomY, blockH, "Duplicate Copy");

  return doc;
}
