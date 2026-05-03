import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";

interface Wh { id: string; name: string; address: string | null; is_default: boolean; }

export default function Warehouses() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [rows, setRows] = useState<Wh[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Wh | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.address].filter(Boolean).some((v) => v!.toLowerCase().includes(q)));
  }, [rows, search]);

  const load = async () => {
    if (!current) return;
    const { data } = await supabase.from("warehouses").select("id, name, address, is_default")
      .eq("business_id", current.id).order("name");
    setRows((data ?? []) as Wh[]);
  };
  useEffect(() => { load(); }, [current?.id]);

  const openNew = () => { setEditing(null); setName(""); setAddress(""); setIsDefault(false); setOpen(true); };
  const openEdit = (w: Wh) => { setEditing(w); setName(w.name); setAddress(w.address ?? ""); setIsDefault(w.is_default); setOpen(true); };

  const submit = async () => {
    if (!current || !user) return;
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    if (isDefault) {
      await supabase.from("warehouses").update({ is_default: false }).eq("business_id", current.id);
    }
    const payload = { business_id: current.id, name: name.trim(), address: address.trim() || null, is_default: isDefault, created_by: user.id };
    const { error } = editing
      ? await supabase.from("warehouses").update(payload).eq("id", editing.id)
      : await supabase.from("warehouses").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Warehouse updated" : "Warehouse created");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this warehouse?")) return;
    const { error } = await supabase.from("warehouses").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6 text-primary" /> Warehouses
          </h1>
          <p className="text-sm text-muted-foreground">Locations where you store inventory</p>
        </div>
        <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New Warehouse</Button>
      </div>

      <Card>
        <div className="p-4 border-b"><SearchBar value={search} onChange={setSearch} placeholder="Search warehouses…" className="max-w-sm" /></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{rows.length === 0 ? "No warehouses yet" : "No matches"}</TableCell></TableRow>
            ) : filtered.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{w.address ?? "—"}</TableCell>
                <TableCell>{w.is_default ? <span className="text-xs px-2 py-0.5 rounded bg-success-soft text-success">Default</span> : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(w)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(w.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Warehouse" : "New Warehouse"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Address</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <Switch id="def-wh" checked={isDefault} onCheckedChange={setIsDefault} />
              <Label htmlFor="def-wh" className="cursor-pointer">Set as default warehouse</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
