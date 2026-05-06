import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/SearchBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Pencil, Trash2, Search, Users, Truck, ChevronRight } from "lucide-react";
import { PartyDialog } from "@/components/PartyDialog";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Party {
  id: string;
  business_id: string;
  type: "customer" | "supplier";
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  state: string | null;
  state_code: string | null;
  opening_balance: number;
  notes: string | null;
}

export default function Parties({ type }: { type: "customer" | "supplier" }) {
  const { current } = useBusiness();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [toDelete, setToDelete] = useState<Party | null>(null);

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("parties")
      .select("*")
      .eq("business_id", current.id)
      .eq("type", type)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Party[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id, type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.phone, r.email, r.gstin].filter(Boolean).some((v) => v!.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("parties").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${toDelete.name} deleted`);
      load();
    }
    setToDelete(null);
  };

  const TypeIcon = type === "customer" ? Users : Truck;
  const title = type === "customer" ? "Customers" : "Suppliers";
  const totalReceivable = rows.reduce((s, r) => s + Number(r.opening_balance || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <TypeIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> {title}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {rows.length} {type}{rows.length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium num text-foreground">{formatINR(totalReceivable)}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpenForm(true); }} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add {type}</span>
        </Button>
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b">
          <SearchBar value={search} onChange={setSearch} placeholder={`Search ${type}s…`} />
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden p-2 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search ? "No matches." : `No ${type}s yet.`}
            </div>
          ) : filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/${type === "customer" ? "customers" : "suppliers"}/${p.id}`)}
              className="w-full text-left mobile-card flex items-center gap-3"
            >
              <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold shrink-0">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{p.name}</div>
                {p.phone && <div className="text-[11px] text-muted-foreground truncate">{p.phone}</div>}
                {p.gstin && <div className="text-[11px] text-muted-foreground font-mono truncate">{p.gstin}</div>}
              </div>
              <div className="text-right shrink-0">
                {Number(p.opening_balance) !== 0 && (
                  <div className="text-sm font-semibold num">{formatINR(Number(p.opening_balance))}</div>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
              </div>
            </button>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Opening Balance</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    {search ? "No matches found." : `No ${type}s yet.`}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate(`/${type === "customer" ? "customers" : "suppliers"}/${p.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium flex items-center gap-1">
                        {p.name}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {p.billing_address && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{p.billing_address}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-sm" onClick={(e) => e.stopPropagation()}>
                        {p.phone && (
                          <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                            <Phone className="h-3 w-3" /> {p.phone}
                          </a>
                        )}
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                            <Mail className="h-3 w-3" /> {p.email}
                          </a>
                        )}
                        {!p.phone && !p.email && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.gstin ? <Badge variant="secondary" className="font-mono text-xs">{p.gstin}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.state_code ? `${p.state_code} · ${p.state}` : "—"}
                    </TableCell>
                    <TableCell className="text-right num font-medium">{formatINR(Number(p.opening_balance))}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(p); setOpenForm(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setToDelete(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PartyDialog
        open={openForm}
        onOpenChange={setOpenForm}
        type={type}
        party={editing}
        onSaved={() => { setOpenForm(false); load(); }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
