import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.0";
import type { Database } from "../../../src/integrations/supabase/types.ts";

export const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error("Function failed", error);
  return json({ error: "The operation could not be completed. Please retry." }, 500);
}
export async function requestJson(req: Request, maxBytes = 64_000) {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new HttpError(413, "Request too large");
  if (!req.body) throw new HttpError(400, "JSON body required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new HttpError(400, "Invalid JSON body"); }
}
export async function identity(req: Request) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Sign in to continue");
  const userClient = createClient<Database>(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Your session has expired");
  const admin = createClient<Database>(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  return { user: data.user, userClient, admin };
}
export async function platformAdmin(ctx: Awaited<ReturnType<typeof identity>>) {
  const { data, error } = await ctx.admin.from("platform_admins").select("id").eq("user_id", ctx.user.id).maybeSingle();
  if (error || !data) throw new HttpError(403, "Platform administrator access required");
}
export async function membership(ctx: Awaited<ReturnType<typeof identity>>, businessId: string, module?: string, manager = false) {
  if (!businessId || !/^[0-9a-f-]{36}$/i.test(businessId)) throw new HttpError(400, "A valid business is required");
  const { data: business, error: businessError } = await ctx.admin.from("businesses").select("id,status,deleted_at").eq("id", businessId).maybeSingle();
  const { data: roles, error } = await ctx.admin.from("user_roles").select("role").eq("user_id", ctx.user.id).eq("business_id", businessId);
  if (businessError || error || !business || business.deleted_at || business.status !== "active" || !roles?.length) throw new HttpError(403, "Business access denied");
  if (manager && !roles.some((role) => role.role === "owner" || role.role === "admin")) throw new HttpError(403, "Business owner or administrator access required");
  if (module) {
    const { data: allowed, error: accessError } = await ctx.userClient.rpc("app_has_access", { p_business_id: businessId, p_module: module });
    if (accessError || !allowed) throw new HttpError(403, "You do not have access to this feature");
  }
}
export async function quota(ctx: Awaited<ReturnType<typeof identity>>, businessId: string, feature: string) {
  const { data, error } = await ctx.userClient.rpc("consume_function_quota", { p_business_id: businessId, p_feature: feature });
  if (error) throw new HttpError(error.code==="42501"?403:500,error.code==="42501"?"This feature is not available with your access or plan":"Unable to check usage allowance");
  if (!data) throw new HttpError(429, "Daily usage limit reached. Please try again tomorrow.");
}
