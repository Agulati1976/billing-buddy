import { supabase } from "@/integrations/supabase/client";

export async function callAdminAction<T = any>(
  action: string,
  target_id?: string,
  metadata?: Record<string, any>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-actions", {
    body: { action, target_id, metadata },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function formatINR(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
