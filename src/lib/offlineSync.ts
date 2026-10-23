// Drains the outbox FIFO when online.
import { supabase } from "@/integrations/supabase/client";
import { listOutbox, deleteOutbox, updateOutbox, offlineAccount, type OutboxOp } from "./offlineDb";
import { callBillingRpc, networkFailure, type BillingRpc } from "./billingTransactions";
import { mutationTable } from "./offlineMutate";
import type { RpcArgs } from "./billingTransactions";
import { toast } from "sonner";
import { errorMessage } from "./errors";

let draining = false;
const MAX_ATTEMPTS = 6;

const isNetworkErr = networkFailure;

async function runOne(op: OutboxOp): Promise<{ ok: boolean; networkErr?: boolean; error?: unknown }> {
  try {
    if (!op.ownerId || op.ownerId !== offlineAccount()) return {ok:false,error:new Error("Account mismatch")};
    if (op.op === "rpc") {
      const {error} = await callBillingRpc(op.table as BillingRpc,op.payload as RpcArgs);
      return error ? {ok:false,networkErr:isNetworkErr(error),error} : {ok:true};
    }
    const t = mutationTable(op.table);
    if (op.op === "insert") {
      const { error } = await t.upsert(op.payload,{onConflict:"id",ignoreDuplicates:true});
      if (error) return { ok: false, networkErr: isNetworkErr(error), error };
      return { ok: true };
    }
    if (op.op === "insertMany") {
      const { error } = await t.upsert(op.payload,{onConflict:"id",ignoreDuplicates:true});
      if (error) return { ok: false, networkErr: isNetworkErr(error), error };
      return { ok: true };
    }
    if (op.op === "update") {
      const { error } = await t.update(op.payload).eq(op.match!.column, op.match!.value);
      if (error) return { ok: false, networkErr: isNetworkErr(error), error };
      return { ok: true };
    }
    if (op.op === "delete") {
      const { error } = await t.delete().eq(op.match!.column, op.match!.value);
      if (error) return { ok: false, networkErr: isNetworkErr(error), error };
      return { ok: true };
    }
    return { ok: false, error: new Error("Unknown op") };
  } catch (e: unknown) {
    return { ok: false, networkErr: isNetworkErr(e), error: e };
  }
}

export async function drainOutbox(opts?: { silent?: boolean }) {
  if (draining) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  draining = true;
  let synced = 0;
  let failed = 0;
  try {
    const ops = await listOutbox(); // FIFO by createdAt
    for (const op of ops) {
      if (op.failed || !op.ownerId || op.ownerId!==offlineAccount()) break;
      const r = await runOne(op);
      if (r.ok) {
        await deleteOutbox(op.id);
        synced++;
      } else if (r.networkErr) {
        // Stop and try later
        break;
      } else {
        const next = { ...op, attempts: op.attempts + 1, lastError: errorMessage(r.error) || String(r.error) };
        if (next.attempts >= MAX_ATTEMPTS) next.failed = true;
        await updateOutbox(next);
        failed++;
        // Later requests may depend on this one. Never skip a failed parent.
        break;
      }
    }
  } finally {
    draining = false;
    if (!opts?.silent) {
      if (synced > 0) toast.success(`Synced ${synced} pending change${synced === 1 ? "" : "s"}`);
      if (failed > 0) toast.error(`${failed} change${failed === 1 ? "" : "s"} failed to sync`);
    }
  }
}

let inited = false;
export function initOfflineSync() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  // Try draining at startup
  setTimeout(() => drainOutbox({ silent: true }), 1500);
  window.addEventListener("online", () => drainOutbox());
  // Periodic safety drain every 60s
  setInterval(() => drainOutbox({ silent: true }), 60_000);
}
