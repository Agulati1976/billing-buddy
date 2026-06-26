import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { load } from "@cashfreepayments/cashfree-js";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Loader2, Sparkles, ShieldCheck, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Plan {
  id: string; code: string; name: string; description: string | null;
  price_inr: number; duration_days: number; features: string[]; sort_order: number;
}
interface Subscription {
  plan_id: string | null; status: string; started_at: string;
  expires_at: string | null;
}
interface Order {
  id: string; cf_order_id: string; order_amount: number; status: string;
  payment_method: string | null; paid_at: string | null; created_at: string;
  plan_id: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PAID: "bg-green-500/15 text-green-700",
  CREATED: "bg-amber-500/15 text-amber-700",
  FAILED: "bg-destructive/15 text-destructive",
  DROPPED: "bg-muted text-muted-foreground",
};

const getFunctionErrorMessage = async (error: any, fallback = "Payment failed to start") => {
  const response = error?.context;
  if (response?.clone) {
    try {
      const payload = await response.clone().json();
      return payload?.hint || payload?.error || payload?.details?.message || error?.message || fallback;
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch {
        // keep fallback below
      }
    }
  }
  return error?.message || fallback;
};

export default function Billing() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<boolean>(() => localStorage.getItem("cf_test_mode") === "1");

  const loadAll = async () => {
    if (!current) return;
    setLoading(true);
    const [pRes, sRes, oRes] = await Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("business_subscriptions").select("*").eq("business_id", current.id).maybeSingle(),
      supabase.from("subscription_orders").select("*").eq("business_id", current.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (pRes.data) setPlans(pRes.data as any);
    if (sRes.data) setSubscription(sRes.data as any);
    if (oRes.data) setOrders(oRes.data as any);
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [current?.id]);

  // After return from Cashfree redirect
  useEffect(() => {
    const orderId = params.get("order_id");
    if (!orderId || !current) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("cashfree-verify-order", {
          body: { cf_order_id: orderId },
        });
        if (error) {
          toast.error(await getFunctionErrorMessage(error, "Unable to verify payment"));
          return;
        }
        if (data?.status === "PAID") {
          toast.success("Payment successful! Your plan is now active.");
        } else if (data?.status === "ACTIVE") {
          toast.info("Payment is being processed.");
        } else {
          toast.info(`Order status: ${data?.status || "unknown"}`);
        }
      } finally {
        params.delete("order_id");
        setParams(params, { replace: true });
        loadAll();
      }
    })();
    // eslint-disable-next-line
  }, [params, current?.id]);

  const handleSubscribe = async (plan: Plan) => {
    if (!current) return;
    if (Number(plan.price_inr) <= 0) {
      toast.info("Free plan is active by default.");
      return;
    }
    setPaying(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("cashfree-create-order", {
        body: {
          business_id: current.id,
          plan_id: plan.id,
          customer_name: current.name,
          customer_email: current.email || user?.email,
          customer_phone: current.phone || "9999999999",
          return_url: `${window.location.origin}/billing?order_id={order_id}`,
        },
      });
      if (error) {
        toast.error(await getFunctionErrorMessage(error));
        return;
      }
      if (!data?.payment_session_id) throw new Error(data?.error || "Failed to create order");

      const cashfree = await load({ mode: "production" });
      await cashfree.checkout({
        paymentSessionId: data.payment_session_id,
        redirectTarget: "_self",
      });
    } catch (e: any) {
      toast.error(e?.message || "Payment failed to start");
    } finally {
      setPaying(null);
    }
  };

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id);
  const isFreePlan = !currentPlan || currentPlan.code === "FREE";
  const daysLeft = subscription?.expires_at
    ? Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000)
    : null;
  const isExpiringSoon = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 && !isFreePlan;
  const isExpired = daysLeft !== null && daysLeft < 0;

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold">Billing & Plans</h1>
        <p className="text-muted-foreground">Manage your Bill Look subscription</p>
      </div>

      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                {currentPlan ? currentPlan.name : "Free"} plan
              </CardDescription>
            </div>
            {isExpired ? (
              <Badge variant="destructive">Expired</Badge>
            ) : isExpiringSoon ? (
              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">
                Expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
              </Badge>
            ) : !isFreePlan ? (
              <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/20">Active</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Plan</div>
            <div className="font-medium text-base">{currentPlan?.name || "Free"}</div>
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Valid until
            </div>
            <div className="font-medium text-base">
              {subscription?.expires_at && !isFreePlan
                ? format(new Date(subscription.expires_at), "dd MMM yyyy")
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Days remaining</div>
            <div className="font-medium text-base">
              {isFreePlan ? "Unlimited" : daysLeft !== null ? `${Math.max(0, daysLeft)} days` : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans grid */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Choose a plan</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = subscription?.plan_id === plan.id && !isExpired;
              const isHighlight = plan.code === "PRO";
              return (
                <Card key={plan.id} className={isHighlight ? "border-primary shadow-lg relative" : ""}>
                  {isHighlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Recommended
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">₹{Number(plan.price_inr).toLocaleString("en-IN")}</span>
                      {Number(plan.price_inr) > 0 && (
                        <span className="text-muted-foreground"> /{plan.duration_days} days</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2 text-sm">
                      {(Array.isArray(plan.features) ? plan.features : []).map((f, i) => (
                        <li key={i} className="flex gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={isCurrent ? "secondary" : isHighlight ? "default" : "outline"}
                      disabled={isCurrent || paying === plan.id || Number(plan.price_inr) <= 0}
                      onClick={() => handleSubscribe(plan)}
                    >
                      {paying === plan.id ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting...</>
                      ) : isCurrent ? "Current Plan"
                        : Number(plan.price_inr) <= 0 ? "Free"
                        : subscription?.plan_id === plan.id ? "Renew" : "Upgrade"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{format(new Date(o.created_at), "dd MMM yyyy, HH:mm")}</TableCell>
                    <TableCell className="font-mono text-xs">{o.cf_order_id}</TableCell>
                    <TableCell>₹{Number(o.order_amount).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="capitalize">{o.payment_method || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLOR[o.status] || ""}>
                        {o.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
