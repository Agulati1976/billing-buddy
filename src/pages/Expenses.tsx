import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/states";
import { format } from "date-fns";

const CATEGORIES = ["Rent", "Salary", "Utilities", "Travel", "Office Supplies", "Marketing", "Repairs", "Tax", "Other"];

interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  method: string;
  description: string | null;
}

export default function Expenses() {
  const { current } = useBusiness();
  const { user } = useAuth();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [category, setCategory] = useState("Rent");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [description, setDescription] = useState("");

  const load = async () => {
    if (!current) return;
    const { data } = await supabase.from("expenses")
      .select("id, category, amount, expense_date, method, description")
      .eq("business_id", current.id).order("expense_date", { ascending: false });
    setRows((data as any) ?? []);
  };
  useEffect(() => { load(); }, [current?.id]);

  const submit = async () => {
    if (!current || !user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const { error } = await supabase.from("expenses").insert({
      business_id: current.id, category, amount: amt, expense_date: date,
      method: method as any, description: description.trim() || null, created_by: user.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense recorded");
    setOpen(false); setAmount(""); setDescription("");
    load();
  };

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const byCat = rows.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + Number(r.amount);
      return acc;
    }, {} as Record<string, number>);
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    return { total, top, count: rows.length };
  }, [rows]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track every business expense</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total Expenses</div>
          <div className="text-2xl font-semibold mt-1 num text-danger">{formatINR(totals.total)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Entries</div>
          <div className="text-2xl font-semibold mt-1 num">{totals.count}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Top Category</div>
          <div className="text-2xl font-semibold mt-1">{totals.top?.[0] ?? "—"}</div>
          {totals.top && <div className="text-xs text-muted-foreground num">{formatINR(totals.top[1])}</div>}
        </Card>
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No expenses yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{format(new Date(r.expense_date), "dd MMM yyyy")}</TableCell>
                  <TableCell><span className="px-2 py-0.5 rounded bg-muted text-xs">{r.category}</span></TableCell>
                  <TableCell className="max-w-xs truncate">{r.description ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.method}</TableCell>
                  <TableCell className="text-right num font-medium">{formatINR(Number(r.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
