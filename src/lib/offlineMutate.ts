import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { enqueue, listOutbox, deleteOutbox, offlineAccount, type OutboxOp } from "./offlineDb";
import { networkFailure } from "./billingTransactions";

export type OfflineTable = "parties" | "items" | "expenses" | "pos_held_carts";
type Tables = Database["public"]["Tables"];
type Row<T extends OfflineTable> = Tables[T]["Row"];
type Insert<T extends OfflineTable> = Tables[T]["Insert"];
type Update<T extends OfflineTable> = Tables[T]["Update"];
type MutationError = {message:string;code?:string};
export type OmResult<T = unknown> = {data:T;queued:boolean;error:MutationError|null};
type Query = PromiseLike<{data:unknown;error:MutationError|null}> & {
  select:()=>Query;maybeSingle:()=>Query;eq:(column:string,value:unknown)=>Query;
};
type Mutator = {upsert:(payload:unknown,options:{onConflict:string;ignoreDuplicates:boolean})=>Query;update:(payload:unknown)=>Query;delete:()=>Query};
const allowed = new Set(["parties","items","expenses","pos_held_carts"]);
export function mutationTable(table:string):Mutator {
  if(!allowed.has(table))throw new Error("Use the billing transaction API for this operation");
  const client=supabase as unknown as {from:(name:string)=>Mutator};
  return client.from(table);
}
const errorResult=(error:unknown):MutationError=>({message:String((error as {message?:string})?.message ?? error ?? "Unable to save"),code:(error as {code?:string})?.code});

async function perform<T>(op:Omit<OutboxOp,"id"|"createdAt"|"attempts">,preview:T,run:()=>Query):Promise<OmResult<T>>{
  const owner=offlineAccount();
  if(!owner)return {data:preview,queued:false,error:{message:"Sign in before saving"}};
  let pending;
  try {
    const predecessors=(await listOutbox()).length>0;
    if(offlineAccount()!==owner)throw new Error("Account changed before this request could be saved");
    pending=await enqueue(op);
    if(predecessors || (typeof navigator!=="undefined"&&!navigator.onLine))return {data:preview,queued:true,error:null};
    const result=await run();
    if(result.error && networkFailure(result.error))return {data:preview,queued:true,error:null};
    await deleteOutbox(pending.id);
    return {data:(result.data ?? preview) as T,queued:false,error:result.error};
  }catch(error){
    if(pending && networkFailure(error))return {data:preview,queued:true,error:null};
    if(pending)await deleteOutbox(pending.id);
    return {data:preview,queued:false,error:errorResult(error)};
  }
}
function draft<T extends OfflineTable>(table:T,row:Insert<T>):Row<T>{
  // The preview supplies database defaults needed by dependent offline forms.
  return {state_code:null,gstin:null,email:null,phone:null,created_at:new Date().toISOString(),...row,id:row.id ?? crypto.randomUUID()} as Row<T>;
}
export async function omInsert<T extends OfflineTable>(table:T,row:Insert<T>):Promise<OmResult<Row<T>>>{
  const preview=draft(table,row);
  const payload={...row,id:preview.id};
  return perform({table,op:"insert",payload},preview,()=>mutationTable(table).upsert(payload,{onConflict:"id",ignoreDuplicates:true}).select().maybeSingle());
}
export async function omInsertMany<T extends OfflineTable>(table:T,rows:Insert<T>[]):Promise<OmResult<Row<T>[]>>{
  const preview=rows.map(row=>draft(table,row)),payload=rows.map((row,i)=>({...row,id:preview[i].id}));
  return perform({table,op:"insertMany",payload},preview,()=>mutationTable(table).upsert(payload,{onConflict:"id",ignoreDuplicates:true}).select());
}
export async function omUpdate<T extends OfflineTable>(table:T,match:{column:keyof Row<T>&string;value:unknown},patch:Update<T>):Promise<OmResult<Update<T>>>{
  return perform({table,op:"update",payload:patch,match},patch,()=>mutationTable(table).update(patch).eq(match.column,match.value));
}
export async function omDelete<T extends OfflineTable>(table:T,match:{column:keyof Row<T>&string;value:unknown}):Promise<OmResult<null>>{
  return perform({table,op:"delete",match},null,()=>mutationTable(table).delete().eq(match.column,match.value));
}
