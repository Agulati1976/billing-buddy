import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ShoppingCart, KeyRound, Trash2, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { KpiCard } from "@/components/admin/KpiCard";
import { callAdminAction, formatINR } from "@/lib/admin/api";
import { Receipt, Wallet, AlertCircle, Package, Users as UsersIcon } from "lucide-react";

export default function AdminShopkeeperDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [biz, setBiz] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [counts, setCounts] = useState({ items: 0, parties: 0, invoices: 0, revenue: 0, paid: 0, due: 0, members: 0 });
  const [members, setMembers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [feat, setFeat] = useState<any>(null);
  const [savingPos, setSavingPos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: b } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
    setBiz(b);
    if (b) {
      const { data: o } = await supabase.from("profiles").select("*").eq("user_id", b.owner_id).maybeSingle();
      setOwner(o);
    }
    const [itemsR, partiesR, invsR, roles, feats, pays] = await Promise.all([
      supabase.from("items").select("id, name, type, current_stock, sale_price").eq("business_id", id).limit(100),
      supabase.from("parties").select("id, name, type, phone, email").eq("business_id", id).limit(100),
      supabase.from("invoices").select("id, invoice_number, type, status, total_amount, paid_amount, balance_amount, invoice_date").eq("business_id", id).order("invoice_date", { ascending: false }).limit(100),
      supabase.from("user_roles").select("user_id, role").eq("business_id", id),
      supabase.from("business_features").select("*").eq("business_id", id).maybeSingle(),
      supabase.from("payments").select("id, amount, method, payment_date, reference").eq("business_id", id).order("payment_date", { ascending: false }).limit(100),
    ]);
    const sales = (invsR.data ?? []).filter((i: any) => i.type === "sale");
    setInvoices(invsR.data ?? []);
    setItems(itemsR.data ?? []);
    setParties(partiesR.data ?? []);
    setPayments(pays.data ?? []);
    setFeat(feats.data ?? null);
    setCounts({
      items: itemsR.data?.length ?? 0,
      parties: partiesR.data?.length ?? 0,
      invoices: sales.length,
      revenue: sales.reduce((s, i: any) => s + Number(i.total_amount || 0), 0),
      paid: sales.reduce((s, i: any) => s + Number(i.paid_amount || 0), 0),
      due: sales.reduce((s, i: any) => s + Number(i.balance_amount || 0), 0),
      members: roles.data?.length ?? 0,
    });
    const memberIds = (roles.data ?? []).map((r: any) => r.user_id);
    if (memberIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", memberIds);
      const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      setMembers((roles.data ?? []).map((r: any) => ({ ...r, ...(map.get(r.user_id) ?? {}) })));
    } else setMembers([]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const togglePos = async (next: boolean) => {
    if (!id || !user) return;
    setSavingPos(true);
    try {
      await callAdminAction("update_feature", id, {
        pos_enabled: next,
        pos_enabled_at: next ? new Date().toISOString() : null,
        pos_enabled_by: next ? user.id : null,
      });
      toast.success(next ? "POS enabled" : "POS disabled");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setSavingPos(false); }
  };

  const doAction = async (action: string, ok: string, confirmMsg?: string) => {
    if (!id) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setWorking(true);
    try { await callAdminAction(action, id); toast.success(ok); load(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setWorking(false); }
  };

  const resetPassword = async () => {
    if (!biz?.owner_id) return;
    setWorking(true);
    try { await callAdminAction("reset_user_password", biz.owner_id); toast.success("Password reset email sent"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setWorking(false); }
  };

  if (loading) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!biz) return <div>Not found.</div>;

  const isSuspended = biz.status === "suspended" || biz.deleted_at;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to="/admin/shopkeepers"><ArrowLeft className="h-4 w-4 mr-1" /> All shopkeepers</Link>
      </Button>

      <AdminTopbar
        title={biz.name}
        subtitle={`Joined ${new Date(biz.created_at).toLocaleDateString()} · Owner: ${owner?.full_name ?? owner?.email ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={biz.deleted_at ? "deleted" : biz.status} />
            <StatusBadge status={feat?.plan ?? "free"} />
            <Button variant="outline" size="sm" disabled={working} onClick={resetPassword}>
              <KeyRound className="h-4 w-4 mr-1" /> Reset password
            </Button>
            {isSuspended ? (
              <Button variant="outline" size="sm" disabled={working} onClick={() => doAction("reactivate_business", "Reactivated")}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reactivate
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={working} onClick={() => doAction("suspend_business", "Suspended", "Suspend this shopkeeper?")}>
                <Ban className="h-4 w-4 mr-1" /> Suspend
              </Button>
            )}
            <Button variant="destructive" size="sm" disabled={working} onClick={() => doAction("delete_business", "Deleted", "Soft-delete this shopkeeper? Data is kept.")}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label="Gross sales" value={formatINR(counts.revenue)} icon={Receipt} />
        <KpiCard label="Collected" value={formatINR(counts.paid)} icon={Wallet} />
        <KpiCard label="Outstanding" value={formatINR(counts.due)} icon={AlertCircle} />
        <KpiCard label="Sales invoices" value={counts.invoices} icon={Receipt} />
        <KpiCard label="Items" value={counts.items} icon={Package} />
        <KpiCard label="Parties" value={counts.parties} icon={UsersIcon} />
        <KpiCard label="Team" value={counts.members} icon={UsersIcon} />
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5 space-y-2">
              <h3 className="font-medium mb-2">Business</h3>
              <Field label="GSTIN" value={biz.gstin} />
              <Field label="Email" value={biz.email} />
              <Field label="Phone" value={biz.phone} />
              <Field label="State" value={biz.state} />
              <Field label="Address" value={biz.address} />
            </Card>
            <Card className="p-5 space-y-2">
              <h3 className="font-medium mb-2">Owner</h3>
              <Field label="Name" value={owner?.full_name} />
              <Field label="Email" value={owner?.email} />
              <Field label="Phone" value={owner?.phone} />
            </Card>
          </div>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShoppingCart className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Point of Sale (POS)</h3>
                  <p className="text-sm text-muted-foreground">Enable POS for this shopkeeper.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">{feat?.pos_enabled ? "Enabled" : "Disabled"}</Label>
                <Switch checked={!!feat?.pos_enabled} disabled={savingPos} onCheckedChange={togglePos} />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No invoices</TableCell></TableRow>
                ) : invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.invoice_number ?? i.id.slice(0, 8)}</TableCell>
                    <TableCell className="capitalize text-sm">{i.type.replace("_", " ")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.invoice_date ? new Date(i.invoice_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{i.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(i.total_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(i.balance_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No payments</TableCell></TableRow>
                ) : payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{p.method ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Sale price</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No items</TableCell></TableRow>
                ) : items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="capitalize text-sm">{i.type}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.current_stock ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(i.sale_price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="parties" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {parties.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No parties</TableCell></TableRow>
                ) : parties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="capitalize text-sm">{p.type}</TableCell>
                    <TableCell className="text-sm">{p.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.email ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <Card className="p-5 space-y-3">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Only the owner.</p>
            ) : members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                <div>
                  <div className="font-medium">{m.full_name ?? "—"}</div>
                  <div className="text-muted-foreground text-xs">{m.email ?? m.user_id}</div>
                </div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.role}</span>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span>{value || "—"}</span>
    </div>
  );
}
