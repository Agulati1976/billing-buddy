import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Gift, Save, Search } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";

interface LoyaltySettings {
  business_id: string;
  enabled: boolean;
  amount_per_point: number;
  point_value: number;
  min_redeem_points: number;
}

export default function Loyalty() {
  const { current } = useBusiness();
  const [settings, setSettings] = useState<LoyaltySettings>({
    business_id: "", enabled: true, amount_per_point: 100, point_value: 1, min_redeem_points: 50,
  });
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<{ party_id: string; name: string; earned: number; redeemed: number; balance: number }[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!current) return;
    (async () => {
      const { data } = await supabase.from("loyalty_settings").select("*").eq("business_id", current.id).maybeSingle();
      if (data) setSettings(data as any);
      else setSettings((s) => ({ ...s, business_id: current.id }));

      const [{ data: tx }, { data: parties }] = await Promise.all([
        supabase.from("loyalty_transactions").select("party_id, points_earned, points_redeemed").eq("business_id", current.id),
        supabase.from("parties").select("id, name").eq("business_id", current.id).eq("type", "customer"),
      ]);
      const map = new Map<string, { earned: number; redeemed: number }>();
      (tx ?? []).forEach((t: any) => {
        const cur = map.get(t.party_id) ?? { earned: 0, redeemed: 0 };
        cur.earned += Number(t.points_earned || 0);
        cur.redeemed += Number(t.points_redeemed || 0);
        map.set(t.party_id, cur);
      });
      const rows = (parties ?? []).map((p: any) => {
        const v = map.get(p.id) ?? { earned: 0, redeemed: 0 };
        return { party_id: p.id, name: p.name, earned: v.earned, redeemed: v.redeemed, balance: v.earned - v.redeemed };
      }).filter((r) => r.balance > 0 || r.earned > 0)
        .sort((a, b) => b.balance - a.balance);
      setMembers(rows);
    })();
  }, [current?.id]);

  const filtered = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())),
    [members, q]
  );

  const save = async () => {
    if (!current) return;
    setSaving(true);
    const { error } = await supabase.from("loyalty_settings").upsert({
      business_id: current.id,
      enabled: settings.enabled,
      amount_per_point: Number(settings.amount_per_point) || 0,
      point_value: Number(settings.point_value) || 0,
      min_redeem_points: Number(settings.min_redeem_points) || 0,
    }, { onConflict: "business_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Loyalty settings saved");
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 text-primary" /> Loyalty Program
        </h1>
        <p className="text-sm text-muted-foreground">Reward customers with points on every purchase. They can redeem points as discount on future invoices.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Program Settings</h2>
            <p className="text-xs text-muted-foreground">Configure how customers earn and redeem points.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="enabled" checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
            <Label htmlFor="enabled">{settings.enabled ? "Active" : "Disabled"}</Label>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Spend per point (₹)</Label>
            <Input type="number" min="1" value={settings.amount_per_point}
              onChange={(e) => setSettings({ ...settings, amount_per_point: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">Customer earns 1 point per ₹{settings.amount_per_point} spent.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Value of 1 point (₹)</Label>
            <Input type="number" min="0" step="0.01" value={settings.point_value}
              onChange={(e) => setSettings({ ...settings, point_value: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">Each point = ₹{settings.point_value} discount on redemption.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Minimum points to redeem</Label>
            <Input type="number" min="0" value={settings.min_redeem_points}
              onChange={(e) => setSettings({ ...settings, min_redeem_points: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">Customers must have at least this many points to redeem.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="font-medium">Customer Points Balance</div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-9 w-[240px]" placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Redeemed</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Worth</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No loyalty activity yet.</TableCell></TableRow>
            ) : filtered.map((m) => (
              <TableRow key={m.party_id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="text-right tabular-nums">{m.earned}</TableCell>
                <TableCell className="text-right tabular-nums">{m.redeemed}</TableCell>
                <TableCell className="text-right tabular-nums"><Badge variant="secondary">{m.balance}</Badge></TableCell>
                <TableCell className="text-right tabular-nums text-success">{formatINR(m.balance * settings.point_value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
