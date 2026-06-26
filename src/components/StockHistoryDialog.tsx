import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, History } from "lucide-react";
import { toast } from "sonner";
import type { ItemRow } from "@/components/ItemDialog";

type Movement = {
  id: string;
  type: string;
  quantity: number;
  notes: string | null;
  reference_id: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  opening: "Opening",
  purchase: "Purchase",
  sale: "Sale",
  sale_return: "Sale Return",
  purchase_return: "Purchase Return",
  adjustment_in: "Adjustment +",
  adjustment_out: "Adjustment −",
  damage: "Damage",
  transfer: "Transfer",
};

const IN_TYPES = new Set(["opening", "purchase", "adjustment_in", "sale_return"]);

export function StockHistoryDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ItemRow | null;
}) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, notes, reference_id, created_at")
        .eq("item_id", item.id)
        .order("created_at", { ascending: true });
      if (error) toast.error(error.message);
      else setRows((data ?? []) as Movement[]);
      setLoading(false);
    })();
  }, [open, item?.id]);

  // Reverse for display (newest first) but compute running balance forward
  const withBalance = useMemo(() => {
    let bal = 0;
    const fwd = rows.map((r) => {
      const signed = IN_TYPES.has(r.type) ? Number(r.quantity) : -Number(r.quantity);
      bal += signed;
      return { ...r, signed, balance: bal };
    });
    return [...fwd].reverse();
  }, [rows]);

  const exportCSV = () => {
    if (!item) return;
    const header = ["Date", "Type", "Change", "Balance", "Notes"];
    const lines = [...withBalance].reverse().map((r) =>
      [
        new Date(r.created_at).toLocaleString(),
        TYPE_LABEL[r.type] ?? r.type,
        (r.signed > 0 ? "+" : "") + r.signed,
        r.balance,
        (r.notes ?? "").replace(/[\r\n,]/g, " "),
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-history-${item.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Stock History
          </DialogTitle>
          <DialogDescription>
            {item ? `${item.name} — current stock: ${item.current_stock} ${item.unit}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={withBalance.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Balance After</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : withBalance.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No stock movements yet.</TableCell></TableRow>
            ) : withBalance.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={r.signed >= 0 ? "secondary" : "destructive"} className="text-[10px]">
                    {TYPE_LABEL[r.type] ?? r.type}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right tabular-nums font-medium ${r.signed >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {r.signed > 0 ? "+" : ""}{r.signed} {item?.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.balance} {item?.unit}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">{r.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
