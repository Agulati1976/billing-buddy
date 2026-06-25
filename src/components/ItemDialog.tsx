import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Sparkles, ImagePlus, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { omInsert, omUpdate } from "@/lib/offlineMutate";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ensureCatalogEntry, lookupBarcode, type CatalogEntry } from "@/lib/barcodeCatalog";

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
  category_id: string | null;
  is_batch_tracked: boolean;
  brand?: string | null;
  flavour?: string | null;
  color?: string | null;
  mrp?: number | null;
  image_url?: string | null;
  catalog_id?: string | null;
  allow_decimal_qty?: boolean;
}


const UNITS = ["pcs", "kg", "g", "box", "ltr", "ml", "mtr", "ft", "dozen", "pack"];
const TAX_RATES = [0, 5, 12, 18, 28];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: ItemRow | null;
  onSaved: () => void;
  /** Optional barcode to preset (used by Items page after scanning unknown code) */
  presetBarcode?: string;
}

const emptyForm = {
  name: "", type: "product" as "product" | "service", sku: "", barcode: "", hsn_code: "",
  unit: "pcs", sale_price: "0", purchase_price: "0", tax_rate: "18",
  opening_stock: "0", low_stock_alert: "0", description: "",
  category_id: "", is_batch_tracked: false,
  brand: "", flavour: "", color: "", mrp: "0",
};

export function ItemDialog({ open, onOpenChange, item, onSaved, presetBarcode }: Props) {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [catalogHit, setCatalogHit] = useState<CatalogEntry | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lookupTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!current) return;
    supabase.from("categories").select("id, name").eq("business_id", current.id).order("name")
      .then(({ data }) => setCategories((data ?? []) as any));
  }, [current?.id, open]);

  useEffect(() => {
    if (!open) return;
    setCatalogHit(null);
    if (item) {
      setForm({
        name: item.name, type: item.type, sku: item.sku ?? "",
        barcode: item.barcode ?? "",
        hsn_code: item.hsn_code ?? "",
        unit: item.unit, sale_price: String(item.sale_price), purchase_price: String(item.purchase_price),
        tax_rate: String(item.tax_rate), opening_stock: String(item.opening_stock),
        low_stock_alert: String(item.low_stock_alert), description: item.description ?? "",
        category_id: item.category_id ?? "",
        is_batch_tracked: !!item.is_batch_tracked,
        brand: item.brand ?? "", flavour: item.flavour ?? "", color: item.color ?? "",
        mrp: String(item.mrp ?? 0),
      });
      setCatalogId(item.catalog_id ?? null);
      setImageUrl(item.image_url ?? null);
    } else {
      setForm({ ...emptyForm, barcode: presetBarcode ?? "" });
      setCatalogId(null);
      setImageUrl(null);
      if (presetBarcode) {
        // trigger lookup immediately
        void runLookup(presetBarcode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, open, presetBarcode]);

  const runLookup = async (code: string) => {
    const c = code.trim();
    if (!c) { setCatalogHit(null); return; }
    setCatalogLoading(true);
    const hit = await lookupBarcode(c);
    setCatalogLoading(false);
    if (hit) {
      setCatalogHit(hit);
      // Only auto-prefill if user hasn't typed details yet
      setForm((f) => ({
        ...f,
        name: f.name || hit.name,
        hsn_code: f.hsn_code || (hit.hsn_code ?? ""),
        unit: hit.unit || f.unit,
        tax_rate: String(hit.tax_rate ?? f.tax_rate),
        brand: f.brand || (hit.brand ?? ""),
        flavour: f.flavour || (hit.flavour ?? ""),
        color: f.color || (hit.color ?? ""),
        mrp: f.mrp === "0" ? String(hit.mrp ?? 0) : f.mrp,
        sale_price: f.sale_price === "0" ? String(hit.mrp ?? 0) : f.sale_price,
        description: f.description || (hit.description ?? ""),
      }));
      setCatalogId(hit.id);
      if (hit.image_url) setImageUrl((cur) => cur || hit.image_url!);
    } else {
      setCatalogHit(null);
    }
  };

  const onBarcodeChange = (v: string) => {
    setForm((f) => ({ ...f, barcode: v }));
    if (item) return; // don't auto-overwrite when editing
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current);
    lookupTimer.current = window.setTimeout(() => runLookup(v), 350);
  };

  const onScanned = (code: string) => {
    setForm((f) => ({ ...f, barcode: code }));
    void runLookup(code);
  };

  const onPickImage = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setUploadingImage(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("item-images").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type,
    });
    if (error) { setUploadingImage(false); toast.error(error.message); return; }
    const { data } = supabase.storage.from("item-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploadingImage(false);
  };

  const submit = async () => {
    if (!current || !user) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);

    let resolvedCatalogId = catalogId;
    // Contribute to global catalog if barcode provided and not yet known
    if (form.barcode.trim() && !catalogHit && !item) {
      const created = await ensureCatalogEntry({
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        flavour: form.flavour.trim() || null,
        color: form.color.trim() || null,
        mrp: Number(form.mrp) || 0,
        hsn_code: form.hsn_code.trim() || null,
        tax_rate: Number(form.tax_rate) || 0,
        unit: form.unit,
        description: form.description.trim() || null,
        contributed_by: user.id,
        contributor_business_id: current.id,
      });
      if (created) resolvedCatalogId = created.id;
    }

    const newOpening = form.type === "product" ? (Number(form.opening_stock) || 0) : 0;
    const payload: any = {
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
      opening_stock: newOpening,
      low_stock_alert: form.type === "product" ? (Number(form.low_stock_alert) || 0) : 0,
      description: form.description.trim() || null,
      category_id: form.category_id || null,
      is_batch_tracked: form.type === "product" ? form.is_batch_tracked : false,
      brand: form.brand.trim() || null,
      flavour: form.flavour.trim() || null,
      color: form.color.trim() || null,
      mrp: Number(form.mrp) || null,
      catalog_id: resolvedCatalogId,
      image_url: imageUrl,
      created_by: user.id,
    };
    // When editing a product (not batch-tracked), record an adjustment so trigger updates current_stock
    let stockDelta = 0;
    if (item && form.type === "product" && !form.is_batch_tracked) {
      stockDelta = newOpening - (Number(item.opening_stock) || 0);
    }
    const res = item
      ? await omUpdate("items", { column: "id", value: item.id }, payload)
      : await omInsert("items", payload);
    setSaving(false);
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    if (item && stockDelta !== 0) {
      await omInsert("stock_movements", {
        business_id: current.id,
        item_id: item.id,
        type: stockDelta > 0 ? "adjustment_in" : "adjustment_out",
        quantity: Math.abs(stockDelta),
        notes: `Opening stock adjusted (${item.opening_stock} → ${newOpening})`,
        created_by: user.id,
      }).catch(() => {});
    }
    toast.success(
      res.queued
        ? (item ? "Item update saved offline — will sync" : "Item saved offline — will sync")
        : (item ? "Item updated" : "Item created")
    );
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
            <Label>Item image</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="relative h-20 w-20 rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center">
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt="Item" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 border flex items-center justify-center"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickImage(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</> : (imageUrl ? "Change image" : "Upload image")}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG/JPG/WEBP, up to 5 MB.</p>
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <Label>Barcode</Label>
            <div className="flex gap-2">
              <Input
                value={form.barcode}
                onChange={(e) => onBarcodeChange(e.target.value)}
                placeholder="EAN / UPC / scan to lookup catalog"
              />
              <Button type="button" variant="outline" onClick={() => setScannerOpen(true)}>
                <ScanLine className="h-4 w-4" /> Scan
              </Button>
            </div>
            {catalogLoading && (
              <p className="text-xs text-muted-foreground mt-1">Looking up catalog…</p>
            )}
            {catalogHit && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" /> Catalog match
                </Badge>
                <span className="text-muted-foreground">
                  {catalogHit.name}{catalogHit.brand ? ` · ${catalogHit.brand}` : ""}
                  {catalogHit.scan_count > 1 ? ` · used by ${catalogHit.scan_count} shops` : ""}
                </span>
              </div>
            )}
            {!catalogHit && !catalogLoading && form.barcode && !item && (
              <p className="text-xs text-muted-foreground mt-1">
                New barcode — basic details you enter below will be shared so other shops auto-fill next time.
              </p>
            )}
          </div>

          <div className="col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Brand</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <Label>Flavour / Variant</Label>
            <Input value={form.flavour} onChange={(e) => setForm({ ...form, flavour: e.target.value })} />
          </div>
          <div>
            <Label>Color</Label>
            <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
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
            <Label>MRP (₹)</Label>
            <Input type="number" step="0.01" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
          </div>
          <div>
            <Label>Sale Price (₹) — incl. GST</Label>
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
                <Input type="number" step="0.01" disabled={form.is_batch_tracked} value={form.opening_stock}
                  onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} />
                {form.is_batch_tracked ? (
                  <p className="text-xs text-muted-foreground mt-1">Stock comes from batches.</p>
                ) : item ? (
                  <p className="text-xs text-muted-foreground mt-1">Editing this adjusts current stock by the difference.</p>
                ) : null}
              </div>
              <div>
                <Label>Low Stock Alert</Label>
                <Input type="number" step="0.01" value={form.low_stock_alert}
                  onChange={(e) => setForm({ ...form, low_stock_alert: e.target.value })} />
              </div>
            </>
          )}
          <div className="col-span-2">
            <Label>Category</Label>
            <Select value={form.category_id || "__none"} onValueChange={(v) => setForm({ ...form, category_id: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Uncategorised" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Uncategorised</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.type === "product" && (
            <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">Batch tracking</Label>
                <p className="text-xs text-muted-foreground">Track stock per batch (with batch no, mfg & expiry).</p>
              </div>
              <Switch checked={form.is_batch_tracked} onCheckedChange={(v) => setForm({ ...form, is_batch_tracked: v })} />
            </div>
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
        <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={onScanned} />
      </DialogContent>
    </Dialog>
  );
}
