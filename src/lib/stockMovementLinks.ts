import { allRows } from "@/lib/pagination";
// Resolve immutable invoice IDs, with a fallback for historical line references.
import { supabase } from "@/integrations/supabase/client";
import { INVOICE_TYPE_META, type InvoiceType } from "@/lib/invoice";

export interface StockMovementInvoiceLink {
  invoiceId: string;
  invoiceNumber: string;
  type: InvoiceType;
}

// Only these invoice types have an editor route with :id in App.tsx.
const ROUTABLE_TYPES = new Set<InvoiceType>(["sale", "purchase", "sale_return", "quotation", "non_inventory"]);

export async function fetchInvoiceLinksForMovements(
  movements: {id:string;reference_id:string|null;invoice_id:string|null}[]
): Promise<Map<string, StockMovementInvoiceLink>> {
  const map=new Map<string,StockMovementInvoiceLink>();
  const references=Array.from(new Set(movements.filter(row=>!row.invoice_id&&row.reference_id).map(row=>row.reference_id!)));
  const byReference=new Map<string,string>();
  for(let offset=0;offset<references.length;offset+=100){
    const {data,error}=await allRows(supabase.from("invoice_items").select("id,invoice_id").in("id",references.slice(offset,offset+100)));
    if(error)throw error;
    for(const row of data??[])byReference.set(row.id,row.invoice_id);
  }
  const resolved=movements.map(row=>({movement:row.id,invoice:row.invoice_id??byReference.get(row.reference_id??"")}));
  const ids=Array.from(new Set(resolved.map(row=>row.invoice).filter((id):id is string=>!!id)));
  const invoices=new Map<string,StockMovementInvoiceLink>();
  for(let offset=0;offset<ids.length;offset+=100){
    const {data,error}=await allRows(supabase.from("invoices").select("id,invoice_number,type").in("id",ids.slice(offset,offset+100)));
    if(error)throw error;
    for(const row of data??[])invoices.set(row.id,{invoiceId:row.id,invoiceNumber:row.invoice_number,type:row.type});
  }
  for(const row of resolved){const invoice=row.invoice?invoices.get(row.invoice):undefined;if(invoice)map.set(row.movement,invoice);}
  return map;
}

/** Route to view/edit an invoice, or null if that type has no editor page. */
export function invoiceViewRoute(type: InvoiceType, invoiceId: string): string | null {
  if (!ROUTABLE_TYPES.has(type)) return null;
  return `/${INVOICE_TYPE_META[type].route}/${invoiceId}`;
}
