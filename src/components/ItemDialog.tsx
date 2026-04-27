import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ItemRow {
  id: string;
  name: string;
  type: "product" | "service";
  sku: string | null;
  barcode: string | null;
  hsn_code: string | null;
  unit: string;
  sale_price: number;
  purchase_price: number;
  tax_rate: number;
  opening_stock: number;
  current_stock: number;
  low_stock_alert: number;
  description: string | null;
}

const UNITS = ["pcs", "kg", "g", "box", "ltr", "ml", "mtr", "ft", "dozen", "pack"];
const TAX_RATES = [0, 5, 12, 18, 28];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: ItemRow | null;
  onSaved: () => void;
}

export function ItemDialog({ open, onOpenChange, item, onSaved }: Props) {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "product" as "product" | "service", sku: "", barcode: "", hsn_code: "",
    unit: "pcs", sale_price: "0", purchase_price: "0", tax_rate: "18",
    opening_stock: "0", low_stock_alert: "0", description: "",
  });

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name, type: item.type, sku: item.sku ?? "",
        barcode: item.barcode ?? "",
        hsn_code: item.hsn_code ?? "",
        unit: item.unit, sale_price: String(item.sale_price), purchase_price: String(item.purchase_price),
        tax_rate: String(item.tax_rate), opening_stock: String(item.opening_stock),
        low_stock_alert: String(item.low_stock_alert), description: item.description ?? "",
      });
    } else {
      setForm({
        name: "", type: "product", sku: "", barcode: "", hsn_code: "", unit: "pcs",
        sale_price: "0", purchase_price: "0", tax_rate: "18",
        opening_stock: "0", low_stock_alert: "0", description: "",
      });
    }
  }, [item, open]);

  const submit = async () => {
    if (!current || !user) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const payload = {
      business_id: current.id,
      name: form.name.trim(),
      type: form.type,
      sku: form.sku.trim() || null,
      hsn_code: form.hsn_code.trim() || null,
      barcode: form.barcode.trim() || null,
      unit: form.unit,
      sale_price: Number(form.sale_price) || 0,
      purchase_price: Number(form.purchase_price) || 0,
      tax_rate: Number(form.tax_rate) || 0,
      opening_stock: form.type === "product" ? (Number(form.opening_stock) || 0) : 0,
      low_stock_alert: form.type === "product" ? (Number(form.low_stock_alert) || 0) : 0,
      description: form.description.trim() || null,
      created_by: user.id,
    };
    const { error } = item
      ? await supabase.from("items").update(payload).eq("id", item.id)
      : await supabase.from("items").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(item ? "Item updated" : "Item created");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Edit Item" : "New Item"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v: "product" | "service") => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product (with stock)</SelectItem>
                <SelectItem value="service">Service (no stock)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label>Barcode</Label>
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="EAN / UPC / custom" />
          </div>
          <div className="col-span-2">
            <Label>HSN/SAC Code</Label>
            <Input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} />
          </div>
          <div>
            <Label>Unit</Label>
            <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>GST Tax Rate (%)</Label>
            <Select value={form.tax_rate} onValueChange={(v) => setForm({ ...form, tax_rate: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TAX_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sale Price (₹)</Label>
            <Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
          </div>
          <div>
            <Label>Purchase Price (₹)</Label>
            <Input type="number" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
          </div>
          {form.type === "product" && (
            <>
              <div>
                <Label>Opening Stock</Label>
                <Input type="number" step="0.01" disabled={!!item} value={form.opening_stock}
                  onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} />
              </div>
              <div>
                <Label>Low Stock Alert</Label>
                <Input type="number" step="0.01" value={form.low_stock_alert}
                  onChange={(e) => setForm({ ...form, low_stock_alert: e.target.value })} />
              </div>
            </>
          )}
          <div className="col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
