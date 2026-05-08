import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { omInsert } from "@/lib/offlineMutate";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ItemRow } from "./ItemDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ItemRow | null;
  onSaved: () => void;
}

export function StockAdjustDialog({ open, onOpenChange, item, onSaved }: Props) {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"adjustment_in" | "adjustment_out" | "damage" | "transfer">("adjustment_in");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!current || !user || !item) return;
    const q = Number(qty);
    if (!q || q <= 0) { toast.error("Enter a valid quantity"); return; }
    setSaving(true);
    const res = await omInsert("stock_movements", {
      business_id: current.id, item_id: item.id, type, quantity: q,
      notes: notes.trim() || null, created_by: user.id,
    });
    setSaving(false);
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    toast.success(res.queued ? "Saved offline — will sync" : "Stock adjusted");
    setQty(""); setNotes(""); setType("adjustment_in");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Adjustment Type</Label>
            <Select value={type} onValueChange={(v: typeof type) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="adjustment_in">Stock In (+)</SelectItem>
                <SelectItem value="adjustment_out">Stock Out (−)</SelectItem>
                <SelectItem value="damage">Damage / Loss (−)</SelectItem>
                <SelectItem value="transfer">Transfer Out (−)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity ({item?.unit})</Label>
            <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">
            Current stock: <span className="font-semibold tabular-nums">{item?.current_stock} {item?.unit}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
