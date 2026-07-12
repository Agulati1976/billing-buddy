import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/support/TicketBadges";
import { toast } from "sonner";
import { LifeBuoy, Plus, Send, MessageSquare, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Ticket = {
  id: string; ticket_number: string; subject: string; description: string | null;
  status: string; priority: string; created_at: string; last_message_at: string;
  assigned_to: string | null;
};

type Message = {
  id: string; message: string; sender_role: string; sender_id: string; created_at: string;
};

export default function Support() {
  const { user } = useAuth();
  const { current } = useBusiness();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "medium" });

  const selected = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("created_by", user.id)
      .order("last_message_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    supabase.from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", selectedId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data ?? []) as Message[]));

    const channel = supabase.channel(`ticket-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  const createTicket = async () => {
    if (!user || !form.subject.trim()) return;
    const { data, error } = await supabase.from("support_tickets").insert({
      subject: form.subject.trim(),
      description: form.description.trim() || null,
      priority: form.priority as any,
      created_by: user.id,
      business_id: current?.id ?? null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    if (data && form.description.trim()) {
      await supabase.from("support_ticket_messages").insert({
        ticket_id: data.id, sender_id: user.id, sender_role: "customer",
        message: form.description.trim(),
      });
    }
    toast.success("Ticket created");
    setOpenNew(false);
    setForm({ subject: "", description: "", priority: "medium" });
    load();
    if (data) setSelectedId(data.id);
  };

  const sendReply = async () => {
    if (!selected || !user || !reply.trim()) return;
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "customer",
      message: reply.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setReply("");
    load();
  };

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to tickets
        </Button>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{selected.subject}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">#{selected.ticket_number}</div>
              </div>
              <div className="flex gap-2">
                <TicketStatusBadge status={selected.status} />
                <TicketPriorityBadge priority={selected.priority} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.sender_id === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                      {m.sender_role === "customer" ? "You" : m.sender_role === "admin" ? "Admin" : "Support"}
                    </div>
                    <div className="whitespace-pre-wrap">{m.message}</div>
                    <div className="text-[10px] opacity-60 mt-1">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">No messages yet</div>
              )}
            </div>
            {selected.status !== "closed" && (
              <div className="flex gap-2 items-end">
                <Textarea
                  placeholder="Type your reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="min-h-[70px]"
                />
                <Button onClick={sendReply} disabled={!reply.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6" /> Support
          </h1>
          <p className="text-sm text-muted-foreground">Get help from our team. We usually reply within a business day.</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create support ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Subject</Label>
                <Input value={form.subject} maxLength={200}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Describe your issue</Label>
                <Textarea rows={5} value={form.description} maxLength={5000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
              <Button onClick={createTicket} disabled={!form.subject.trim()}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No tickets yet. Create one to reach our team.
            </div>
          ) : (
            <div className="divide-y">
              {tickets.map((t) => (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                  className="w-full text-left p-4 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t.subject}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        #{t.ticket_number} · updated {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
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
