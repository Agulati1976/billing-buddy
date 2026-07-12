import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/support/TicketBadges";
import { toast } from "sonner";
import { Send, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Ticket = {
  id: string; ticket_number: string; subject: string; description: string | null;
  status: string; priority: string; created_at: string; last_message_at: string;
  assigned_to: string | null; created_by: string; business_id: string | null;
};
type Message = {
  id: string; message: string; sender_role: string; sender_id: string; created_at: string;
};
type StaffOption = { user_id: string; full_name: string | null; email: string | null };

export function TicketDetail({
  ticketId, onBack, senderRole, showAssign, showStatus,
}: {
  ticketId: string;
  onBack: () => void;
  senderRole: "admin" | "staff";
  showAssign?: boolean;
  showStatus?: boolean;
}) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [customerName, setCustomerName] = useState<string>("");

  const loadTicket = async () => {
    const { data } = await supabase.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
    setTicket(data as Ticket | null);
    if (data?.created_by) {
      const { data: prof } = await supabase.from("profiles")
        .select("full_name,email").eq("user_id", data.created_by).maybeSingle();
      setCustomerName(prof?.full_name || prof?.email || "Customer");
    }
  };

  useEffect(() => {
    loadTicket();
    supabase.from("support_ticket_messages").select("*")
      .eq("ticket_id", ticketId).order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data ?? []) as Message[]));

    if (showAssign) {
      supabase.from("support_staff").select("user_id,full_name,email").eq("active", true)
        .then(({ data }) => setStaff((data ?? []) as StaffOption[]));
    }

    const channel = supabase.channel(`ticket-detail-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` },
        () => loadTicket())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const sendReply = async () => {
    if (!ticket || !user || !reply.trim()) return;
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id, sender_id: user.id, sender_role: senderRole,
      message: reply.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setReply("");
  };

  const updateStatus = async (status: string) => {
    if (!ticket) return;
    const { error } = await supabase.from("support_tickets").update({ status: status as any }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
  };

  const updatePriority = async (priority: string) => {
    if (!ticket) return;
    const { error } = await supabase.from("support_tickets").update({ priority: priority as any }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
  };

  const assign = async (userId: string) => {
    if (!ticket) return;
    const val = userId === "__none__" ? null : userId;
    const { error } = await supabase.from("support_tickets").update({ assigned_to: val }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Ticket assigned");
  };

  if (!ticket) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back
      </Button>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg">{ticket.subject}</CardTitle>
              <div className="text-xs text-muted-foreground mt-1">
                #{ticket.ticket_number} · from {customerName}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(showAssign || showStatus) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b">
              {showStatus && (
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={ticket.status} onValueChange={updateStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="waiting_customer">Waiting customer</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showAssign && (
                <>
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select value={ticket.priority} onValueChange={updatePriority}>
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
                    <Label className="text-xs">Assign to</Label>
                    <Select value={ticket.assigned_to ?? "__none__"} onValueChange={assign}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.user_id} value={s.user_id}>
                            {s.full_name || s.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.sender_id === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                    {m.sender_role === "customer" ? "Customer" : m.sender_role === "admin" ? "Admin" : "Support"}
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

          {ticket.status !== "closed" && (
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="Type your reply to the customer…"
                value={reply} onChange={(e) => setReply(e.target.value)}
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
