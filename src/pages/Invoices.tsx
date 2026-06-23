import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { omDelete, omInsert } from "@/lib/offlineMutate";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SearchBar } from "@/components/SearchBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FileText, Trash2, Eye, Undo2, RotateCcw } from "lucide-react";
import { formatINR } from "@/lib/states";
import { INVOICE_TYPE_META, STATUS_META, type InvoiceType } from "@/lib/invoice";
import { toast } from "sonner";
import { format, startOfMonth } from "date-fns";
import { DateRangeFilter, rangeFor, useDateFilter, type DatePreset } from "@/components/DateRangeFilter";

interface Props {
  type: InvoiceType;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: keyof typeof STATUS_META;
  party_id: string | null;
  parties: { name: string } | null;
  deleted_at: string | null;
}

export default function Invoices({ type }: Props) {
  const { current } = useBusiness();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [payRow, setPayRow] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [paySaving, setPaySaving] = useState(false);

  const canPay = type === "sale" || type === "purchase" || type === "non_inventory";

  const openPay = (r: InvoiceRow, full: boolean) => {
    setPayRow(r);
    setPayAmount(full ? String(Number(r.balance_amount || 0).toFixed(2)) : "");
    setPayMethod("cash");
  };

  const submitPay = async () => {
    if (!payRow || !current || !user) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setPaySaving(true);
    const res = await omInsert("payments", {
      business_id: current.id,
      direction: (type === "sale" || type === "non_inventory") ? "in" : "out",
      method: payMethod as any,
      amount: amt,
      payment_date: new Date().toISOString().slice(0, 10),
      party_id: payRow.party_id,
      invoice_id: payRow.id,
      created_by: user.id,
    });
    setPaySaving(false);
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    toast.success(res.queued ? "Saved offline — will sync" : "Payment recorded");
    setPayRow(null);
    load();
  };

  const meta = INVOICE_TYPE_META[type];
  const [view, setView] = useState<"active" | "trash">("active");

  const load = async () => {
    if (!current) return;
    setLoading(true);
    let query = supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, paid_amount, balance_amount, status, party_id, parties(name), deleted_at")
      .eq("business_id", current.id)
      .eq("type", type);
    if (view === "active") {
      query = query.is("deleted_at", null).order("invoice_date", { ascending: false });
    } else {
      const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      query = query.not("deleted_at", "is", null).gte("deleted_at", cutoff).order("deleted_at", { ascending: false });
    }
    const { data, error } = await query;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, [current?.id, type, view]);

  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const range = useMemo(() => rangeFor(preset, { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const dateFiltered = useDateFilter(rows, (r) => r.invoice_date, range);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return dateFiltered;
    return dateFiltered.filter((r) =>
      r.invoice_number.toLowerCase().includes(s) ||
      r.parties?.name?.toLowerCase().includes(s)
    );
  }, [dateFiltered, q]);

  const totals = useMemo(() => {
    const total = dateFiltered.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const balance = dateFiltered.reduce((s, r) => s + Number(r.balance_amount || 0), 0);
    return { total, balance, count: dateFiltered.length };
  }, [dateFiltered]);

  const remove = async (id: string) => {
    if (!confirm("Move this invoice to Deleted? You can recover it within 180 days.")) return;
    const now = new Date().toISOString();
    const { error: e1 } = await supabase.from("invoices").update({ deleted_at: now }).eq("id", id);
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("payments").update({ deleted_at: now }).eq("invoice_id", id).is("deleted_at", null);
    toast.success("Moved to Deleted");
    load();
  };

  const restore = async (id: string) => {
    const { error: e1 } = await supabase.from("invoices").update({ deleted_at: null }).eq("id", id);
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("payments").update({ deleted_at: null }).eq("invoice_id", id);
    toast.success("Invoice restored");
    load();
  };

  const purge = async (id: string) => {
    if (!confirm("Permanently delete this invoice? This cannot be undone.")) return;
    await supabase.from("payments").delete().eq("invoice_id", id);
    const res = await omDelete("invoices", { column: "id", value: id });
    if (res.error) { toast.error((res.error as any).message ?? "Failed"); return; }
    toast.success("Permanently deleted");
    load();
  };

  const daysLeft = (deletedAt: string | null) => {
    if (!deletedAt) return 0;
    const ms = new Date(deletedAt).getTime() + 180 * 24 * 60 * 60 * 1000 - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold truncate">{meta.label}s</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{totals.count} entries · {formatINR(totals.total)} total</p>
        </div>
        <Button onClick={() => navigate(`/${meta.route}/new`)} size="sm" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> <span className="hidden xs:inline sm:inline">New</span>
        </Button>
      </div>

      {/* KPI cards: horizontal scroll on mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-3 sm:p-5">
          <div className="text-[11px] sm:text-sm text-muted-foreground">Entries</div>
          <div className="text-base sm:text-2xl font-semibold mt-0.5 sm:mt-1 num">{totals.count}</div>
        </Card>
        <Card className="p-3 sm:p-5">
          <div className="text-[11px] sm:text-sm text-muted-foreground">Total</div>
          <div className="text-base sm:text-2xl font-semibold mt-0.5 sm:mt-1 num truncate">{formatINR(totals.total)}</div>
        </Card>
        <Card className="p-3 sm:p-5">
          <div className="text-[11px] sm:text-sm text-muted-foreground">Balance</div>
          <div className="text-base sm:text-2xl font-semibold mt-0.5 sm:mt-1 num text-danger truncate">{formatINR(totals.balance)}</div>
        </Card>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setView("active")}
          className={`text-sm px-3 py-1.5 rounded-md border ${view === "active" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
        >Active</button>
        <button
          onClick={() => setView("trash")}
          className={`text-sm px-3 py-1.5 rounded-md border ${view === "trash" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
        >Deleted</button>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-between mb-3 sm:mb-4">
          <div className="flex-1 min-w-[180px]">
            <SearchBar value={q} onChange={setQ} placeholder="Search number or party…" />
          </div>
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customFrom={customFrom} customTo={customTo} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} />
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No {meta.label.toLowerCase()}s yet</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="sm:hidden space-y-2">
              {filtered.map((r) => {
                const st = STATUS_META[r.status];
                return (
                <div key={r.id} className="mobile-card flex items-center gap-3">
                    <button
                      onClick={() => navigate(`/${meta.route}/${r.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{r.invoice_number}</span>
                        {view === "active" && canPay && r.status !== "paid" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className={`text-[10px] px-1.5 py-0.5 rounded ${st.classes}`}>{st.label} ▾</button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => openPay(r, true)}>Mark fully paid</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openPay(r, false)}>Partial payment…</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.classes}`}>{st.label}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{r.parties?.name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(r.invoice_date), "dd MMM yyyy")}
                        {view === "trash" && r.deleted_at && (
                          <span className="ml-2 text-danger">· {daysLeft(r.deleted_at)}d left</span>
                        )}
                      </div>
                    </button>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold num">{formatINR(Number(r.total_amount))}</div>
                      {Number(r.balance_amount) > 0 && (
                        <div className="text-[11px] text-danger num">Bal {formatINR(Number(r.balance_amount))}</div>
                      )}
                      {view === "trash" && (
                        <div className="flex gap-1 justify-end mt-1">
                          <Button size="icon" variant="ghost" onClick={() => restore(r.id)} title="Restore">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => purge(r.id)} title="Delete forever">
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = STATUS_META[r.status];
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/${meta.route}/${r.id}`)}>
                        <TableCell className="font-medium">{r.invoice_number}</TableCell>
                        <TableCell className="text-muted-foreground">{format(new Date(r.invoice_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>{r.parties?.name ?? "—"}</TableCell>
                        <TableCell className="text-right num">{formatINR(Number(r.total_amount))}</TableCell>
                        <TableCell className="text-right num">{formatINR(Number(r.balance_amount))}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {view === "active" && canPay && r.status !== "paid" ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className={`text-xs px-2 py-0.5 rounded ${st.classes}`}>{st.label} ▾</button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => openPay(r, true)}>Mark fully paid</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openPay(r, false)}>Partial payment…</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded ${st.classes}`}>{st.label}</span>
                          )}
                          {view === "trash" && r.deleted_at && (
                            <div className="text-[11px] text-muted-foreground mt-1">{daysLeft(r.deleted_at)}d left</div>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            {view === "active" ? (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => navigate(`/${meta.route}/${r.id}`)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {type === "sale" && (
                                  <Button size="icon" variant="ghost" title="Create sale return"
                                    onClick={() => navigate(`/sale_returns/new?from=${r.id}`)}>
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                                  <Trash2 className="h-4 w-4 text-danger" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => restore(r.id)} title="Restore">
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => purge(r.id)} title="Delete forever">
                                  <Trash2 className="h-4 w-4 text-danger" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Dialog open={!!payRow} onOpenChange={(o) => !o && setPayRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment {payRow ? `· ${payRow.invoice_number}` : ""}</DialogTitle>
          </DialogHeader>
          {payRow && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Total {formatINR(Number(payRow.total_amount))} · Balance{" "}
                <span className="text-danger font-medium">{formatINR(Number(payRow.balance_amount))}</span>
              </div>
              <div className="grid gap-2">
                <Label>Amount</Label>
                <Input type="number" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={paySaving}>{paySaving ? "Saving…" : "Record payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
