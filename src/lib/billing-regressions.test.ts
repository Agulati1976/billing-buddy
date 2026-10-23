import { describe,it,expect } from "vitest";
import {computeInvoice,type InvoiceLineInput} from "./invoice";
import {financialSummary} from "./reporting";
import {businessDate} from "./dates";
import {escapeHtml} from "./html";
import {toCsv} from "./csv";
import {allRows} from "./pagination";
const line:InvoiceLineInput={item_id:null,item_name:"Service",hsn_code:null,quantity:1,unit:"pcs",price:118,discount_pct:0,tax_rate:18};
describe("financial regressions",()=>{
  it("does not count included GST as a discount",()=>{const result=computeInvoice([line],false,{pricesIncludeTax:true});expect(result.subtotal).toBe(100);expect(result.discount_amount).toBe(0);expect(result.tax_amount).toBe(18);expect(result.total_amount).toBe(118);expect(result.lines[0].price).toBe(100);});
  it("converts inclusive flat discounts to the same taxable basis",()=>{const result=computeInvoice([{...line,discount_amount:11.8}],false,{pricesIncludeTax:true});expect(result.discount_amount).toBe(10);expect(result.taxable_total).toBe(90);expect(result.tax_amount).toBe(16.2);});
  it("keeps CGST and SGST equal to total tax after rounding",()=>{const result=computeInvoice([{...line,price:0.05,tax_rate:18}],false);expect(result.cgst_amount+result.sgst_amount).toBe(result.tax_amount);});
  it("nets discounts, quick invoices, returns and sold cost independently of unsold purchases",()=>{
    const invoices=[{id:"sale",type:"sale",subtotal:1000,discount_amount:100,cgst_amount:81,sgst_amount:81},{id:"return",type:"sale_return",subtotal:100,cgst_amount:9,sgst_amount:9},{id:"quick",type:"non_inventory",subtotal:200},{id:"purchase",type:"purchase",subtotal:10000,cgst_amount:900,sgst_amount:900}];
    const result=financialSummary(invoices,[{invoice_id:"sale",quantity:2,unit_cost:40},{invoice_id:"return",quantity:1,unit_cost:40}],[{amount:50}]);
    expect(result.revenue).toBe(1000);expect(result.cogs).toBe(40);expect(result.net).toBe(910);expect(result.gst.out.taxable).toBe(1000);expect(result.gst.out.cgst+result.gst.out.sgst).toBe(144);
  });
  it("uses the Indian calendar date before 05:30",()=>expect(businessDate("2026-10-22T20:00:00Z")).toBe("2026-10-23"));
  it("escapes tenant text before insertion in an admin print document",()=>expect(escapeHtml('<img src=x onerror="steal()">&')).toBe('&lt;img src=x onerror=&quot;steal()&quot;&gt;&amp;'));
  it("keeps spreadsheet exports from executing text as formulas",()=>expect(toCsv([["=IMPORTXML(\"bad\")",-20]])).toBe('"\'=IMPORTXML(""bad"")",-20'));
});
describe("complete list pagination",()=>{
  it("retrieves records beyond the REST row cap",async()=>{const records=Array.from({length:1234},(_,id)=>({id}));const query={order:()=>query,range:async(start:number,end:number)=>({data:records.slice(start,end+1),error:null})};expect((await allRows(query)).data).toHaveLength(1234);});
  it("returns no misleading partial financial total when a later page fails",async()=>{const query={order:()=>query,range:async(start:number)=>start?{data:null,error:{message:"offline",code:"network",hint:"",details:""}}:{data:Array(500).fill({id:1}),error:null}};const result=await allRows(query);expect(result.data).toBeNull();expect(result.error?.message).toBe("offline");});
});
