import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { omDelete } from "@/lib/offlineMutate";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, ArrowUpDown, ScanLine, History } from "lucide-react";
import { ItemDialog, type ItemRow } from "@/components/ItemDialog";
import { StockAdjustDialog } from "@/components/StockAdjustDialog";
import { StockHistoryDialog } from "@/components/StockHistoryDialog";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import { composeItemName } from "@/lib/invoice";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<ItemRow | null>(null);

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
    const res = await omDelete("items", { column: "id", value: id });
    if (res.error) toast.error((res.error as any).message ?? "Failed");
    else { toast.success(res.queued ? "Deletion queued — will sync" : "Item deleted"); load(); }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Items
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Products & services</p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setScannerOpen(true)} className="px-2 sm:px-3">
            <ScanLine className="h-4 w-4" /> <span className="hidden sm:inline ml-1">Scan</span>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setPresetBarcode(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline ml-1">New</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">Total</div>
          <div className="text-base sm:text-2xl font-bold tabular-nums mt-0.5 sm:mt-1">{items.length}</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">Products</div>
          <div className="text-base sm:text-2xl font-bold tabular-nums mt-0.5 sm:mt-1">{items.filter(i => i.type === "product").length}</div>
        </Card>
        <Card className="p-3 sm:p-4 border-warning/40">
          <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-warning" /> Low
          </div>
          <div className="text-base sm:text-2xl font-bold tabular-nums mt-0.5 sm:mt-1 text-warning">{lowStockCount}</div>
        </Card>
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b">
          <SearchBar value={q} onChange={setQ} placeholder="Search items, SKU, HSN…" />
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden p-2 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {items.length === 0 ? "No items yet. Tap 'New' to add one." : "No matches."}
            </div>
          ) : filtered.map((i) => {
            const low = i.type === "product" && i.current_stock <= i.low_stock_alert && i.low_stock_alert > 0;
            return (
              <div key={i.id} className="mobile-card flex items-center gap-3">
                <div className="h-12 w-12 rounded-md border bg-muted/30 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {i.image_url ? (
                    <img src={i.image_url} alt={i.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground uppercase">{i.name.slice(0, 2)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{i.name}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {i.type}{i.sku ? ` · SKU ${i.sku}` : ""}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-semibold num">{formatINR(i.sale_price)}</span>
                    {i.type === "product" ? (
                      <Badge variant={low ? "destructive" : "secondary"} className="text-[10px] py-0 px-1.5">
                        {i.current_stock} {i.unit}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {i.type === "product" && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setAdjustItem(i); setAdjustOpen(true); }}>
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Stock history" onClick={() => { setHistoryItem(i); setHistoryOpen(true); }}>
                        <History className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(i); setDialogOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
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
                  {items.length === 0 ? "No items yet." : "No matches."}
                </TableCell></TableRow>
              ) : filtered.map((i) => {
                const low = i.type === "product" && i.current_stock <= i.low_stock_alert && i.low_stock_alert > 0;
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-md border bg-muted/30 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {i.image_url ? (
                            <img src={i.image_url} alt={i.name} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground uppercase">{i.name.slice(0, 2)}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{i.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{i.type}</div>
                        </div>
                      </div>
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
                          <>
                            <Button size="icon" variant="ghost" title="Adjust stock"
                              onClick={() => { setAdjustItem(i); setAdjustOpen(true); }}>
                              <ArrowUpDown className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Stock history"
                              onClick={() => { setHistoryItem(i); setHistoryOpen(true); }}>
                              <History className="h-4 w-4" />
                            </Button>
                          </>
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
        </div>
      </Card>

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} onSaved={load} presetBarcode={presetBarcode} />
      <StockAdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} item={adjustItem} onSaved={load} />
      <StockHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} item={historyItem} />
      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={handleScan} />
    </div>
  );
}
