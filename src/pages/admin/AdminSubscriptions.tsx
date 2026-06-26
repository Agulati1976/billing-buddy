import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, IndianRupee, Users, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface Row {
  id: string;
  business_id: string;
  business_name?: string;
  plan_name?: string;
  status: string;
  expires_at: string | null;
  started_at: string;
}

interface Order {
  id: string;
  cf_order_id: string;
  business_id: string;
  business_name?: string;
  order_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [sRes, oRes, bRes, pRes] = await Promise.all([
        supabase.from("business_subscriptions").select("*"),
        supabase.from("subscription_orders").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("businesses").select("id, name"),
        supabase.from("subscription_plans").select("id, name"),
      ]);
      const bMap = new Map((bRes.data || []).map((b: any) => [b.id, b.name]));
      const pMap = new Map((pRes.data || []).map((p: any) => [p.id, p.name]));
      setSubs(((sRes.data as any[]) || []).map((s) => ({
        ...s, business_name: bMap.get(s.business_id), plan_name: pMap.get(s.plan_id),
      })));
      setOrders(((oRes.data as any[]) || []).map((o) => ({
        ...o, business_name: bMap.get(o.business_id),
      })));
      setLoading(false);
    })();
  }, []);

  const paid = orders.filter((o) => o.status === "PAID");
  const revenue = paid.reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const mrr = paid
    .filter((o) => o.paid_at && new Date(o.paid_at).getTime() > Date.now() - 30 * 86400000)
    .reduce((s, o) => s + Number(o.order_amount || 0), 0);
  const activeCount = subs.filter((s) => s.status === "active" && s.expires_at && new Date(s.expires_at) > new Date()).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <p className="text-muted-foreground">Cashfree subscription overview</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Total Revenue</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">₹{revenue.toLocaleString("en-IN")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">MRR (last 30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">₹{mrr.toLocaleString("en-IN")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Active Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Active Subscriptions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.business_name || s.business_id.slice(0, 8)}</TableCell>
                  <TableCell>{s.plan_name || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                  <TableCell>{format(new Date(s.started_at), "dd MMM yyyy")}</TableCell>
                  <TableCell>{s.expires_at ? format(new Date(s.expires_at), "dd MMM yyyy") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>CF Order ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{format(new Date(o.created_at), "dd MMM, HH:mm")}</TableCell>
                  <TableCell>{o.business_name || o.business_id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs">{o.cf_order_id}</TableCell>
                  <TableCell>₹{Number(o.order_amount).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      o.status === "PAID" ? "bg-green-500/15 text-green-700"
                      : o.status === "FAILED" ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                    }>{o.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
