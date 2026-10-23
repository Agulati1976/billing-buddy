import { allRows } from "@/lib/pagination";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { billingTransaction } from "@/lib/billingTransactions";
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
  const currentId = current?.id;
  const itemId = item?.id;
  const batchTracked = item?.is_batch_tracked;
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"adjustment_in" | "adjustment_out" | "damage" | "transfer">("adjustment_in");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const savingRef=useRef(false);
  const [batchId,setBatchId]=useState("");
  const [batches,setBatches]=useState<Array<{id:string;batch_number:string;quantity:number}>>([]);
  useEffect(()=>{
    setBatchId("");setBatches([]);
    if(!open || !currentId || !itemId || !batchTracked) return;
    let active=true;
    void allRows(supabase.from("batches").select("id,batch_number,quantity").eq("business_id",currentId).eq("item_id",itemId).order("batch_number")).then(({data,error})=>{
      if(!active)return;
      if(error)toast.error(error.message);else setBatches(data??[]);
    });
    return()=>{active=false;};
  },[open, currentId, batchTracked, itemId]);

  const submit = async () => {
    if (!current || !user || !item || savingRef.current) return;
    if (item.is_batch_tracked && !batchId) {toast.error("Select a batch");return;}
    const q = Number(qty);
    if (!q || q <= 0) { toast.error("Enter a valid quantity"); return; }
    const reducesStock = type === "adjustment_out" || type === "damage" || type === "transfer";
    const available = item.is_batch_tracked ? Number(batches.find(batch=>batch.id===batchId)?.quantity || 0) : Number(item.current_stock) || 0;
    if (reducesStock && q > available) {
      toast.error(`Out of stock: only ${available} ${item.unit} available`);
      return;
    }
    savingRef.current=true;setSaving(true);
    const res = await billingTransaction("adjust_stock",current.id,{
      p_operation_id:crypto.randomUUID(),p_business_id:current.id,p_item_id:item.id,p_type:type,p_quantity:q,
      p_batch_id:batchId || null,p_notes:notes.trim() || null,
    },{id:item.id});
    savingRef.current=false;
    setSaving(false);
    if (res.error) { toast.error((res.error).message ?? "Failed"); return; }
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
          {item?.is_batch_tracked && <div><Label>Batch</Label><Select value={batchId} onValueChange={setBatchId}><SelectTrigger><SelectValue placeholder="Select a batch" /></SelectTrigger><SelectContent>{batches.map(batch=><SelectItem key={batch.id} value={batch.id}>{batch.batch_number} · {Number(batch.quantity)} {item.unit}</SelectItem>)}</SelectContent></Select></div>}
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
            <Input
              type="number"
              step={item?.allow_decimal_qty ? "0.01" : "1"}
              min="0"
              value={qty}
              onChange={(e) => {
                const v = e.target.value;
                setQty(item?.allow_decimal_qty ? v : v.replace(/[^\d]/g, ""));
              }}
            />
            {(type === "adjustment_out" || type === "damage" || type === "transfer") && (
              <p className="text-xs text-muted-foreground mt-1">
                Max available: <span className="font-semibold tabular-nums">{item?.is_batch_tracked ? Number(batches.find(batch=>batch.id===batchId)?.quantity || 0) : Number(item?.current_stock ?? 0)} {item?.unit}</span>
              </p>
            )}
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
