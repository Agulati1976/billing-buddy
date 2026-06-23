import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

export default function AdminAuditLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [admins, setAdmins] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.admin_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids)
        : { data: [] as any[] };
      const map: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p; });
      setAdmins(map);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <AdminTopbar title="Audit log" subtitle="Every admin action across the platform (latest 500)" />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No admin actions yet</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{admins[r.admin_id]?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{admins[r.admin_id]?.email ?? r.admin_id.slice(0, 8)}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.action.replaceAll("_", " ")}</Badge></TableCell>
                <TableCell className="text-sm">
                  <div className="capitalize">{r.target_type ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.target_id?.slice(0, 8) ?? "—"}</div>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground max-w-md truncate">
                  {r.metadata && Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
