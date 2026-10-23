import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { enqueue, deleteOutbox, listOutbox, offlineAccount } from "./offlineDb";

export type BillingRpc = "save_invoice" | "record_payment" | "change_invoice_state" | "adjust_stock" | "save_item" | "save_batch" | "delete_batch" | "close_pos_session" | "open_pos_session" | "set_business_pincode";
export type RpcArgs = Record<string, Json | undefined>;
export const jsonValue = (value:unknown):Json => JSON.parse(JSON.stringify(value));
export type MutationResult<T> = {data:T;queued:boolean;error:{message:string;code?:string}|null};
export const networkFailure = (error: unknown) => /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(String((error as {message?:string})?.message ?? error));

// Generated RPC declarations are refreshed from the tested schema before release.
export async function callBillingRpc(name: BillingRpc,args: RpcArgs) {
  const client = supabase as unknown as {rpc:(name:string,args:RpcArgs)=>Promise<{data:unknown;error:{message:string;code?:string}|null}>};
  return client.rpc(name,args);
}

export async function billingTransaction<T>(name: BillingRpc,businessId:string,args:RpcArgs,preview:T):Promise<MutationResult<T>> {
  const owner=offlineAccount();
  if(!owner) return {data:preview,queued:false,error:{message:"Sign in before saving"}};
  // Persist the whole request before sending. Replays keep its operation UUID,
  // including when the server committed but the response was lost.
  let pending;
  let hasPredecessors=false;
  try {
    hasPredecessors=(await listOutbox()).length>0;
    if(offlineAccount()!==owner)return {data:preview,queued:false,error:{message:"Account changed before this request could be saved"}};
    pending=await enqueue({table:name,op:"rpc",businessId,payload:args});
  }
  catch {return {data:preview,queued:false,error:{message:"Offline storage is unavailable. Please reload and retry."}};}
  if(hasPredecessors || (typeof navigator!=="undefined"&&!navigator.onLine)) return {data:preview,queued:true,error:null};
  try {
    if(offlineAccount()!==owner) throw new Error("Account changed. Sign in again before saving.");
    const result=await callBillingRpc(name,args);
    if(result.error&&networkFailure(result.error)) return {data:preview,queued:true,error:null};
    await deleteOutbox(pending.id);
    return {data:(result.data??preview) as T,queued:false,error:result.error};
  } catch(error) {
    if(networkFailure(error)) return {data:preview,queued:true,error:null};
    await deleteOutbox(pending.id);
    return {data:preview,queued:false,error:{message:error instanceof Error?error.message:"Unable to save"}};
  }
}

const paymentRequests=new Map<string,Promise<MutationResult<Record<string,unknown>>>>();
export function recordPayment<T extends Record<string,unknown>>(payment:T) {
  const key=JSON.stringify(payment);
  const existing=paymentRequests.get(key);
  if(existing)return existing;
  const payload={...payment,id:payment.id ?? crypto.randomUUID()};
  const request=billingTransaction("record_payment",String(payment.business_id),{p_operation_id:crypto.randomUUID(),p_payment:jsonValue(payload)},payload);
  paymentRequests.set(key,request);
  void request.finally(()=>paymentRequests.delete(key));
  return request;
}
