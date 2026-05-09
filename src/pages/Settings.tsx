import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Users, Palette, Settings as SettingsIcon, ChevronRight, Hash } from "lucide-react";
import { Link } from "react-router-dom";
import { useBusiness } from "@/hooks/useBusiness";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { shopInvoiceBase } from "@/lib/invoice";
import { toast } from "sonner";

export default function Settings() {
  const { current, refresh } = useBusiness();
  const { role } = usePermissions();
  const isOwnerAdmin = role === "owner" || role === "admin";

  const [pincode, setPincode] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    setPincode((current as any)?.pincode ?? "");
  }, [current?.id]);

  const renumberAll = async (pin: string, rank: number) => {
    if (!current) return;
    const { data, error } = await supabase
      .from("invoices")
      .select("id, type, invoice_date, created_at")
      .eq("business_id", current.id)
      .order("invoice_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    const counters: Record<string, number> = {};
    let updated = 0;
    for (const inv of (data ?? []) as any[]) {
      const base = shopInvoiceBase(pin, rank, inv.invoice_date);
      const key = `${inv.type}|${inv.invoice_date}`;
      counters[key] = (counters[key] ?? 0) + 1;
      const num = counters[key] === 1 ? base : `${base}-${counters[key]}`;
      const { error: e } = await supabase.from("invoices").update({ invoice_number: num }).eq("id", inv.id);
      if (!e) updated++;
    }
    toast.success(`Renumbered ${updated} invoice(s)`);
  };

  const savePincode = async () => {
    if (!current) return;
    if (!/^\d{6}$/.test(pincode)) { toast.error("Pincode must be 6 digits"); return; }
    setSavingPin(true);
    const { data, error } = await supabase
      .from("businesses")
      .update({ pincode } as any)
      .eq("id", current.id)
      .select("pincode, pincode_rank")
      .maybeSingle();
    if (error) { toast.error(error.message); setSavingPin(false); return; }
    const newPin = (data as any)?.pincode as string;
    const newRank = (data as any)?.pincode_rank as number;
    toast.success(`Pincode saved. Your store is #${String(newRank).padStart(3, "0")} in ${newPin}.`);
    await renumberAll(newPin, newRank);
    await refresh();
    setSavingPin(false);
  };

  const tiles = [
    { to: "/settings/team",    icon: Users,   title: "Team & Permissions",
      desc: "Invite teammates and set their access level." },
    { to: "/settings/invoice", icon: Palette, title: "Invoice Design",
      desc: "Pick a template, accent colour, footer text and defaults." },
  ];

  const curPin = (current as any)?.pincode as string | null;
  const curRank = (current as any)?.pincode_rank as number | null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">Manage your business profile, team and invoice appearance.</p>
      </div>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Current business</h2>
          {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
        </div>
        <dl className="text-sm grid grid-cols-3 gap-y-2">
          <dt className="text-muted-foreground">Name</dt><dd className="col-span-2">{current?.name}</dd>
          <dt className="text-muted-foreground">GSTIN</dt><dd className="col-span-2 font-mono">{current?.gstin || "—"}</dd>
          <dt className="text-muted-foreground">State</dt><dd className="col-span-2">{current?.state_code ? `${current.state_code} · ${current.state}` : "—"}</dd>
          <dt className="text-muted-foreground">Pincode</dt><dd className="col-span-2 font-mono">{curPin || "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt><dd className="col-span-2">{current?.phone || "—"}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="col-span-2">{current?.email || "—"}</dd>
          <dt className="text-muted-foreground">Address</dt><dd className="col-span-2 whitespace-pre-line">{current?.address || "—"}</dd>
        </dl>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <Hash className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">Invoice numbering</h2>
            <p className="text-sm text-muted-foreground">
              Invoices use the format <span className="font-mono">PINCODE/STORE&nbsp;NO/DDMMYY</span>
              {curPin && curRank ? (
                <> &nbsp;— e.g. <span className="font-mono">{shopInvoiceBase(curPin, curRank, new Date().toISOString().slice(0,10))}</span></>
              ) : null}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="pin">Shop pincode</Label>
            <Input
              id="pin"
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="110001"
              disabled={!isOwnerAdmin}
            />
          </div>
          <Button onClick={savePincode} disabled={!isOwnerAdmin || savingPin || pincode === (curPin ?? "")}>
            {savingPin ? "Saving & renumbering…" : "Save & renumber invoices"}
          </Button>
        </div>
        {curRank ? (
          <p className="text-xs text-muted-foreground">
            Your store is #{String(curRank).padStart(3, "0")} registered in pincode {curPin}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Setting the pincode will assign your store a number (001, 002…) based on the order shops registered in this pincode, then renumber all existing invoices to the new format.
          </p>
        )}
        {!isOwnerAdmin && <p className="text-xs text-muted-foreground">Only owners/admins can change this.</p>}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to}>
            <Card className="p-5 hover:border-primary/40 transition cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold flex items-center justify-between">
                    {t.title}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
