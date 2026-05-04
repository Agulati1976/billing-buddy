import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/SearchBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FileText, Trash2, Eye } from "lucide-react";
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
}

export default function Invoices({ type }: Props) {
  const { current } = useBusiness();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const meta = INVOICE_TYPE_META[type];

  const load = async () => {
    if (!current) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, paid_amount, balance_amount, status, party_id, parties(name)")
      .eq("business_id", current.id)
      .eq("type", type)
      .order("invoice_date", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, [current?.id, type]);

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
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{meta.label}s</h1>
          <p className="text-sm text-muted-foreground">{totals.count} entries · {formatINR(totals.total)} total</p>
        </div>
        <Button onClick={() => navigate(`/${type}s/new`)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New {meta.label}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total {meta.label}s</div>
          <div className="text-2xl font-semibold mt-1 num">{totals.count}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total Amount</div>
          <div className="text-2xl font-semibold mt-1 num">{formatINR(totals.total)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Balance Due</div>
          <div className="text-2xl font-semibold mt-1 num text-danger">{formatINR(totals.balance)}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between mb-4">
          <div className="max-w-sm flex-1 min-w-[220px]">
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
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/${type}s/${r.id}`)}>
                    <TableCell className="font-medium">{r.invoice_number}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(r.invoice_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{r.parties?.name ?? "—"}</TableCell>
                    <TableCell className="text-right num">{formatINR(Number(r.total_amount))}</TableCell>
                    <TableCell className="text-right num">{formatINR(Number(r.balance_amount))}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded ${st.classes}`}>{st.label}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/${type}s/${r.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
