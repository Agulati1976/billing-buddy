import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Mail, Phone, MapPin, FileText, Wallet,
  AlertTriangle, BellRing, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";

interface Party {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  billing_address: string | null;
  state: string | null;
  state_code: string | null;
  opening_balance: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: string;
  type: string;
}

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  invoice_id: string | null;
  direction: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current } = useBusiness();
  const [party, setParty] = useState<Party | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState(false);

  const load = async () => {
    if (!current || !id) return;
    setLoading(true);
    const [pRes, iRes, payRes] = await Promise.all([
      supabase.from("parties").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("invoices")
        .select("id,invoice_number,invoice_date,due_date,total_amount,paid_amount,balance_amount,status,type")
        .eq("business_id", current.id)
        .eq("party_id", id)
        .order("invoice_date", { ascending: false }),
      supabase
        .from("payments")
        .select("id,payment_date,amount,method,reference,invoice_id,direction")
        .eq("business_id", current.id)
        .eq("party_id", id)
        .order("payment_date", { ascending: false }),
    ]);
    if (pRes.error) toast.error(pRes.error.message);
    setParty((pRes.data as Party) ?? null);
    setInvoices((iRes.data as InvoiceRow[]) ?? []);
    setPayments((payRes.data as PaymentRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [current?.id, id]);

  const stats = useMemo(() => {
    const sales = invoices.filter((i) => i.type === "sale");
    const totalSold = sales.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const totalPaid = sales.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const outstanding =
      sales.reduce((s, i) => s + Number(i.balance_amount || 0), 0) +
      Number(party?.opening_balance || 0);
    const today = todayISO();
    const overdue = sales.filter(
      (i) => i.balance_amount > 0 && i.due_date && i.due_date < today,
    );
    const overdueAmount = overdue.reduce((s, i) => s + Number(i.balance_amount || 0), 0);
    return { totalSold, totalPaid, outstanding, overdue, overdueAmount };
  }, [invoices, party]);

  const handleSendReminder = async () => {
    if (!party?.email) {
      toast.error("This customer has no email address on file.");
      return;
    }
    if (stats.overdue.length === 0) {
      toast.info("No overdue invoices to remind about.");
      return;
    }
    setSendingReminder(true);
    try {
      const { error } = await supabase.functions.invoke("send-payment-reminder", {
        body: {
          partyId: party.id,
          businessId: current?.id,
          invoiceIds: stats.overdue.map((i) => i.id),
        },
      });
      if (error) throw error;
      toast.success("Reminder queued. Email sending will activate once your domain is configured.");
    } catch (e: any) {
      toast.error(e.message || "Could not send reminder");
    } finally {
      setSendingReminder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading customer…
      </div>
    );
  }
  if (!party) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="p-8 text-center text-muted-foreground">Customer not found.</Card>
      </div>
    );
  }

  const isCustomer = party.type === "customer";
  const balanceLabel = isCustomer ? "Outstanding" : "Payable";

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(isCustomer ? "/customers" : "/suppliers")}
            className="gap-1.5 -ml-2 mb-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back to {isCustomer ? "customers" : "suppliers"}
          </Button>
          <h1 className="text-2xl font-semibold">{party.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {party.phone && (
              <a href={`tel:${party.phone}`} className="flex items-center gap-1 hover:text-primary">
                <Phone className="h-3.5 w-3.5" /> {party.phone}
              </a>
            )}
            {party.email && (
              <a href={`mailto:${party.email}`} className="flex items-center gap-1 hover:text-primary">
                <Mail className="h-3.5 w-3.5" /> {party.email}
              </a>
            )}
            {party.gstin && (
              <span className="flex items-center gap-1">
                <Badge variant="secondary" className="font-mono text-xs">{party.gstin}</Badge>
              </span>
            )}
            {party.billing_address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {party.billing_address}
              </span>
            )}
          </div>
        </div>
        {isCustomer && stats.overdue.length > 0 && (
          <Button onClick={handleSendReminder} disabled={sendingReminder} className="gap-1.5">
            {sendingReminder ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            Send payment reminder
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total {isCustomer ? "Sales" : "Purchases"}</div>
          <div className="text-2xl font-semibold num mt-1">{formatINR(stats.totalSold)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Paid</div>
          <div className="text-2xl font-semibold num mt-1 text-green-600 dark:text-green-500">
            {formatINR(stats.totalPaid)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{balanceLabel}</div>
          <div className="text-2xl font-semibold num mt-1">{formatINR(stats.outstanding)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Overdue
          </div>
          <div className="text-2xl font-semibold num mt-1 text-destructive">
            {formatINR(stats.overdueAmount)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {stats.overdue.length} invoice{stats.overdue.length === 1 ? "" : "s"}
          </div>
        </Card>
      </div>

      {/* Invoices */}
      <Card>
        <div className="p-4 border-b flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Invoice history</h2>
          <Badge variant="secondary" className="ml-1">{invoices.length}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  No invoices yet.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => {
                const overdue = inv.balance_amount > 0 && inv.due_date && inv.due_date < todayISO();
                const route =
                  inv.type === "purchase" ? "/purchases" :
                  inv.type === "quotation" ? "/quotations" : "/sales";
                return (
                  <TableRow key={inv.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link to={`${route}/${inv.id}`} className="font-medium text-primary hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{inv.invoice_date}</TableCell>
                    <TableCell className="text-sm capitalize">{inv.type.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : overdue ? "destructive" : "secondary"}>
                        {overdue ? "overdue" : inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right num">{formatINR(Number(inv.total_amount))}</TableCell>
                    <TableCell className="text-right num font-medium">
                      {formatINR(Number(inv.balance_amount))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Payments */}
      <Card>
        <div className="p-4 border-b flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Payment history</h2>
          <Badge variant="secondary" className="ml-1">{payments.length}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No payments recorded.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/40">
                  <TableCell className="text-sm">{p.payment_date}</TableCell>
                  <TableCell className="text-sm capitalize">{p.direction.replace("_", " ")}</TableCell>
                  <TableCell className="text-sm capitalize">{p.method}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.reference || "—"}</TableCell>
                  <TableCell className="text-right num font-medium">{formatINR(Number(p.amount))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
