import { round2 } from "./invoice";
export type FinancialInvoice={id:string;type:string;subtotal:number;discount_amount?:number;cgst_amount?:number;sgst_amount?:number;igst_amount?:number};
export type CostLine={invoice_id:string;quantity:number;unit_cost:number|null;cost_is_estimate?:boolean};
export const taxableBase=(invoice:FinancialInvoice)=>round2(Number(invoice.subtotal)-Number(invoice.discount_amount || 0));
export function financialSummary(invoices:FinancialInvoice[],lines:CostLine[],expenses:{amount:number}[]){
  const types=new Map(invoices.map(invoice=>[invoice.id,invoice.type]));
  let revenue=0,cogs=0;
  const output={cgst:0,sgst:0,igst:0,taxable:0},input={cgst:0,sgst:0,igst:0,taxable:0};
  for(const invoice of invoices){
    const sign=invoice.type.endsWith("_return")?-1:1;
    const sale=["sale","non_inventory","sale_return"].includes(invoice.type);
    const purchase=["purchase","purchase_return"].includes(invoice.type);
    if(sale)revenue+=sign*taxableBase(invoice);
    if(sale || purchase){const tax=sale?output:input;tax.taxable+=sign*taxableBase(invoice);tax.cgst+=sign*Number(invoice.cgst_amount || 0);tax.sgst+=sign*Number(invoice.sgst_amount || 0);tax.igst+=sign*Number(invoice.igst_amount || 0);}
  }
  let estimated=false;
  for(const line of lines){const type=types.get(line.invoice_id);if(type!=="sale"&&type!=="sale_return")continue;cogs+=(type==="sale_return"?-1:1)*Number(line.quantity)*Number(line.unit_cost || 0);if(line.cost_is_estimate || line.unit_cost===null)estimated=true;}
  const opex=expenses.reduce((sum,expense)=>sum+Number(expense.amount),0),gross=revenue-cogs;
  return {revenue:round2(revenue),cogs:round2(cogs),gross:round2(gross),opex:round2(opex),net:round2(gross-opex),estimated,
    gst:{out:output,inp:input,liability:round2(output.cgst+output.sgst+output.igst-input.cgst-input.sgst-input.igst)}};
}
