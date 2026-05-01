import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  owner_id: string;
  created_at: string;
  owner_name?: string | null;
  owner_email?: string | null;
};

export default function AdminShopkeepers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data: bizs } = await supabase
        .from("businesses")
        .select("id, name, email, phone, state, owner_id, created_at")
        .order("created_at", { ascending: false });
      const ownerIds = Array.from(new Set((bizs ?? []).map((b) => b.owner_id)));
      const { data: profs } = ownerIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ownerIds)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      setRows(
        (bizs ?? []).map((b) => ({
          ...b,
          owner_name: map.get(b.owner_id)?.full_name ?? null,
          owner_email: map.get(b.owner_id)?.email ?? null,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.phone, r.owner_name, r.owner_email, r.state]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    );
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Shopkeepers</h1>
          <p className="text-sm text-muted-foreground">{rows.length} businesses on the platform</p>
        </div>
        <Input placeholder="Search…" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No shopkeepers found</TableCell></TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell>
                    <Link to={`/admin/shopkeepers/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{r.owner_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.owner_email ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{r.email ?? "—"}</div>
                    <div className="text-muted-foreground">{r.phone ?? "—"}</div>
                  </TableCell>
                  <TableCell>{r.state ? <Badge variant="secondary">{r.state}</Badge> : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
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
