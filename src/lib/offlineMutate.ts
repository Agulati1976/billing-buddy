// Thin wrappers around supabase mutations that fall back to an outbox queue when offline.
import { supabase } from "@/integrations/supabase/client";
import { enqueue } from "./offlineDb";

export type OmResult<T = any> = { data: T; queued: boolean; error: any };

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

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function ensureId<T extends Record<string, any>>(row: T): T & { id: string } {
  return { ...row, id: row.id ?? crypto.randomUUID() } as any;
}

export async function omInsert<T extends Record<string, any>>(
  table: string,
  row: T
): Promise<OmResult<T & { id: string }>> {
  const payload = ensureId(row);
  if (isOffline()) {
    await enqueue({ table, op: "insert", payload });
    return { data: payload, queued: true, error: null };
  }
  try {
    const { data, error } = await (supabase.from as any)(table).insert(payload).select().maybeSingle();
    if (error) {
      if (isNetworkErr(error)) {
        await enqueue({ table, op: "insert", payload });
        return { data: payload, queued: true, error: null };
      }
      return { data: payload, queued: false, error };
    }
    return { data: (data ?? payload) as any, queued: false, error: null };
  } catch (e: any) {
    if (isNetworkErr(e)) {
      await enqueue({ table, op: "insert", payload });
      return { data: payload, queued: true, error: null };
    }
    return { data: payload, queued: false, error: e };
  }
}

export async function omInsertMany<T extends Record<string, any>>(
  table: string,
  rows: T[]
): Promise<OmResult<(T & { id: string })[]>> {
  const payload = rows.map(ensureId);
  if (isOffline()) {
    await enqueue({ table, op: "insertMany", payload });
    return { data: payload, queued: true, error: null };
  }
  try {
    const { data, error } = await (supabase.from as any)(table).insert(payload).select();
    if (error) {
      if (isNetworkErr(error)) {
        await enqueue({ table, op: "insertMany", payload });
        return { data: payload, queued: true, error: null };
      }
      return { data: payload, queued: false, error };
    }
    return { data: (data ?? payload) as any, queued: false, error: null };
  } catch (e: any) {
    if (isNetworkErr(e)) {
      await enqueue({ table, op: "insertMany", payload });
      return { data: payload, queued: true, error: null };
    }
    return { data: payload, queued: false, error: e };
  }
}

export async function omUpdate<T extends Record<string, any>>(
  table: string,
  match: { column: string; value: any },
  patch: T
): Promise<OmResult<T>> {
  if (isOffline()) {
    await enqueue({ table, op: "update", payload: patch, match });
    return { data: patch, queued: true, error: null };
  }
  try {
    const { error } = await (supabase.from as any)(table)
      .update(patch)
      .eq(match.column, match.value);
    if (error) {
      if (isNetworkErr(error)) {
        await enqueue({ table, op: "update", payload: patch, match });
        return { data: patch, queued: true, error: null };
      }
      return { data: patch, queued: false, error };
    }
    return { data: patch, queued: false, error: null };
  } catch (e: any) {
    if (isNetworkErr(e)) {
      await enqueue({ table, op: "update", payload: patch, match });
      return { data: patch, queued: true, error: null };
    }
    return { data: patch, queued: false, error: e };
  }
}

export async function omDelete(
  table: string,
  match: { column: string; value: any }
): Promise<OmResult<null>> {
  if (isOffline()) {
    await enqueue({ table, op: "delete", match });
    return { data: null, queued: true, error: null };
  }
  try {
    const { error } = await (supabase.from as any)(table).delete().eq(match.column, match.value);
    if (error) {
      if (isNetworkErr(error)) {
        await enqueue({ table, op: "delete", match });
        return { data: null, queued: true, error: null };
      }
      return { data: null, queued: false, error };
    }
    return { data: null, queued: false, error: null };
  } catch (e: any) {
    if (isNetworkErr(e)) {
      await enqueue({ table, op: "delete", match });
      return { data: null, queued: true, error: null };
    }
    return { data: null, queued: false, error: e };
  }
}
