import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ScanLine } from "lucide-react";
import { composeItemLines } from "@/lib/invoice";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { toast } from "sonner";

export interface PickerItem {
  id: string;
  name: string;
  barcode?: string | null;
  hsn_code?: string | null;
  sku?: string | null;
  brand?: string | null;
  flavour?: string | null;
  color?: string | null;
  unit?: string | null;
  unit_size?: number | null;
  sale_price?: number | null;
  current_stock?: number | null;
  is_batch_tracked?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: PickerItem[];
  /** single = replace one line, multi = pick many at once */
  mode?: "single" | "multi";
  onPick: (items: PickerItem[]) => void;
  title?: string;
}

export function ItemPickerDialog({ open, onOpenChange, items, mode = "multi", onPick, title }: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [scanOpen, setScanOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected({});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const hit = items.find((i) => (i.barcode || "").trim() === trimmed);
    if (!hit) {
      toast.error(`No item with barcode ${trimmed}`);
      return;
    }
    if (mode === "single") {
      setScanOpen(false);
      commit([hit]);
      return;
    }
    setSelected((s) => ({ ...s, [hit.id]: true }));
    toast.success(`Selected: ${hit.name}`);
    // keep scanner open so user can scan more
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 200);
    return items.filter((i) => {
      const hay = [i.name, i.brand, i.flavour, i.color, i.sku, i.barcode, i.hsn_code]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(s);
    }).slice(0, 200);
  }, [items, q]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const commit = (picks: PickerItem[]) => {
    if (picks.length === 0) return;
    onPick(picks);
    onOpenChange(false);
  };

  const handleRowClick = (it: PickerItem) => {
    if (mode === "single") {
      commit([it]);
    } else {
      setSelected((s) => ({ ...s, [it.id]: !s[it.id] }));
    }
  };

  const handleAddSelected = () => {
    const picks = filtered.filter((i) => selected[i.id]);
    // include any selected but not currently filtered (in case user searches after selecting)
    const idSet = new Set(picks.map((p) => p.id));
    for (const id of Object.keys(selected)) {
      if (selected[id] && !idSet.has(id)) {
        const it = items.find((x) => x.id === id);
        if (it) picks.push(it);
      }
    }
    commit(picks);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title ?? (mode === "single" ? "Pick item" : "Pick items")}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="pl-9"
              placeholder="Search by name, brand, flavour, SKU, barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setScanOpen(true)} className="gap-1.5 shrink-0" title="Scan barcode">
            <ScanLine className="h-4 w-4" />
            <span className="hidden sm:inline">Scan</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 divide-y border rounded-md">
          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">No items found.</div>
          )}
          {filtered.map((it) => {
            const rows = composeItemLines(it as any);
            const isSel = !!selected[it.id];
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => handleRowClick(it)}
                className={`w-full text-left flex items-start gap-3 p-3 hover:bg-accent transition ${isSel ? "bg-accent/60" : ""}`}
              >
                {mode === "multi" && (
                  <Checkbox
                    checked={isSel}
                    onCheckedChange={() => handleRowClick(it)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {rows.length > 0 ? (
                    <div className="text-sm leading-snug">
                      {rows.map((r, i) => (
                        <div key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                          <span className="text-muted-foreground">{r.label} - </span>
                          <span className="text-foreground">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-medium">{it.name}</div>
                  )}
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {it.sale_price != null && <span>Rs.{Number(it.sale_price).toFixed(2)}</span>}
                    {it.current_stock != null && <span>Stock: {Number(it.current_stock)}</span>}
                    {it.is_batch_tracked && <span title="Batch tracked">ⓑ</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {mode === "multi" && (
          <DialogFooter className="gap-2">
            <div className="text-sm text-muted-foreground mr-auto self-center">
              {selectedCount} selected
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleAddSelected} disabled={selectedCount === 0}>
              Add {selectedCount > 0 ? `${selectedCount} item${selectedCount > 1 ? "s" : ""}` : ""}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
