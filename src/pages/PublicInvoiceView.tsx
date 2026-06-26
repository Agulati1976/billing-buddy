import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, FileText, Receipt } from "lucide-react";
import { formatINR } from "@/lib/states";
import { format } from "date-fns";

type View = "invoice" | "pos";

export default function PublicInvoiceView() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "invoice";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-danger">{error ?? "Invoice not found"}</div>;

  const { invoice, items, business, party } = data;

  return (
    <div className="min-h-screen bg-muted/30 py-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-3">
        {/* Top bar — hidden on print */}
        <div className="flex items-center justify-between mb-4 print:hidden">
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
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>

        {view === "invoice" ? (
          <InvoiceView invoice={invoice} items={items} business={business} party={party} />
        ) : (
          <PosView invoice={invoice} items={items} business={business} party={party} />
        )}

        <div className="text-center text-[11px] text-muted-foreground mt-4 print:hidden">
          Powered by <a href="https://billlook.com" className="hover:underline">Bill Look</a>
        </div>
      </div>
    </div>
  );
}

function InvoiceView({ invoice, items, business, party }: any) {
  return (
    <div className="bg-background border rounded-md p-5 sm:p-8 print:border-0 print:p-0 shadow-sm">
      <div className="flex justify-between items-start gap-4 border-b pb-4 mb-4">
        <div>
          {business?.logo_url && <img src={business.logo_url} alt="" className="h-12 mb-2 object-contain" />}
          <h1 className="text-lg sm:text-xl font-semibold">{business?.name}</h1>
          {business?.address && <div className="text-xs text-muted-foreground whitespace-pre-line">{business.address}</div>}
          <div className="text-xs text-muted-foreground">
            {business?.phone && <span>Ph: {business.phone}</span>}
            {business?.email && <span> · {business.email}</span>}
          </div>
          {business?.gstin && <div className="text-xs text-muted-foreground">GSTIN: {business.gstin}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tax Invoice</div>
          <div className="font-semibold">{invoice.invoice_number}</div>
          <div className="text-xs text-muted-foreground mt-1">{format(new Date(invoice.invoice_date), "dd MMM yyyy")}</div>
          {invoice.due_date && <div className="text-xs text-muted-foreground">Due: {format(new Date(invoice.due_date), "dd MMM yyyy")}</div>}
        </div>
      </div>

      {party && (
        <div className="mb-4">
          <div className="text-[11px] uppercase text-muted-foreground tracking-wide">Bill To</div>
          <div className="font-medium">{party.name}</div>
          {party.billing_address && <div className="text-xs text-muted-foreground whitespace-pre-line">{party.billing_address}</div>}
          <div className="text-xs text-muted-foreground">
            {party.phone && <span>{party.phone}</span>}
            {party.email && <span> · {party.email}</span>}
          </div>
          {party.gstin && <div className="text-xs text-muted-foreground">GSTIN: {party.gstin}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2">#</th>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Tax</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any, i: number) => (
              <tr key={it.id} className="border-b">
                <td className="py-2 text-muted-foreground">{i + 1}</td>
                <td>{it.item_name}{it.hsn_code ? <span className="text-[10px] text-muted-foreground ml-1">({it.hsn_code})</span> : null}</td>
                <td className="text-right num">{Number(it.quantity)}{it.unit ? ` ${it.unit}` : ""}</td>
                <td className="text-right num">{formatINR(Number(it.price))}</td>
                <td className="text-right num">{Number(it.tax_rate || 0)}%</td>
                <td className="text-right num">{formatINR(Number(it.total_amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-full sm:w-72 space-y-1 text-sm">
          <Row label="Subtotal" v={invoice.subtotal} />
          {Number(invoice.discount_amount) > 0 && <Row label="Discount" v={-invoice.discount_amount} />}
          {Number(invoice.cgst_amount) > 0 && <Row label="CGST" v={invoice.cgst_amount} />}
          {Number(invoice.sgst_amount) > 0 && <Row label="SGST" v={invoice.sgst_amount} />}
          {Number(invoice.igst_amount) > 0 && <Row label="IGST" v={invoice.igst_amount} />}
          {Number(invoice.round_off) !== 0 && <Row label="Round off" v={invoice.round_off} />}
          <div className="border-t pt-1.5 mt-1.5">
            <Row label="Total" v={invoice.total_amount} bold />
          </div>
          <Row label="Paid" v={invoice.paid_amount || 0} />
          {Number(invoice.balance_amount) > 0 && (
            <Row label="Balance" v={invoice.balance_amount} bold danger />
          )}
        </div>
      </div>

      {invoice.notes && <div className="mt-4 text-xs text-muted-foreground"><b>Notes:</b> {invoice.notes}</div>}
      {invoice.terms && <div className="mt-1 text-xs text-muted-foreground"><b>Terms:</b> {invoice.terms}</div>}
    </div>
  );
}

function PosView({ invoice, items, business, party }: any) {
  return (
    <div className="bg-background border rounded-md p-4 max-w-[360px] mx-auto font-mono text-[12px] shadow-sm print:border-0">
      <div className="text-center">
        <div className="font-bold text-sm">{business?.name}</div>
        {business?.address && <div className="text-[11px] whitespace-pre-line">{business.address}</div>}
        {business?.phone && <div className="text-[11px]">Ph: {business.phone}</div>}
        {business?.gstin && <div className="text-[11px]">GSTIN: {business.gstin}</div>}
      </div>
      <div className="border-t border-dashed my-2" />
      <div className="flex justify-between">
        <span>Bill: {invoice.invoice_number}</span>
        <span>{format(new Date(invoice.invoice_date), "dd MMM yy")}</span>
      </div>
      {party && <div>Customer: {party.name}</div>}
      <div className="border-t border-dashed my-2" />
      <div className="flex font-semibold">
        <span className="flex-1">Item</span>
        <span className="w-10 text-right">Qty</span>
        <span className="w-16 text-right">Amt</span>
      </div>
      <div className="border-t my-1" />
      {items.map((it: any) => (
        <div key={it.id} className="mb-1">
          <div>{it.item_name}</div>
          <div className="flex text-[11px]">
            <span className="flex-1 text-muted-foreground">{Number(it.quantity)} × {formatINR(Number(it.price))}</span>
            <span className="w-16 text-right">{formatINR(Number(it.total_amount))}</span>
          </div>
        </div>
      ))}
      <div className="border-t border-dashed my-2" />
      <PosRow label="Subtotal" v={invoice.subtotal} />
      {Number(invoice.discount_amount) > 0 && <PosRow label="Discount" v={-invoice.discount_amount} />}
      {Number(invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount) > 0 && (
        <PosRow label="Tax" v={Number(invoice.cgst_amount) + Number(invoice.sgst_amount) + Number(invoice.igst_amount)} />
      )}
      {Number(invoice.round_off) !== 0 && <PosRow label="Round off" v={invoice.round_off} />}
      <PosRow label="TOTAL" v={invoice.total_amount} bold />
      <PosRow label="Paid" v={invoice.paid_amount || 0} />
      {Number(invoice.balance_amount) > 0 && <PosRow label="Balance" v={invoice.balance_amount} bold />}
      <div className="border-t border-dashed my-2" />
      <div className="text-center text-[11px]">Thank you! Visit again.</div>
    </div>
  );
}

function Row({ label, v, bold, danger }: { label: string; v: number; bold?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${danger ? "text-danger" : ""}`}>
      <span>{label}</span>
      <span className="num">{formatINR(Number(v))}</span>
    </div>
  );
}
function PosRow({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{formatINR(Number(v))}</span>
    </div>
  );
}
