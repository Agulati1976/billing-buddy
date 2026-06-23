import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/SearchBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { callAdminAction } from "@/lib/admin/api";
import { toast } from "sonner";

type U = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  businesses: number;
  roles: number;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
};

export default function AdminUsers() {
  const [rows, setRows] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, phone, created_at")
      .order("created_at", { ascending: false });

    const ids = (profs ?? []).map((p: any) => p.user_id);
    const [bizs, roles] = await Promise.all([
      ids.length ? supabase.from("businesses").select("owner_id").in("owner_id", ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from("user_roles").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const bCount: Record<string, number> = {};
    (bizs.data ?? []).forEach((b: any) => { bCount[b.owner_id] = (bCount[b.owner_id] ?? 0) + 1; });
    const rCount: Record<string, number> = {};
    (roles.data ?? []).forEach((r: any) => { rCount[r.user_id] = (rCount[r.user_id] ?? 0) + 1; });

    let authMap: Record<string, any> = {};
    try {
      const res = await callAdminAction<{ users: Record<string, any> }>("list_auth_users", undefined, { ids });
      authMap = res.users ?? {};
    } catch { /* non-fatal */ }

    setRows((profs ?? []).map((p: any) => ({
      ...p,
      businesses: bCount[p.user_id] ?? 0,
      roles: rCount[p.user_id] ?? 0,
      last_sign_in_at: authMap[p.user_id]?.last_sign_in_at ?? null,
      banned_until: authMap[p.user_id]?.banned_until ?? null,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.full_name, r.email, r.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [rows, q]);

  const act = async (action: string, id: string, ok: string) => {
    try { await callAdminAction(action, id); toast.success(ok); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const isBanned = (u: U) => u.banned_until && new Date(u.banned_until) > new Date();

  return (
    <div>
      <AdminTopbar
        title="Users"
        subtitle={`${rows.length} registered users`}
        actions={<div className="w-64"><SearchBar value={q} onChange={setQ} placeholder="Search users…" /></div>}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Businesses</TableHead>
              <TableHead className="text-right">Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            ) : filtered.map((u) => (
              <TableRow key={u.user_id} className="hover:bg-muted/40">
                <TableCell>
                  <div className="font-medium">{u.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{u.user_id.slice(0, 8)}…</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{u.email ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.phone ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{u.businesses}</TableCell>
                <TableCell className="text-right tabular-nums">{u.roles}</TableCell>
                <TableCell><StatusBadge status={isBanned(u) ? "suspended" : "active"} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => act("reset_user_password", u.user_id, "Password reset email sent")}>
                        Send password reset
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {isBanned(u) ? (
                        <DropdownMenuItem onClick={() => act("reactivate_user", u.user_id, "User reactivated")}>Reactivate user</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-destructive" onClick={() => act("suspend_user", u.user_id, "User suspended")}>Suspend user</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
