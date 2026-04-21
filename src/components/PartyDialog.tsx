import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { INDIAN_STATES } from "@/lib/states";
import type { Party } from "@/pages/Parties";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: "customer" | "supplier";
  party: Party | null;
  onSaved: () => void;
}

const empty = {
  name: "", phone: "", email: "", gstin: "",
  billing_address: "", shipping_address: "",
  state_code: "", opening_balance: "0", notes: "",
};

export function PartyDialog({ open, onOpenChange, type, party, onSaved }: Props) {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (party) {
      setForm({
        name: party.name,
        phone: party.phone ?? "",
        email: party.email ?? "",
        gstin: party.gstin ?? "",
        billing_address: party.billing_address ?? "",
        shipping_address: party.shipping_address ?? "",
        state_code: party.state_code ?? "",
        opening_balance: String(party.opening_balance ?? 0),
        notes: party.notes ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [party, open]);

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !user) return;
    setBusy(true);
    const stateName = INDIAN_STATES.find((s) => s.code === form.state_code)?.name ?? null;
    const payload = {
      business_id: current.id,
      type,
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      gstin: form.gstin || null,
      billing_address: form.billing_address || null,
      shipping_address: form.shipping_address || null,
      state: stateName,
      state_code: form.state_code || null,
      opening_balance: Number(form.opening_balance) || 0,
      notes: form.notes || null,
    };
    const { error } = party
      ? await supabase.from("parties").update(payload).eq("id", party.id)
      : await supabase.from("parties").insert({ ...payload, created_by: user.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(party ? "Party updated" : `${type === "customer" ? "Customer" : "Supplier"} added`);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {party ? "Edit" : "Add"} {type === "customer" ? "Customer" : "Supplier"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pn">Name *</Label>
            <Input id="pn" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pp">Phone</Label>
              <Input id="pp" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pe">Email</Label>
              <Input id="pe" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pg">GSTIN</Label>
              <Input id="pg" value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ps">State</Label>
              <Select value={form.state_code} onValueChange={(v) => set("state_code", v)}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pb">Billing address</Label>
            <Textarea id="pb" rows={2} value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="psh">Shipping address</Label>
            <Textarea id="psh" rows={2} value={form.shipping_address} onChange={(e) => set("shipping_address", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pob">
              Opening balance <span className="text-muted-foreground font-normal">
                ({type === "customer" ? "they owe you" : "you owe them"})
              </span>
            </Label>
            <Input id="pob" type="number" step="0.01" value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pnt">Notes</Label>
            <Textarea id="pnt" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !form.name}>
              {busy ? "Saving…" : party ? "Save changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
