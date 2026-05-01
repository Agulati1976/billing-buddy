import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, ArrowUpDown, ScanLine } from "lucide-react";
import { ItemDialog, type ItemRow } from "@/components/ItemDialog";
import { StockAdjustDialog } from "@/components/StockAdjustDialog";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";

export default function Items() {
  const { current } = useBusiness();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [presetBarcode, setPresetBarcode] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [adjustItem, setAdjustItem] = useState<ItemRow | null>(null);

  const handleScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const existing = items.find((i) => (i.barcode ?? "").trim() === trimmed);
    if (existing) {
      setEditing(existing);
      setPresetBarcode(undefined);
      setDialogOpen(true);
      toast.info(`Found: ${existing.name}`);
    } else {
      setEditing(null);
      setPresetBarcode(trimmed);
      setDialogOpen(true);
    }
  };

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("items").select("*")
      .eq("business_id", current.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as ItemRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [current?.id]);

  const filtered = items.filter((i) =>
    [i.name, i.sku, i.hsn_code].some((f) => f?.toLowerCase().includes(q.toLowerCase()))
  );

  const lowStockCount = items.filter((i) => i.type === "product" && i.current_stock <= i.low_stock_alert && i.low_stock_alert > 0).length;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Item deleted"); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> Items
          </h1>
          <p className="text-sm text-muted-foreground">Products & services in your inventory</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> New Item
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Items</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{items.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Products</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{items.filter(i => i.type === "product").length}</div>
        </Card>
        <Card className="p-4 border-warning/40">
          <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-warning" /> Low Stock
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-warning">{lowStockCount}</div>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search items, SKU, HSN…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU / HSN</TableHead>
              <TableHead className="text-right">Sale Price</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {items.length === 0 ? "No items yet. Click 'New Item' to add your first one." : "No items match your search."}
              </TableCell></TableRow>
            ) : filtered.map((i) => {
              const low = i.type === "product" && i.current_stock <= i.low_stock_alert && i.low_stock_alert > 0;
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{i.type}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {i.sku && <div>SKU: {i.sku}</div>}
                    {i.hsn_code && <div>HSN: {i.hsn_code}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(i.sale_price)}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.tax_rate}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.type === "service" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant={low ? "destructive" : "secondary"}>
                        {i.current_stock} {i.unit}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {i.type === "product" && (
                        <Button size="icon" variant="ghost" title="Adjust stock"
                          onClick={() => { setAdjustItem(i); setAdjustOpen(true); }}>
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(i); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(i.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} onSaved={load} />
      <StockAdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} item={adjustItem} onSaved={load} />
    </div>
  );
}
