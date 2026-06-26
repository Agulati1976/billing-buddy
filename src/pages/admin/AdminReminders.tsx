import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { KpiCard } from "@/components/admin/KpiCard";
import { Bell, Send, AlertTriangle, Mail, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  renewal_due: {
    subject: "Your Bill Look subscription is renewing soon",
    body: `Hi {business_name},\n\nYour {plan} plan is set to expire on {expiry_date}. Renew now to keep all features active.\n\nPay here: {pay_link}\n\nTeam Bill Look`,
  },
  payment_overdue: {
    subject: "Action required: Bill Look subscription overdue",
    body: `Hi {business_name},\n\nYour {plan} plan expired on {expiry_date}. Please renew at the earliest to restore access.\n\nPay here: {pay_link}\n\nTeam Bill Look`,
  },
  trial_ending: {
    subject: "Your Bill Look trial is ending",
    body: `Hi {business_name},\n\nYour free trial ends on {expiry_date}. Upgrade now to a paid plan and keep your data safe.\n\nTeam Bill Look`,
  },
  custom: { subject: "", body: "" },
};

export default function AdminReminders() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState<any>({
    business_id: "",
    reminder_type: "renewal_due",
    channel: "email",
    subject: TEMPLATES.renewal_due.subject,
    body: TEMPLATES.renewal_due.body,
  });

  const load = async () => {
    setLoading(true);
    const [{ data: b }, { data: s }, { data: p }, { data: pr }, { data: h }] = await Promise.all([
      supabase.from("businesses").select("id, name, email, phone, owner_id").order("name"),
      supabase.from("business_subscriptions").select("*"),
      supabase.from("subscription_plans").select("id, name"),
      supabase.from("profiles").select("user_id, email, phone, full_name"),
      supabase.from("saas_reminders").select("*").order("sent_at", { ascending: false }).limit(200),
    ]);
    setBusinesses(b ?? []);
    setSubs(s ?? []);
    setPlans(p ?? []);
    setProfiles(pr ?? []);
    setHistory(h ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const bizMap = useMemo(() => new Map(businesses.map((b) => [b.id, b])), [businesses]);
  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const subMap = useMemo(() => {
    const m = new Map<string, any>();
    subs.forEach((s) => m.set(s.business_id, s));
    return m;
  }, [subs]);

  const enriched = useMemo(() => businesses.map((b) => {
    const sub = subMap.get(b.id);
    const owner = profileMap.get(b.owner_id);
    const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : null;
    return {
      ...b,
      planName: planMap.get(sub?.plan_id) ?? "Free",
      expiresAt,
      daysLeft,
      ownerEmail: owner?.email ?? b.email,
      ownerPhone: owner?.phone ?? b.phone,
    };
  }), [businesses, subMap, profileMap, planMap]);

  const expiring = enriched.filter((b) => b.daysLeft !== null && b.daysLeft <= 7 && b.daysLeft >= 0);
  const overdue = enriched.filter((b) => b.daysLeft !== null && b.daysLeft < 0);

  const openFor = (business_id: string, type = "renewal_due") => {
    const tpl = TEMPLATES[type] || TEMPLATES.custom;
    setForm({ business_id, reminder_type: type, channel: "email", subject: tpl.subject, body: tpl.body });
    setOpen(true);
  };

  const onTypeChange = (type: string) => {
    const tpl = TEMPLATES[type] || TEMPLATES.custom;
    setForm((f: any) => ({ ...f, reminder_type: type, subject: tpl.subject, body: tpl.body }));
  };

  const fillVars = (text: string, biz: any) => {
    const sub = subMap.get(biz.id);
    return text
      .split("{business_name}").join(biz.name || "")
      .split("{plan}").join(planMap.get(sub?.plan_id) || "Free")
      .split("{expiry_date}").join(sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString() : "—")
      .split("{amount}").join("")
      .split("{pay_link}").join(`https://billlook.com/billing`);
  };

  const send = async () => {
    if (!form.business_id) { toast.error("Pick a shopkeeper"); return; }
    const biz = bizMap.get(form.business_id);
    if (!biz) return;
    const owner = profileMap.get(biz.owner_id);
    const email = owner?.email ?? biz.email;
    const phone = owner?.phone ?? biz.phone;
    const subject = fillVars(form.subject || "", biz);
    const body = fillVars(form.body || "", biz);

    setSending(true);
    try {
      // Persist reminder record (channel-specific delivery follows)
      const { error } = await supabase.from("saas_reminders").insert({
        business_id: biz.id,
        reminder_type: form.reminder_type,
        channel: form.channel,
        subject,
        body,
        recipient_email: email,
        recipient_phone: phone,
        status: "sent",
      });
      if (error) throw error;

      // WhatsApp: open the wa.me link in a new tab
      if ((form.channel === "whatsapp" || form.channel === "both") && phone) {
        const cleanPhone = String(phone).replace(/[^\d]/g, "");
        const waText = encodeURIComponent(`${subject}\n\n${body}`);
        window.open(`https://wa.me/${cleanPhone}?text=${waText}`, "_blank");
      }
      // Email: invoke edge function if available, else fallback to mailto
      if ((form.channel === "email" || form.channel === "both") && email) {
        const { error: fnErr } = await supabase.functions.invoke("send-saas-reminder", {
          body: { to: email, subject, body, business_id: biz.id },
        });
        if (fnErr) {
          // Fallback to mailto
          const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.open(href, "_blank");
        }
      }

      toast.success("Reminder sent");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <AdminTopbar
        title="Reminders"
        subtitle="Send renewal & overdue reminders to shopkeepers via email or WhatsApp"
        actions={<Button onClick={() => { setForm((f: any) => ({ ...f, business_id: "" })); setOpen(true); }}><Send className="h-4 w-4 mr-2" />New Reminder</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <KpiCard label="Expiring this week" value={expiring.length} icon={Bell} loading={loading} />
        <KpiCard label="Overdue" value={overdue.length} icon={AlertTriangle} loading={loading} />
        <KpiCard label="Reminders sent (all-time)" value={history.length} icon={Send} loading={loading} />
      </div>

      <Tabs defaultValue="targets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="targets">Targets ({expiring.length + overdue.length})</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="targets">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shopkeeper</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...overdue, ...expiring].length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No targets right now</TableCell></TableRow>
                ) : [...overdue, ...expiring].map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.ownerEmail}</div>
                    </TableCell>
                    <TableCell>{b.planName}</TableCell>
                    <TableCell className="text-sm">{b.expiresAt?.toLocaleDateString() ?? "—"}</TableCell>
                    <TableCell>
                      {b.daysLeft! < 0
                        ? <Badge className="bg-destructive/15 text-destructive">{Math.abs(b.daysLeft!)}d overdue</Badge>
                        : <Badge className="bg-amber-500/15 text-amber-700">{b.daysLeft}d left</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.ownerEmail && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{b.ownerEmail}</div>}
                      {b.ownerPhone && <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{b.ownerPhone}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openFor(b.id, b.daysLeft! < 0 ? "payment_overdue" : "renewal_due")}>
                        <Send className="h-4 w-4 mr-1" />Send
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent at</TableHead>
                  <TableHead>Shopkeeper</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No reminders sent yet</TableCell></TableRow>
                ) : history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{new Date(r.sent_at).toLocaleString()}</TableCell>
                    <TableCell>{bizMap.get(r.business_id)?.name ?? r.business_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm capitalize">{r.reminder_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-sm capitalize">{r.channel}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{r.subject}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.status === "sent" ? "bg-emerald-500/15 text-emerald-700" : "bg-destructive/15 text-destructive"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Send reminder</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Shopkeeper</Label>
              <Select value={form.business_id} onValueChange={(v) => setForm({ ...form, business_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{businesses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Template</Label>
                <Select value={form.reminder_type} onValueChange={onTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="renewal_due">Renewal due</SelectItem>
                    <SelectItem value="payment_overdue">Payment overdue</SelectItem>
                    <SelectItem value="trial_ending">Trial ending</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div>
              <Label>Message</Label>
              <Textarea rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">
                Variables: <code>{"{business_name}"}</code> <code>{"{plan}"}</code> <code>{"{expiry_date}"}</code> <code>{"{pay_link}"}</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={sending}>{sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
