import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Building2, Users, Palette, Settings as SettingsIcon, ChevronRight, Hash, Pencil } from "lucide-react";
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

  const [editOpen, setEditOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", gstin: "", pan: "",
    state: "", state_code: "", address: "",
  });

  useEffect(() => {
    setPincode((current as any)?.pincode ?? "");
  }, [current?.id]);

  useEffect(() => {
    if (!current) return;
    setForm({
      name: current.name ?? "",
      phone: (current as any).phone ?? "",
      email: (current as any).email ?? "",
      gstin: (current as any).gstin ?? "",
      pan: (current as any).pan ?? "",
      state: (current as any).state ?? "",
      state_code: (current as any).state_code ?? "",
      address: (current as any).address ?? "",
    });
  }, [current?.id, editOpen]);

  const saveProfile = async () => {
    if (!current) return;
    if (!form.name.trim()) { toast.error("Business name is required"); return; }
    if (form.gstin && !/^[0-9A-Z]{15}$/.test(form.gstin.trim().toUpperCase())) {
      toast.error("GSTIN must be 15 characters"); return;
    }
    if (form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.trim().toUpperCase())) {
      toast.error("PAN must be in format ABCDE1234F"); return;
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      toast.error("Invalid email"); return;
    }
    setSavingProfile(true);
    const payload: any = {
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    };
    const { error } = await supabase.from("businesses").update(payload).eq("id", current.id);
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Business details updated");
    setEditOpen(false);
    await refresh();
  };


  const renumberAll = async (pin: string, rank: number) => {
    if (!current) return;
    const { data, error } = await supabase
      .from("invoices")
      .select("id, type, invoice_date, created_at")
      .eq("business_id", current.id)
      .is("deleted_at", null)
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
          <div className="flex items-center gap-2">
            {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
            {isOwnerAdmin && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </div>
        </div>
        <dl className="text-sm grid grid-cols-3 gap-y-2">
          <dt className="text-muted-foreground">Name</dt><dd className="col-span-2">{current?.name}</dd>
          <dt className="text-muted-foreground">GSTIN</dt><dd className="col-span-2 font-mono">{current?.gstin || "—"}</dd>
          <dt className="text-muted-foreground">PAN</dt><dd className="col-span-2 font-mono">{(current as any)?.pan || "—"}</dd>
          <dt className="text-muted-foreground">State</dt><dd className="col-span-2">{current?.state_code ? `${current.state_code} · ${current.state}` : "—"}</dd>
          <dt className="text-muted-foreground">Pincode</dt><dd className="col-span-2 font-mono">{curPin || "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt><dd className="col-span-2">{current?.phone || "—"}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="col-span-2">{current?.email || "—"}</dd>
          <dt className="text-muted-foreground">Address</dt><dd className="col-span-2 whitespace-pre-line">{current?.address || "—"}</dd>
        </dl>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit business details</DialogTitle>
            <DialogDescription>Update your shop's basic information. Pincode is changed from the numbering section.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Business name *</Label>
              <Input id="b-name" value={form.name} disabled />
              <p className="text-xs text-muted-foreground">Locked. Contact support to change.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-phone">Phone</Label>
                <Input id="b-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-email">Email</Label>
                <Input id="b-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-gstin">GSTIN</Label>
                <Input id="b-gstin" maxLength={15} className="font-mono uppercase" value={form.gstin} disabled />
                <p className="text-xs text-muted-foreground">Locked.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-pan">PAN</Label>
                <Input id="b-pan" maxLength={10} className="font-mono uppercase" placeholder="ABCDE1234F" value={form.pan} disabled />
                <p className="text-xs text-muted-foreground">Locked.</p>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-state">State</Label>
                <Input id="b-state" value={form.state} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-stcode">State code</Label>
                <Input id="b-stcode" maxLength={2} className="font-mono" value={form.state_code} disabled />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">State and state code are locked.</p>
            <div className="space-y-1.5">
              <Label htmlFor="b-addr">Address</Label>
              <Textarea id="b-addr" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingProfile}>Cancel</Button>
            <Button onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
