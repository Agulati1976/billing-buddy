import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupportStaff } from "@/hooks/useSupportStaff";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/support/TicketBadges";
import { TicketDetail } from "@/components/support/TicketDetail";
import { formatDistanceToNow } from "date-fns";
import { LifeBuoy, LogOut, Search } from "lucide-react";

type Ticket = {
  id: string; ticket_number: string; subject: string; status: string; priority: string;
  last_message_at: string; assigned_to: string | null; created_by: string; business_id: string | null;
};

export default function SupportAgent() {
  const { user, loading, signOut } = useAuth();
  const { isSupportStaff, loading: sLoading } = useSupportStaff();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("support_tickets").select("*")
      .eq("assigned_to", user.id)
      .order("last_message_at", { ascending: false });
    const list = (data ?? []) as Ticket[];
    setTickets(list);
    const ids = Array.from(new Set(list.map((t) => t.created_by)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles")
        .select("user_id,full_name,email").in("user_id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => map[p.user_id] = p.full_name || p.email || "Customer");
      setCustomers(map);
    }
  };

  useEffect(() => { if (user) load(); }, [user?.id]);

  if (loading || sLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSupportStaff) return <Navigate to="/" replace />;

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (q && !(t.subject.toLowerCase().includes(q.toLowerCase()) || t.ticket_number.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <LifeBuoy className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">Bill Look Support</div>
              <div className="text-[11px] text-muted-foreground">Agent portal</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        {selectedId ? (
          <TicketDetail ticketId={selectedId} onBack={() => { setSelectedId(null); load(); }}
            senderRole="staff" showStatus />
        ) : (
          <>
            <div>
              <h1 className="text-xl font-bold">My tickets</h1>
              <p className="text-sm text-muted-foreground">Tickets assigned to you by admin.</p>
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="in_progress">In progress</TabsTrigger>
                <TabsTrigger value="waiting_customer">Waiting</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <Card>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No tickets assigned</div>
                ) : (
                  <div className="divide-y">
                    {filtered.map((t) => (
                      <button key={t.id} onClick={() => setSelectedId(t.id)}
                        className="w-full text-left p-4 hover:bg-muted/40 transition-colors">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{t.subject}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              #{t.ticket_number} · {customers[t.created_by] ?? "Customer"} · {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
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
          </>
        )}
      </main>
    </div>
  );
}
