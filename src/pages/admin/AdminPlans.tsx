import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SearchBar } from "@/components/SearchBar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { callAdminAction } from "@/lib/admin/api";
import { toast } from "sonner";

const PLANS = ["free", "pro", "enterprise"];

export default function AdminPlans() {
  const [bizs, setBizs] = useState<any[]>([]);
  const [feats, setFeats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: b }, { data: f }] = await Promise.all([
      supabase.from("businesses").select("id, name, email, owner_id").order("name"),
      supabase.from("business_features").select("*"),
    ]);
    setBizs(b ?? []);
    const map: Record<string, any> = {};
    (f ?? []).forEach((row: any) => { map[row.business_id] = row; });
    setFeats(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setPlan = async (id: string, plan: string) => {
    try { await callAdminAction("update_plan", id, { plan }); toast.success("Plan updated"); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const togglePos = async (id: string, next: boolean) => {
    try {
      await callAdminAction("update_feature", id, {
        pos_enabled: next,
        pos_enabled_at: next ? new Date().toISOString() : null,
      });
      toast.success(next ? "POS enabled" : "POS disabled");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return bizs;
    return bizs.filter((b: any) => [b.name, b.email].filter(Boolean).some((v: string) => v.toLowerCase().includes(s)));
  }, [bizs, q]);

  return (
    <div>
      <AdminTopbar
        title="Plans & Features"
        subtitle="Per-shopkeeper plan tier and feature toggles"
        actions={<div className="w-64"><SearchBar value={q} onChange={setQ} placeholder="Search…" /></div>}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shopkeeper</TableHead>
              <TableHead>Current plan</TableHead>
              <TableHead>Change plan</TableHead>
              <TableHead>POS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.map((b) => {
              const f = feats[b.id] ?? {};
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.email ?? "—"}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={f.plan ?? "free"} /></TableCell>
                  <TableCell>
                    <Select value={f.plan ?? "free"} onValueChange={(v) => setPlan(b.id, v)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch checked={!!f.pos_enabled} onCheckedChange={(v) => togglePos(b.id, v)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
