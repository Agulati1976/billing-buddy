import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Store, Users, Receipt, IndianRupee } from "lucide-react";

export default function AdminOverview() {
  const [stats, setStats] = useState({ businesses: 0, users: 0, invoices: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [b, u, i, rev] = await Promise.all([
        supabase.from("businesses").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("type", "sale"),
        supabase.from("invoices").select("total_amount").eq("type", "sale"),
      ]);
      const revenue = (rev.data ?? []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
      setStats({
        businesses: b.count ?? 0,
        users: u.count ?? 0,
        invoices: i.count ?? 0,
        revenue,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "Shopkeepers (Businesses)", value: stats.businesses, icon: Store },
    { label: "Registered Users", value: stats.users, icon: Users },
    { label: "Total Sales Invoices", value: stats.invoices, icon: Receipt },
    { label: "Gross Sales", value: `₹${stats.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: IndianRupee },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">Across every shopkeeper using the app.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {loading ? "…" : c.value}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
