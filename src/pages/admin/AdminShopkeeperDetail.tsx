import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function AdminShopkeeperDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [biz, setBiz] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [counts, setCounts] = useState({ items: 0, parties: 0, invoices: 0, revenue: 0, paid: 0, due: 0, members: 0 });
  const [members, setMembers] = useState<any[]>([]);
  const [posEnabled, setPosEnabled] = useState(false);
  const [savingPos, setSavingPos] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: b } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
      setBiz(b);
      if (b) {
        const { data: o } = await supabase.from("profiles").select("*").eq("user_id", b.owner_id).maybeSingle();
        setOwner(o);
      }
      const [items, parties, invs, roles] = await Promise.all([
        supabase.from("items").select("id", { count: "exact", head: true }).eq("business_id", id),
        supabase.from("parties").select("id", { count: "exact", head: true }).eq("business_id", id),
        supabase.from("invoices").select("total_amount, paid_amount, balance_amount, type").eq("business_id", id),
        supabase.from("user_roles").select("user_id, role").eq("business_id", id),
      ]);
      const sales = (invs.data ?? []).filter((i: any) => i.type === "sale");
      const revenue = sales.reduce((s, i: any) => s + Number(i.total_amount || 0), 0);
      const paid = sales.reduce((s, i: any) => s + Number(i.paid_amount || 0), 0);
      const due = sales.reduce((s, i: any) => s + Number(i.balance_amount || 0), 0);
      setCounts({
        items: items.count ?? 0,
        parties: parties.count ?? 0,
        invoices: sales.length,
        revenue,
        paid,
        due,
        members: roles.data?.length ?? 0,
      });
      const memberIds = (roles.data ?? []).map((r: any) => r.user_id);
      if (memberIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", memberIds);
        const map = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
        setMembers((roles.data ?? []).map((r: any) => ({ ...r, ...(map.get(r.user_id) ?? {}) })));
      }
      const { data: feat } = await supabase.from("business_features").select("pos_enabled").eq("business_id", id).maybeSingle();
      setPosEnabled(!!feat?.pos_enabled);
      setLoading(false);
    })();
  }, [id]);

  const togglePos = async (next: boolean) => {
    if (!id || !user) return;
    setSavingPos(true);
    const payload = {
      business_id: id, pos_enabled: next,
      pos_enabled_at: next ? new Date().toISOString() : null,
      pos_enabled_by: next ? user.id : null,
    };
    const { error } = await supabase.from("business_features").upsert(payload, { onConflict: "business_id" });
    setSavingPos(false);
    if (error) toast.error(error.message);
    else { setPosEnabled(next); toast.success(next ? "POS enabled" : "POS disabled"); }
  };

  if (loading) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!biz) return <div>Not found.</div>;

  const fmt = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/shopkeepers"><ArrowLeft className="h-4 w-4 mr-1" /> All shopkeepers</Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">{biz.name}</h1>
        <p className="text-sm text-muted-foreground">Joined {new Date(biz.created_at).toLocaleDateString()}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-2">
          <h3 className="font-medium">Business</h3>
          <Field label="GSTIN" value={biz.gstin} />
          <Field label="Email" value={biz.email} />
          <Field label="Phone" value={biz.phone} />
          <Field label="State" value={biz.state} />
          <Field label="Address" value={biz.address} />
        </Card>
        <Card className="p-5 space-y-2">
          <h3 className="font-medium">Owner</h3>
          <Field label="Name" value={owner?.full_name} />
          <Field label="Email" value={owner?.email} />
          <Field label="Phone" value={owner?.phone} />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Items" value={counts.items} />
        <Stat label="Customers/Suppliers" value={counts.parties} />
        <Stat label="Sales Invoices" value={counts.invoices} />
        <Stat label="Team members" value={counts.members} />
        <Stat label="Gross Sales" value={fmt(counts.revenue)} />
        <Stat label="Collected" value={fmt(counts.paid)} />
        <Stat label="Outstanding" value={fmt(counts.due)} />
      </div>

      <Card className="p-5">
        <h3 className="font-medium mb-3">Team members</h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Only the owner.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                <div>
                  <div className="font-medium">{m.full_name ?? "—"}</div>
                  <div className="text-muted-foreground text-xs">{m.email ?? m.user_id}</div>
                </div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.role}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
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

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </Card>
  );
}
