import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, FileText, Receipt } from "lucide-react";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { generateThermalReceipt } from "@/lib/thermalReceipt";

type View = "invoice" | "pos";

export default function PublicInvoiceView() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "invoice";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string>("Document.pdf");
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: res, error } = await supabase.functions.invoke("public-invoice", { body: { id } });
      setLoading(false);
      if (error || (res as any)?.error) { setError((res as any)?.error || error?.message || "Not found"); return; }
      setData(res);
    })();
  }, [id]);

  const setView = (v: View) => {
    params.set("view", v);
    setParams(params, { replace: true });
  };

  useEffect(() => {
    if (!data) return;
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const { invoice, items, business, party, settings } = data;
        const safeNum = String(invoice.invoice_number || "Document").replace(/[\/\\]/g, "-");

        if (view === "invoice") {
          const doc = await generateInvoicePdf(
            {
              name: business?.name ?? "",
              gstin: business?.gstin, phone: business?.phone, email: business?.email,
              address: business?.address, state: business?.state, state_code: business?.state_code,
              logo_url: business?.logo_url,
            },
            party ? {
              name: party.name, gstin: party.gstin, state_code: party.state_code,
              billing_address: party.billing_address ?? null,
              phone: party.phone ?? null, email: party.email ?? null,
              state: party.state ?? null,
            } : null,
            {
              type: invoice.type ?? "sale",
              invoice_number: invoice.invoice_number,
              invoice_date: invoice.invoice_date,
              due_date: invoice.due_date ?? null,
              is_inter_state: !!invoice.is_inter_state,
              subtotal: Number(invoice.subtotal) || 0,
              discount_amount: Number(invoice.discount_amount) || 0,
              taxable_total: Number(invoice.taxable_total ?? invoice.taxable_amount ?? invoice.subtotal) || 0,
              cgst_amount: Number(invoice.cgst_amount) || 0,
              sgst_amount: Number(invoice.sgst_amount) || 0,
              igst_amount: Number(invoice.igst_amount) || 0,
              round_off: Number(invoice.round_off) || 0,
              total_amount: Number(invoice.total_amount) || 0,
              paid_amount: Number(invoice.paid_amount) || 0,
              balance_amount: Number(invoice.balance_amount) || 0,
              notes: invoice.notes, terms: invoice.terms,
              lines: (items ?? []).map((l: any) => ({
                item_name: l.item_name,
                hsn_code: l.hsn_code,
                quantity: Number(l.quantity) || 0,
                unit: l.unit,
                price: Number(l.price) || 0,
                discount_pct: Number(l.discount_pct) || 0,
                tax_rate: Number(l.tax_rate) || 0,
                taxable_amount: Number(l.taxable_amount) || 0,
                tax_amount: Number(l.tax_amount) || 0,
                total_amount: Number(l.total_amount) || 0,
              })),
            },
            settings ? {
              template: settings.template, accent_color: settings.accent_color,
              footer_text: settings.footer_text, signature_label: settings.signature_label,
              show_signature: settings.show_signature, show_amount_in_words: settings.show_amount_in_words,
              upi_id: settings.upi_id, upi_payee_name: settings.upi_payee_name,
              show_upi_qr: settings.show_upi_qr,
            } : undefined,
          );
          const blob = doc.output("blob");
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          revoke = url;
          setPdfUrl(url);
          setPdfName(`Invoice-${safeNum}.pdf`);
        } else {
          const receipt = await generateThermalReceipt(
            { name: business?.name ?? "", gstin: business?.gstin, phone: business?.phone, address: business?.address },
            {
              invoice_number: invoice.invoice_number,
              invoice_date: new Date(invoice.invoice_date).toLocaleString(),
              party_name: party?.name ?? null,
              party_phone: party?.phone ?? null,
              cashier: null,
              lines: (items ?? []).map((l: any) => ({
                item_name: l.item_name,
                quantity: Number(l.quantity) || 0,
                unit: l.unit,
                price: Number(l.price) || 0,
                total_amount: Number(l.total_amount) || 0,
              })),
              subtotal: Number(invoice.subtotal) || 0,
              discount_amount: Number(invoice.discount_amount) || 0,
              tax_amount: (Number(invoice.cgst_amount) || 0) + (Number(invoice.sgst_amount) || 0) + (Number(invoice.igst_amount) || 0),
              round_off: Number(invoice.round_off) || 0,
              total_amount: Number(invoice.total_amount) || 0,
              paid_amount: Number(invoice.paid_amount) || 0,
              balance_amount: Number(invoice.balance_amount) || 0,
              payment_method: null,
            },
            settings ? { upi_id: settings.upi_id, upi_payee_name: settings.upi_payee_name, show_upi_qr: settings.show_upi_qr } : undefined,
          );
          const blob = receipt.output("blob");
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          revoke = url;
          setPdfUrl(url);
          setPdfName(`POS-${safeNum}.pdf`);
        }
      } catch (e) {
        if (!cancelled) setError("Failed to render document");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [data, view]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-danger">{error ?? "Invoice not found"}</div>;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background">
        <div className="inline-flex rounded-md border bg-background p-0.5">
          <button
            onClick={() => setView("invoice")}
            className={`text-xs sm:text-sm px-3 py-1.5 rounded gap-1 inline-flex items-center ${view === "invoice" ? "bg-primary text-primary-foreground" : ""}`}
          ><FileText className="h-3.5 w-3.5" /> Invoice</button>
          <button
            onClick={() => setView("pos")}
            className={`text-xs sm:text-sm px-3 py-1.5 rounded gap-1 inline-flex items-center ${view === "pos" ? "bg-primary text-primary-foreground" : ""}`}
          ><Receipt className="h-3.5 w-3.5" /> POS Receipt</button>
        </div>
        <Button size="sm" variant="outline" disabled={!pdfUrl} asChild>
          <a href={pdfUrl ?? "#"} download={pdfName} className="gap-1.5 inline-flex items-center">
            <Download className="h-4 w-4" /> Download PDF
          </a>
        </Button>
      </div>

      <div className="flex-1 relative">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Rendering…</div>
        )}
        {pdfUrl && (
          <iframe
            key={pdfUrl}
            title={pdfName}
            src={pdfUrl}
            className="w-full h-full min-h-[calc(100vh-50px)] bg-white"
          />
        )}
      </div>

      <div className="text-center text-[11px] text-muted-foreground py-2 bg-background border-t">
        Powered by <a href="https://billlook.com" className="hover:underline">Bill Look</a>
      </div>
    </div>
  );
}
