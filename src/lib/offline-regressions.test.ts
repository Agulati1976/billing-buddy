import "fake-indexeddb/auto";
import {describe,it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({upsert:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {enqueue,listOutbox,setOfflineAccount,clearOutbox} from "./offlineDb";
import {drainOutbox} from "./offlineSync";
import {billingTransaction} from "./billingTransactions";
beforeEach(()=>{vi.clearAllMocks();setOfflineAccount(crypto.randomUUID());mocks.from.mockReturnValue({upsert:mocks.upsert});mocks.upsert.mockResolvedValue({error:null});mocks.rpc.mockResolvedValue({data:{id:"invoice"},error:null});Object.defineProperty(navigator,"onLine",{value:true,configurable:true});});
describe("account scoped offline transactions",()=>{
  it("does not attribute an in-flight enqueue to a newly signed-in account",async()=>{
    const result=billingTransaction("save_invoice","shop-a",{p_operation_id:"account-change"},{id:"invoice"});
    setOfflineAccount("new-account");
    expect((await result).error?.message).toMatch(/account changed/i);
    expect(await listOutbox()).toHaveLength(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never replays another signed-in account's requests",async()=>{setOfflineAccount("account-a");await clearOutbox();await enqueue({table:"parties",op:"insert",payload:{id:"party-a"}});setOfflineAccount("account-b");await clearOutbox();expect(await listOutbox()).toEqual([]);await drainOutbox({silent:true});expect(mocks.from).not.toHaveBeenCalled();setOfflineAccount("account-a");expect(await listOutbox()).toHaveLength(1);await clearOutbox();});
  it("stops at a failed parent instead of applying its dependent rows",async()=>{await enqueue({table:"parties",op:"insert",payload:{id:"parent"}});await enqueue({table:"items",op:"insert",payload:{id:"child"}});mocks.upsert.mockResolvedValue({error:{message:"validation failed"}});await drainOutbox({silent:true});expect(mocks.from).toHaveBeenCalledTimes(1);expect((await listOutbox())[0].attempts).toBe(1);expect((await listOutbox())[1].attempts).toBe(0);await clearOutbox();});
  it("replays a whole invoice with its original operation ID after a lost response",async()=>{mocks.rpc.mockRejectedValueOnce(new TypeError("Failed to fetch"));const args={p_operation_id:"fixed-operation",p_invoice:{id:"invoice",business_id:"shop"},p_lines:[]};const saved=await billingTransaction("save_invoice","shop",args,{id:"invoice"});expect(saved.queued).toBe(true);expect(await listOutbox()).toHaveLength(1);await drainOutbox({silent:true});expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(await listOutbox()).toHaveLength(0);});
  it("retries plain inserts with duplicate-ID protection",async()=>{await enqueue({table:"parties",op:"insert",payload:{id:"committed-row"}});await drainOutbox({silent:true});expect(mocks.upsert).toHaveBeenCalledWith({id:"committed-row"},{onConflict:"id",ignoreDuplicates:true});expect(await listOutbox()).toHaveLength(0);});
  it("keeps session close behind already queued sales even after coming online",async()=>{await enqueue({table:"save_invoice",op:"rpc",businessId:"shop",payload:{p_operation_id:"sale-first"}});const result=await billingTransaction("close_pos_session","shop",{p_operation_id:"close-second",p_session_id:"session",p_closing_cash:10},{expected_cash:0});expect(result.queued).toBe(true);expect(mocks.rpc).not.toHaveBeenCalled();await drainOutbox({silent:true});expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(["save_invoice","close_pos_session"]);});
});
