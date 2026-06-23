import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { SearchBar } from "@/components/SearchBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { callAdminAction, formatINR } from "@/lib/admin/api";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  owner_id: string;
  created_at: string;
  status: string;
  deleted_at: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  plan?: string;
  revenue?: number;
  last_invoice_at?: string | null;
};

export default function AdminShopkeepers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  const load = async () => {
    setLoading(true);
    const { data: bizs } = await supabase
      .from("businesses")
      .select("id, name, email, phone, state, owner_id, created_at, status, deleted_at")
      .order("created_at", { ascending: false });

    const ownerIds = Array.from(new Set((bizs ?? []).map((b) => b.owner_id)));
    const bizIds = (bizs ?? []).map((b) => b.id);

    const [profs, feats, invs] = await Promise.all([
      ownerIds.length
        ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", ownerIds)
        : Promise.resolve({ data: [] as any[] }),
      bizIds.length
        ? supabase.from("business_features").select("business_id, plan").in("business_id", bizIds)
        : Promise.resolve({ data: [] as any[] }),
      bizIds.length
        ? supabase.from("invoices").select("business_id, total_amount, created_at").eq("type", "sale").in("business_id", bizIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const pMap = new Map((profs.data ?? []).map((p: any) => [p.user_id, p]));
    const fMap = new Map((feats.data ?? []).map((f: any) => [f.business_id, f]));
    const rev: Record<string, { revenue: number; last: string | null }> = {};
    (invs.data ?? []).forEach((i: any) => {
      const r = rev[i.business_id] ?? { revenue: 0, last: null };
      r.revenue += Number(i.total_amount || 0);
      if (!r.last || i.created_at > r.last) r.last = i.created_at;
      rev[i.business_id] = r;
    });

    setRows(
      (bizs ?? []).map((b: any) => ({
        ...b,
        owner_name: pMap.get(b.owner_id)?.full_name ?? null,
        owner_email: pMap.get(b.owner_id)?.email ?? null,
        plan: fMap.get(b.id)?.plan ?? "free",
        revenue: rev[b.id]?.revenue ?? 0,
        last_invoice_at: rev[b.id]?.last ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => statusFilter === "all" || (r.status ?? "active") === statusFilter)
      .filter((r) => !s || [r.name, r.email, r.phone, r.owner_name, r.owner_email, r.state]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)));
  }, [rows, q, statusFilter]);

  const act = async (action: string, id: string, ok: string) => {
    try { await callAdminAction(action, id); toast.success(ok); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <div>
      <AdminTopbar
        title="Shopkeepers"
        subtitle={`${rows.length} businesses on the platform`}
        actions={
          <div className="flex items-center gap-2">
            {(["all", "active", "suspended"] as const).map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize">{s}</Button>
            ))}
            <div className="w-64"><SearchBar value={q} onChange={setQ} placeholder="Search…" /></div>
          </div>
        }
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>Last invoice</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No shopkeepers found</TableCell></TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/40">
                  <TableCell>
                    <Link to={`/admin/shopkeepers/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    <div className="text-xs text-muted-foreground">{r.email ?? r.phone ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{r.owner_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.owner_email ?? "—"}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={r.plan} /></TableCell>
                  <TableCell><StatusBadge status={r.deleted_at ? "deleted" : r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatINR(r.revenue ?? 0)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.last_invoice_at ? new Date(r.last_invoice_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/shopkeepers/${r.id}`}><ExternalLink className="h-3.5 w-3.5 mr-2" /> Open detail</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {r.status === "suspended" ? (
                          <DropdownMenuItem onClick={() => act("reactivate_business", r.id, "Reactivated")}>Reactivate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => act("suspend_business", r.id, "Suspended")}>Suspend</DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Soft-delete ${r.name}? Data is kept, business is marked deleted.`))
                              act("delete_business", r.id, "Deleted");
                          }}
                        >Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
