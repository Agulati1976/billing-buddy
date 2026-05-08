// Drains the outbox FIFO when online.
import { supabase } from "@/integrations/supabase/client";
import { listOutbox, deleteOutbox, updateOutbox, type OutboxOp } from "./offlineDb";
import { toast } from "sonner";

let draining = false;
const MAX_ATTEMPTS = 6;

const isNetworkErr = (err: any) => {
  if (!err) return false;
  const m = String(err.message || err).toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed") ||
    err.name === "TypeError"
  );
};

async function runOne(op: OutboxOp): Promise<{ ok: boolean; networkErr?: boolean; error?: any }> {
  const t: any = supabase.from(op.table as any);
  try {
    if (op.op === "insert") {
      const { error } = await t.insert(op.payload);
      if (error) return { ok: false, networkErr: isNetworkErr(error), error };
      return { ok: true };
    }
    if (op.op === "insertMany") {
      const { error } = await t.insert(op.payload);
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
  } catch (e: any) {
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
      if (op.failed) continue;
      const r = await runOne(op);
      if (r.ok) {
        await deleteOutbox(op.id);
        synced++;
      } else if (r.networkErr) {
        // Stop and try later
        break;
      } else {
        const next = { ...op, attempts: op.attempts + 1, lastError: String(r.error?.message || r.error) };
        if (next.attempts >= MAX_ATTEMPTS) next.failed = true;
        await updateOutbox(next);
        failed++;
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
