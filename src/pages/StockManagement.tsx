import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchBar } from "@/components/SearchBar";
import { StockAdjustDialog } from "@/components/StockAdjustDialog";
import { ItemDialog, type ItemRow } from "@/components/ItemDialog";
import { ArrowUpDown, Pencil, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Movement = {
  id: string;
  item_id: string;
  type: "opening" | "purchase" | "sale" | "adjustment_in" | "adjustment_out" | "damage" | "transfer";
  quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

const SIGN: Record<Movement["type"], 1 | -1> = {
  opening: 1, purchase: 1, adjustment_in: 1,
  sale: -1, adjustment_out: -1, damage: -1, transfer: -1,
};

const TYPE_LABEL: Record<Movement["type"], string> = {
  opening: "Opening", purchase: "Purchase", sale: "Sale",
  adjustment_in: "Adjustment In", adjustment_out: "Adjustment Out",
  damage: "Damage / Loss", transfer: "Transfer",
};

export default function StockManagement() {
  const { current } = useBusiness();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [historyQ, setHistoryQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "opening" | "adjustments">("all");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<ItemRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const [itemsRes, mvRes] = await Promise.all([
      supabase.from("items").select("*").eq("business_id", current.id)
        .eq("type", "product").order("name"),
      supabase.from("stock_movements").select("*").eq("business_id", current.id)
        .order("created_at", { ascending: true }),
    ]);
    if (itemsRes.error) toast.error(itemsRes.error.message);
    if (mvRes.error) toast.error(mvRes.error.message);
    const its = (itemsRes.data ?? []) as ItemRow[];
    const mvs = (mvRes.data ?? []) as Movement[];
    setItems(its);
    setMovements(mvs);

    const userIds = Array.from(new Set(mvs.map((m) => m.created_by).filter(Boolean))) as string[];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p.full_name || p.email || "—"; });
      setProfiles(map);
    } else setProfiles({});
    setLoading(false);
  };

  useEffect(() => { load(); }, [current?.id]);

  const itemMap = useMemo(() => {
    const m = new Map<string, ItemRow>();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  /** Compute before/after for every movement by walking chronologically per item. */
  const enriched = useMemo(() => {
    const running = new Map<string, number>();
    return movements.map((m) => {
      const before = running.get(m.item_id) ?? 0;
      const after = before + SIGN[m.type] * Number(m.quantity);
      running.set(m.item_id, after);
      return { ...m, before, after };
    }).reverse(); // newest first for display
  }, [movements]);

  const filteredItems = items.filter((i) =>
    !q || i.name.toLowerCase().includes(q.toLowerCase()) ||
    (i.sku ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (i.barcode ?? "").toLowerCase().includes(q.toLowerCase())
  );

  const filteredHistory = enriched.filter((m) => {
    if (typeFilter === "opening" && m.type !== "opening") return false;
    if (typeFilter === "adjustments" && !["adjustment_in", "adjustment_out", "damage", "transfer"].includes(m.type)) return false;
    if (!historyQ) return true;
    const it = itemMap.get(m.item_id);
    const hay = `${it?.name ?? ""} ${it?.sku ?? ""} ${m.notes ?? ""}`.toLowerCase();
    return hay.includes(historyQ.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Stock Management</h1>
        <p className="text-muted-foreground">Adjust stock and review every change with full history.</p>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="history">Adjustment History</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <SearchBar value={q} onChange={setQ} placeholder="Search by name, SKU or barcode..." />
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Low Stock Alert</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No products found
                  </TableCell></TableRow>
                ) : filteredItems.map((it) => {
                  const low = it.low_stock_alert > 0 && Number(it.current_stock) <= Number(it.low_stock_alert);
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.sku ? `SKU: ${it.sku}` : ""}{it.is_batch_tracked ? " · batch tracked" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(it.opening_stock)} {it.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={low ? "text-destructive font-semibold" : "font-semibold"}>
                          {Number(it.current_stock)} {it.unit}
                        </span>
                        {low && <AlertTriangle className="inline ml-1 h-3 w-3 text-destructive" />}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {it.low_stock_alert ? `${it.low_stock_alert} ${it.unit}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={it.is_batch_tracked}
                            onClick={() => { setAdjustItem(it); setAdjustOpen(true); }}>
                            <ArrowUpDown className="h-3 w-3" /> Adjust
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => { setEditing(it); setEditOpen(true); }}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <SearchBar value={historyQ} onChange={setHistoryQ} placeholder="Search item or notes..." />
            <div className="flex gap-1">
              <Button size="sm" variant={typeFilter === "all" ? "default" : "outline"} onClick={() => setTypeFilter("all")}>All</Button>
              <Button size="sm" variant={typeFilter === "opening" ? "default" : "outline"} onClick={() => setTypeFilter("opening")}>Opening</Button>
              <Button size="sm" variant={typeFilter === "adjustments" ? "default" : "outline"} onClick={() => setTypeFilter("adjustments")}>Adjustments</Button>
            </div>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filteredHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No stock changes yet.</TableCell></TableRow>
                ) : filteredHistory.map((m) => {
                  const it = itemMap.get(m.item_id);
                  const sign = SIGN[m.type];
                  const delta = sign * Number(m.quantity);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-medium">{it?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{it?.sku}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sign > 0 ? "secondary" : "outline"}>{TYPE_LABEL[m.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{m.before} {it?.unit}</TableCell>
                      <TableCell className={"text-right tabular-nums font-medium " + (delta >= 0 ? "text-emerald-600" : "text-destructive")}>
                        {delta >= 0 ? "+" : ""}{delta} {it?.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{m.after} {it?.unit}</TableCell>
                      <TableCell className="text-sm">{m.created_by ? (profiles[m.created_by] ?? "—") : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate" title={m.notes ?? ""}>{m.notes ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <StockAdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} item={adjustItem} onSaved={load} />
      <ItemDialog open={editOpen} onOpenChange={setEditOpen} item={editing} onSaved={load} />
    </div>
  );
}
