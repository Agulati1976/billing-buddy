import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Upload, ScanLine, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExtractedItem {
  name: string;
  hsn_code?: string;
  quantity: number;
  unit?: string;
  price: number;
  tax_rate?: number;
  discount_pct?: number;
}
export interface ExtractedInvoice {
  supplier_name?: string;
  supplier_gstin?: string;
  supplier_phone?: string;
  supplier_address?: string;
  invoice_number?: string;
  invoice_date?: string;
  items: ExtractedItem[];
  total_amount?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onExtracted: (data: ExtractedInvoice) => void;
}

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || "");
      const [, base64] = result.split(",");
      resolve({ base64, mime: file.type });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function PurchaseInvoiceScanner({ open, onOpenChange, onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedInvoice | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image of the bill (JPG/PNG)");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { base64, mime } = await fileToBase64(file);
      setPreview(`data:${mime};base64,${base64}`);
      const { data, error } = await supabase.functions.invoke("parse-purchase-invoice", {
        body: { image_base64: base64, mime_type: mime },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to parse");
      const parsed: ExtractedInvoice = data.data;
      if (!parsed.items?.length) throw new Error("No items detected on the bill");
      setResult(parsed);
      toast.success(`Detected ${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not read the bill");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (result) onExtracted(result);
    onOpenChange(false);
    setResult(null);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setPreview(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" /> Scan Purchase Bill</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!result && (
            <Card
              className="border-dashed border-2 p-8 text-center cursor-pointer hover:border-primary/50 transition"
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">Reading the bill with AI…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8 text-primary" />
                  <p className="font-medium text-foreground">Upload or take a photo of the purchase bill</p>
                  <p className="text-xs">JPG / PNG · clear & well-lit photo works best</p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
            </Card>
          )}

          {preview && result && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <img src={preview} alt="Bill preview" className="rounded-md border max-h-64 object-contain w-full bg-muted" />
              <div className="text-sm space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-4 w-4" /> Extracted
                </div>
                {result.supplier_name && <div><span className="text-muted-foreground">Supplier:</span> {result.supplier_name}</div>}
                {result.invoice_number && <div><span className="text-muted-foreground">Bill #:</span> {result.invoice_number}</div>}
                {result.invoice_date && <div><span className="text-muted-foreground">Date:</span> {result.invoice_date}</div>}
                <div><span className="text-muted-foreground">Items:</span> {result.items.length}</div>
                {result.total_amount != null && <div><span className="text-muted-foreground">Total:</span> ₹{result.total_amount}</div>}
              </div>
            </div>
          )}

          {result && (
            <Card className="p-0 overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left p-2">Item</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Tax %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{it.name}</td>
                        <td className="text-right p-2 tabular-nums">{it.quantity}</td>
                        <td className="text-right p-2 tabular-nums">{it.price}</td>
                        <td className="text-right p-2 tabular-nums">{it.tax_rate ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {result && (
              <>
                <Button variant="outline" onClick={() => { setResult(null); setPreview(null); }}>Try another</Button>
                <Button onClick={apply}>Use this data</Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            New items and suppliers found will be created automatically. Inventory gets updated when you save the purchase.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
