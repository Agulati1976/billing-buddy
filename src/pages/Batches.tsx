import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Boxes, AlertTriangle, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { format, differenceInDays, parseISO } from "date-fns";

interface Item { id: string; name: string; unit: string; is_batch_tracked: boolean; barcode: string | null; }
interface Batch {
  id: string; item_id: string; batch_number: string;
  mfg_date: string | null; expiry_date: string | null;
  quantity: number; notes: string | null;
  items: { name: string; unit: string } | null;
}

export default function Batches() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [rows, setRows] = useState<Batch[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [itemId, setItemId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.batch_number, r.items?.name, r.notes].filter(Boolean).some((v) => v!.toLowerCase().includes(q)));
  }, [rows, search]);

  const load = async () => {
    if (!current) return;
    const [b, it] = await Promise.all([
      supabase.from("batches")
        .select("id, item_id, batch_number, mfg_date, expiry_date, quantity, notes, items(name, unit)")
        .eq("business_id", current.id).order("expiry_date", { ascending: true, nullsFirst: false }),
      supabase.from("items")
        .select("id, name, unit, is_batch_tracked, barcode")
        .eq("business_id", current.id).eq("is_batch_tracked", true).order("name"),
    ]);
    setRows((b.data as any) ?? []);
    setItems((it.data as any) ?? []);
  };
  useEffect(() => { load(); }, [current?.id]);

  const openNew = () => {
    setEditing(null); setItemId(""); setBatchNumber(""); setMfgDate("");
    setExpiryDate(""); setQuantity("0"); setNotes(""); setOpen(true);
  };
  const openEdit = (b: Batch) => {
    setEditing(b); setItemId(b.item_id); setBatchNumber(b.batch_number);
    setMfgDate(b.mfg_date ?? ""); setExpiryDate(b.expiry_date ?? "");
    setQuantity(String(b.quantity)); setNotes(b.notes ?? ""); setOpen(true);
  };

  const onScannedItem = (code: string) => {
    const c = code.trim();
    const match = items.find((it) => (it.barcode ?? "").trim() === c);
    if (match) {
      setItemId(match.id);
      toast.success(`Item: ${match.name}`);
    } else {
      toast.error("No batch-tracked item with this barcode. Add the barcode in the item first.");
    }
  };

  const submit = async () => {
    if (!current || !user) return;
    if (!itemId) { toast.error("Pick an item"); return; }
    if (!batchNumber.trim()) { toast.error("Batch number is required"); return; }
    const qty = Number(quantity) || 0;
    if (qty < 0) { toast.error("Batch quantity cannot be negative"); return; }
    setSaving(true);
    const payload = {
      business_id: current.id, item_id: itemId,
      batch_number: batchNumber.trim(),
      mfg_date: mfgDate || null,
      expiry_date: expiryDate || null,
      quantity: qty,
      notes: notes.trim() || null,
      created_by: user.id,
    };
    const { error } = editing
      ? await supabase.from("batches").update(payload).eq("id", editing.id)
      : await supabase.from("batches").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Batch updated" : "Batch created");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this batch? Stock will be removed.")) return;
    const { error } = await supabase.from("batches").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const expiringSoon = useMemo(() =>
    rows.filter((r) => r.expiry_date && differenceInDays(parseISO(r.expiry_date), new Date()) <= 30 && Number(r.quantity) > 0).length,
    [rows]
  );

  const expiryBadge = (d: string | null) => {
    if (!d) return <span className="text-muted-foreground">—</span>;
    const days = differenceInDays(parseISO(d), new Date());
    const cls = days < 0 ? "bg-danger-soft text-danger" : days <= 30 ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground";
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>
        {format(parseISO(d), "dd MMM yyyy")}{days < 0 ? " · Expired" : days <= 30 ? ` · ${days}d left` : ""}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" /> Batches & Expiry
          </h1>
          <p className="text-sm text-muted-foreground">Per-batch stock for batch-tracked items</p>
        </div>
        <Button onClick={openNew} className="gap-1.5" disabled={items.length === 0}>
          <Plus className="h-4 w-4" /> New Batch
        </Button>
      </div>

      {items.length === 0 && (
        <Card className="p-4 border-warning/40">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
            <div>
              No batch-tracked items yet. Open an item, edit it, and turn on <strong>Batch tracking</strong>, then come back here to add batches.
            </div>
          </div>
        </Card>
      )}

      {expiringSoon > 0 && (
        <Card className="p-4 border-warning/40">
          <div className="text-sm">
            <AlertTriangle className="h-4 w-4 text-warning inline mr-1.5" />
            <strong className="text-warning">{expiringSoon}</strong> batch(es) expiring in the next 30 days.
          </div>
        </Card>
      )}

      <Card>
        <div className="p-3 sm:p-4 border-b"><SearchBar value={search} onChange={setSearch} placeholder="Search batches…" className="max-w-sm" /></div>

        {/* Mobile cards */}
        <div className="sm:hidden p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">{rows.length === 0 ? "No batches yet" : "No matches"}</div>
          ) : filtered.map((b) => (
            <Card key={b.id} className="p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{b.items?.name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">Batch: {b.batch_number}</div>
                </div>
                <div className="text-sm font-semibold num shrink-0">{Number(b.quantity)} {b.items?.unit ?? ""}</div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs">{expiryBadge(b.expiry_date)}</div>
                <div className="flex gap-0.5">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {b.mfg_date && (
                <div className="text-[11px] text-muted-foreground mt-1">Mfg: {format(parseISO(b.mfg_date), "dd MMM yyyy")}</div>
              )}
            </Card>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Batch No.</TableHead>
                <TableHead>Mfg Date</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{rows.length === 0 ? "No batches yet" : "No matches"}</TableCell></TableRow>
              ) : filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.items?.name ?? "—"}</TableCell>
                  <TableCell>{b.batch_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.mfg_date ? format(parseISO(b.mfg_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell>{expiryBadge(b.expiry_date)}</TableCell>
                  <TableCell className="text-right num">{Number(b.quantity)} {b.items?.unit ?? ""}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Batch" : "New Batch"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Item *</Label>
              <div className="flex gap-2">
                <Select value={itemId} onValueChange={setItemId} disabled={!!editing}>
                  <SelectTrigger><SelectValue placeholder="Pick batch-tracked item" /></SelectTrigger>
                  <SelectContent>
                    {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} disabled={!!editing} title="Scan item barcode">
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Tip: scan the item's barcode to pick it instantly.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Batch No. *</Label><Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></div>
              <div><Label>Quantity</Label><Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mfg Date</Label><Input type="date" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
            </div>
            <div>
              <Label className="text-xs">Best before (days) — auto-calculate expiry</Label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {[60, 100, 365].map((d) => (
                  <Button key={d} type="button" variant="outline" size="sm"
                    onClick={() => {
                      const base = mfgDate ? new Date(mfgDate) : new Date();
                      base.setDate(base.getDate() + d);
                      setExpiryDate(base.toISOString().slice(0, 10));
                    }}>
                    {d} days
                  </Button>
                ))}
                <Input type="number" min={1} placeholder="Custom days" className="w-32 h-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const d = Number((e.target as HTMLInputElement).value);
                      if (d > 0) {
                        const base = mfgDate ? new Date(mfgDate) : new Date();
                        base.setDate(base.getDate() + d);
                        setExpiryDate(base.toISOString().slice(0, 10));
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const d = Number(e.target.value);
                    if (d > 0) {
                      const base = mfgDate ? new Date(mfgDate) : new Date();
                      base.setDate(base.getDate() + d);
                      setExpiryDate(base.toISOString().slice(0, 10));
                    }
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Based on Mfg date (or today if empty).</p>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanned={onScannedItem} />
    </div>
  );
}
