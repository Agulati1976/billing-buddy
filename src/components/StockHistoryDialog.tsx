import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, History, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { ItemRow } from "@/components/ItemDialog";
import { fetchInvoiceLinksForReferenceIds, invoiceViewRoute, type StockMovementInvoiceLink } from "@/lib/stockMovementLinks";
import { INVOICE_TYPE_META } from "@/lib/invoice";

type Movement = {
  id: string;
  type: string;
  quantity: number;
  notes: string | null;
  reference_id: string | null;
  batch_id: string | null;
  created_at: string;
  batches?: { batch_number: string } | null;
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
  const [links, setLinks] = useState<Map<string, StockMovementInvoiceLink>>(new Map());
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !item) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, notes, reference_id, batch_id, created_at, batches(batch_number)")
        .eq("item_id", item.id)
        .order("created_at", { ascending: true });
      if (error) toast.error(error.message);
      else setRows((data ?? []) as any as Movement[]);
      const refIds = ((data ?? []) as any[]).map((r) => r.reference_id).filter(Boolean);
      setLinks(await fetchInvoiceLinksForReferenceIds(refIds));
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
              <TableHead>Batch</TableHead>
              <TableHead>Invoice / Bill</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : withBalance.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No stock movements yet.</TableCell></TableRow>
            ) : withBalance.map((r) => {
              const link = r.reference_id ? links.get(r.reference_id) : undefined;
              const route = link ? invoiceViewRoute(link.type, link.invoiceId) : null;
              return (
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
                  <TableCell className="text-xs text-muted-foreground">{r.batches?.batch_number ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {link ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{INVOICE_TYPE_META[link.type]?.label ?? link.type}</span>
                        <span className="font-medium">{link.invoiceNumber}</span>
                        {route && (
                          <Button
                            size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                            title="View bill"
                            onClick={() => { onOpenChange(false); navigate(route); }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{r.notes ?? "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
