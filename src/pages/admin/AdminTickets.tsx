import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/support/TicketBadges";
import { TicketDetail } from "@/components/support/TicketDetail";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Search, Users, LifeBuoy } from "lucide-react";

type Ticket = {
  id: string; ticket_number: string; subject: string; status: string; priority: string;
  last_message_at: string; assigned_to: string | null; created_by: string; business_id: string | null;
};

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [businesses, setBusinesses] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [staff, setStaff] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openStaff, setOpenStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ email: "", password: "", full_name: "" });

  const load = async () => {
    const { data } = await supabase.from("support_tickets").select("*")
      .order("last_message_at", { ascending: false });
    const list = (data ?? []) as Ticket[];
    setTickets(list);

    const userIds = Array.from(new Set(list.flatMap((t) => [t.created_by, t.assigned_to].filter(Boolean) as string[])));
    const bizIds = Array.from(new Set(list.map((t) => t.business_id).filter(Boolean) as string[]));
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles")
        .select("user_id,full_name,email").in("user_id", userIds);
      const map: Record<string, string> = {};
      const amap: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => {
        const label = p.full_name || p.email || "User";
        map[p.user_id] = label;
        amap[p.user_id] = label;
      });
      setCustomers(map);
      setAssignees(amap);
    }
    if (bizIds.length) {
      const { data: bizs } = await supabase.from("businesses").select("id,name").in("id", bizIds);
      const bmap: Record<string, string> = {};
      (bizs ?? []).forEach((b: any) => bmap[b.id] = b.name);
      setBusinesses(bmap);
    }
  };

  const loadStaff = async () => {
    const { data } = await supabase.from("support_staff").select("*").order("created_at", { ascending: false });
    setStaff(data ?? []);
  };

  useEffect(() => { load(); loadStaff(); }, []);

  const createStaff = async () => {
    if (!staffForm.email || staffForm.password.length < 6) {
      return toast.error("Email + password (min 6 chars) required");
    }
    const { error } = await supabase.functions.invoke("create-support-staff", { body: staffForm });
    if (error) return toast.error(error.message);
    toast.success("Support agent created");
    setOpenStaff(false);
    setStaffForm({ email: "", password: "", full_name: "" });
    loadStaff();
  };

  const toggleStaff = async (id: string, active: boolean) => {
    const { error } = await supabase.from("support_staff").update({ active: !active }).eq("id", id);
    if (error) return toast.error(error.message);
    loadStaff();
  };

  if (selectedId) {
    return <TicketDetail ticketId={selectedId} onBack={() => { setSelectedId(null); load(); }}
      senderRole="admin" showAssign showStatus />;
  }

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (q && !(t.subject.toLowerCase().includes(q.toLowerCase()) || t.ticket_number.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6" /> Support Tickets
          </h1>
          <p className="text-sm text-muted-foreground">Manage customer tickets and support agents.</p>
        </div>
        <Dialog open={openStaff} onOpenChange={setOpenStaff}>
          <DialogTrigger asChild>
            <Button variant="outline"><Users className="h-4 w-4 mr-2" />Support agents</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Support agents</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input placeholder="Full name" value={staffForm.full_name}
                  onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} />
                <Input type="email" placeholder="Email" value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                <Input type="password" placeholder="Password (min 6)" value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
              </div>
              <Button onClick={createStaff} className="w-full">Create agent</Button>
              <div className="border-t pt-3 space-y-2 max-h-64 overflow-y-auto">
                {staff.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">No agents yet</div>
                ) : staff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <div className="font-medium text-sm">{s.full_name || s.email}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </div>
                    <Button size="sm" variant={s.active ? "outline" : "secondary"}
                      onClick={() => toggleStaff(s.id, s.active)}>
                      {s.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="in_progress">In progress ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="waiting_customer">Waiting</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({counts.resolved})</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by subject or ticket #" className="pl-9"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No tickets found</div>
          ) : (
            <div className="divide-y">
              {filtered.map((t) => (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                  className="w-full text-left p-4 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t.subject}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                        <span>#{t.ticket_number}</span>
                        <span>· {customers[t.created_by] ?? "Customer"}</span>
                        {t.business_id && businesses[t.business_id] && <span>· {businesses[t.business_id]}</span>}
                        <span>· {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}</span>
                        {t.assigned_to && <span>· assigned to {assignees[t.assigned_to] ?? "agent"}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <TicketStatusBadge status={t.status} />
                      <TicketPriorityBadge priority={t.priority} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
