import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/admin/api";

type Plan = {
  id: string;
  code: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  price_inr: number;
  duration_days: number;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  is_active: boolean;
  sort_order: number;
};

const FEATURE_KEYS: { key: string; label: string }[] = [
  { key: "pos", label: "POS / Quick Bill" },
  { key: "multi_branch", label: "Multi-branch / Online orders" },
  { key: "barcode", label: "Barcode scanning" },
  { key: "batch_tracking", label: "Batch / Expiry tracking" },
  { key: "quick_invoices", label: "Quick Invoices (non-inventory)" },
  { key: "party_ledger", label: "Party Ledger" },
  { key: "reports_export", label: "Reports CSV export" },
  { key: "custom_branding", label: "Custom branding / logo" },
  { key: "loyalty", label: "Loyalty program" },
  { key: "staff_accounts", label: "Multiple staff accounts" },
  { key: "ai_insights", label: "AI insights" },
  { key: "priority_support", label: "Priority support" },
];

const LIMIT_KEYS: { key: string; label: string; placeholder?: string }[] = [
  { key: "max_users", label: "Max staff users", placeholder: "0 = unlimited" },
  { key: "max_invoices_per_month", label: "Invoices / month", placeholder: "0 = unlimited" },
  { key: "max_items", label: "Max items in catalogue", placeholder: "0 = unlimited" },
  { key: "max_branches", label: "Max branches", placeholder: "0 = unlimited" },
  { key: "storage_mb", label: "Storage (MB)", placeholder: "0 = unlimited" },
];

const emptyPlan = (): Plan => ({
  id: "",
  code: "",
  name: "",
  tagline: "",
  description: "",
  price_inr: 0,
  duration_days: 30,
  features: {},
  limits: {},
  is_active: true,
  sort_order: 0,
});

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [activeCounts, setActiveCounts] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: subs }] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("sort_order").order("price_inr"),
      supabase.from("business_subscriptions").select("plan_id, status, expires_at"),
    ]);
    setPlans((p as any[])?.map((x) => ({
      ...x,
      features: x.features || {},
      limits: x.limits || {},
    })) || []);
    const counts: Record<string, number> = {};
    (subs ?? []).forEach((s: any) => {
      if (s.status === "active" && s.expires_at && new Date(s.expires_at) > new Date()) {
        counts[s.plan_id] = (counts[s.plan_id] || 0) + 1;
      }
    });
    setActiveCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.code.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    const payload = {
      code: editing.code.trim().toLowerCase(),
      name: editing.name.trim(),
      tagline: editing.tagline?.trim() || null,
      description: editing.description?.trim() || null,
      price_inr: Number(editing.price_inr) || 0,
      duration_days: Number(editing.duration_days) || 30,
      features: editing.features,
      limits: editing.limits,
      is_active: editing.is_active,
      sort_order: Number(editing.sort_order) || 0,
    };
    const { error } = editing.id
      ? await supabase.from("subscription_plans").update(payload).eq("id", editing.id)
      : await supabase.from("subscription_plans").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Plan updated" : "Plan created");
    setEditing(null);
    load();
  };

  const remove = async () => {
    if (!deleting) return;
    if ((activeCounts[deleting.id] || 0) > 0) {
      toast.error("Cannot delete: plan has active subscribers");
      setDeleting(null);
      return;
    }
    const { error } = await supabase.from("subscription_plans").delete().eq("id", deleting.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Plan deleted");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <AdminTopbar
        title="Plans & Pricing"
        subtitle="Edit price, billing cycle, features and limits for every SaaS plan"
        actions={
          <Button onClick={() => setEditing(emptyPlan())}>
            <Plus className="h-4 w-4 mr-2" /> New Plan
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Active subs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : plans.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No plans yet</TableCell></TableRow>
            ) : plans.map((p) => {
              const enabled = Object.entries(p.features || {}).filter(([, v]) => v).length;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.tagline || p.code}</div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{formatINR(p.price_inr)}</TableCell>
                  <TableCell className="text-sm">{p.duration_days} days</TableCell>
                  <TableCell className="text-sm">{enabled} enabled</TableCell>
                  <TableCell className="text-sm tabular-nums">{activeCounts[p.id] || 0}</TableCell>
                  <TableCell>
                    {p.is_active
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">Active</Badge>
                      : <Badge variant="outline">Disabled</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...p, features: p.features || {}, limits: p.limits || {} })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Plan" : "New Plan"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Code</Label>
                  <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="pro" />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Pro" />
                </div>
              </div>
              <div>
                <Label>Tagline</Label>
                <Input value={editing.tagline ?? ""} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} placeholder="Best for growing shops" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Price (₹)</Label>
                  <Input type="number" value={editing.price_inr} onChange={(e) => setEditing({ ...editing, price_inr: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Cycle (days)</Label>
                  <Input type="number" value={editing.duration_days} onChange={(e) => setEditing({ ...editing, duration_days: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Sort order</Label>
                  <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Features</Label>
                <div className="mt-2 grid sm:grid-cols-2 gap-2 border rounded-md p-3">
                  {FEATURE_KEYS.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                      <span>{f.label}</span>
                      <Switch
                        checked={!!editing.features[f.key]}
                        onCheckedChange={(v) => setEditing({ ...editing, features: { ...editing.features, [f.key]: v } })}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Limits</Label>
                <div className="mt-2 grid sm:grid-cols-2 gap-3 border rounded-md p-3">
                  {LIMIT_KEYS.map((l) => (
                    <div key={l.key}>
                      <Label className="text-xs">{l.label}</Label>
                      <Input
                        type="number"
                        value={editing.limits[l.key] ?? ""}
                        placeholder={l.placeholder}
                        onChange={(e) => setEditing({ ...editing, limits: { ...editing.limits, [l.key]: Number(e.target.value) } })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <Label className="cursor-pointer">Plan is active (visible to customers)</Label>
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(activeCounts[deleting?.id || ""] || 0) > 0
                ? `This plan has ${activeCounts[deleting!.id]} active subscriber(s). Deletion is blocked.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
