// Resolves stock_movements.reference_id (an invoice_items.id) back to the invoice
// that caused the movement, so Stock History can show "Invoice #..." and link to it.
// reference_id has no FK (invoice_items rows get replaced on every invoice edit, and a
// hard FK would null the link out on that replace) so this is a manual two-step lookup.
import { supabase } from "@/integrations/supabase/client";
import { INVOICE_TYPE_META, type InvoiceType } from "@/lib/invoice";

export interface StockMovementInvoiceLink {
  invoiceId: string;
  invoiceNumber: string;
  type: InvoiceType;
}

// Only these invoice types have an editor route with :id in App.tsx.
const ROUTABLE_TYPES = new Set<InvoiceType>(["sale", "purchase", "sale_return", "quotation", "non_inventory"]);

export async function fetchInvoiceLinksForReferenceIds(
  referenceIds: string[]
): Promise<Map<string, StockMovementInvoiceLink>> {
  const ids = Array.from(new Set(referenceIds.filter(Boolean)));
  const map = new Map<string, StockMovementInvoiceLink>();
  if (ids.length === 0) return map;

  const { data: liRows } = await supabase.from("invoice_items").select("id, invoice_id").in("id", ids);
  const invoiceIds = Array.from(new Set(((liRows ?? []) as any[]).map((r) => r.invoice_id).filter(Boolean)));
  if (invoiceIds.length === 0) return map;

  const { data: invRows } = await supabase
    .from("invoices")
    .select("id, invoice_number, type")
    .in("id", invoiceIds);
  const invoiceById = new Map<string, { invoice_number: string; type: InvoiceType }>(
    ((invRows ?? []) as any[]).map((r) => [r.id, { invoice_number: r.invoice_number, type: r.type }])
  );

  for (const li of (liRows ?? []) as any[]) {
    const inv = invoiceById.get(li.invoice_id);
    if (!inv) continue;
    map.set(li.id, { invoiceId: li.invoice_id, invoiceNumber: inv.invoice_number, type: inv.type });
  }
  return map;
}

/** Route to view/edit an invoice, or null if that type has no editor page. */
export function invoiceViewRoute(type: InvoiceType, invoiceId: string): string | null {
  if (!ROUTABLE_TYPES.has(type)) return null;
  return `/${INVOICE_TYPE_META[type].route}/${invoiceId}`;
}
