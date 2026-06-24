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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";

interface Branch { id: string; name: string; code: string; address: string | null; }

export default function Branches() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [rows, setRows] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.code, r.address].filter(Boolean).some((v) => v!.toLowerCase().includes(q)));
  }, [rows, search]);

  const load = async () => {
    if (!current) return;
    const { data } = await supabase.from("branches" as any).select("id, name, code, address")
      .eq("business_id", current.id).order("name");
    setRows((data ?? []) as any);
  };
  useEffect(() => { load(); }, [current?.id]);

  const [codeTouched, setCodeTouched] = useState(false);

  const generateCode = (n: string) => {
    const base = n.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "");
    if (!base) return "";
    const words = base.split(/\s+/).filter(Boolean);
    let code = words.length >= 2
      ? words.slice(0, 3).map((w) => w[0]).join("")
      : words[0].slice(0, 4);
    const existing = new Set(
      rows.filter((r) => !editing || r.id !== editing.id).map((r) => r.code)
    );
    if (!existing.has(code)) return code;
    for (let i = 1; i < 100; i++) {
      const c = `${code}${i}`;
      if (!existing.has(c)) return c;
    }
    return code + Date.now().toString().slice(-3);
  };

  const openNew = () => {
    setEditing(null); setName(""); setCode(""); setAddress(""); setCodeTouched(false); setOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditing(b); setName(b.name); setCode(b.code); setAddress(b.address ?? ""); setCodeTouched(true); setOpen(true);
  };

  // Auto-generate code from name for new branches until the user edits it manually
  useEffect(() => {
    if (open && !editing && !codeTouched) {
      setCode(generateCode(name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, open, editing, codeTouched]);

  const submit = async () => {
    if (!current || !user) return;
    if (!name.trim()) { toast.error("Branch name is required"); return; }
    let cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cleanCode) cleanCode = generateCode(name);
    if (!cleanCode) { toast.error("Could not generate branch code"); return; }
    setSaving(true);
    const payload: any = {
      business_id: current.id,
      name: name.trim(),
      code: cleanCode,
      address: address.trim() || null,
      created_by: user.id,
    };
    const { error } = editing
      ? await supabase.from("branches" as any).update(payload).eq("id", editing.id)
      : await supabase.from("branches" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Branch code already used" : error.message);
      return;
    }
    toast.success(editing ? "Branch updated" : "Branch created");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this branch?")) return;
    const { error } = await supabase.from("branches" as any).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Branches
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Add branches and a short code — used in online order invoice numbers</p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Branch</Button>
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b">
          <SearchBar value={search} onChange={setSearch} placeholder="Search branches…" className="max-w-sm" />
        </div>

        <div className="sm:hidden p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">{rows.length === 0 ? "No branches yet" : "No matches"}</div>
          ) : filtered.map((b) => (
            <Card key={b.id} className="p-3 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{b.name} <span className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded bg-muted">{b.code}</span></div>
                {b.address && <div className="text-xs text-muted-foreground truncate">{b.address}</div>}
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[120px]">Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{rows.length === 0 ? "No branches yet" : "No matches"}</TableCell></TableRow>
              ) : filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="font-mono text-sm">{b.code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.address ?? "—"}</TableCell>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Branch" : "New Branch"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Branch Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MG Road Outlet" /></div>
            <div>
              <Label>Branch Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="e.g. MG, BLR1" />
              <p className="text-xs text-muted-foreground mt-1">Short code (A–Z, 0–9). Added to invoice numbers for online orders.</p>
            </div>
            <div><Label>Address</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
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
