import { supabase } from "@/integrations/supabase/client";
import { allRows } from "./pagination";
export async function invoiceCostLines(invoiceIds:string[]){
  const rows=[];
  for(let offset=0;offset<invoiceIds.length;offset+=100){
    const {data,error}=await allRows(supabase.from("invoice_items").select("invoice_id,item_name,quantity,total_amount,taxable_amount,tax_rate,unit_cost,cost_is_estimate").in("invoice_id",invoiceIds.slice(offset,offset+100)));
    if(error)throw error;
    rows.push(...(data??[]));
  }
  return rows;
}
