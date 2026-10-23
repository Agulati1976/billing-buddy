import { corsHeaders, identity, membership, requestJson, HttpError, json, failure } from "../_shared/security.ts";

const allowedModules = new Set(["dashboard","pos","sales","sale_returns","quotations","purchases","quick_invoices","proforma_invoice","customers","suppliers","party_ledger","items","stock","categories","warehouses","batches","branches","accounts","payments","expenses","loyalty","reports","ai_insights"]);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await identity(req);
    const { business_id, email, password, full_name, modules = [] } = await requestJson(req);
    await membership(ctx, business_id, undefined, true);
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== "string" || password.length < 8 ||
        !Array.isArray(modules) || modules.some(module => !allowedModules.has(module))) throw new HttpError(400, "A valid email, password of at least 8 characters and module selection are required");
    const normalized = email.trim().toLowerCase();
    const { data: profile, error: profileError } = await ctx.admin.from("profiles").select("user_id").eq("email", normalized).maybeSingle();
    if (profileError) throw profileError;
    let userId = profile?.user_id;
    let createdUser = false;
    if (!userId) {
      const { data, error } = await ctx.admin.auth.admin.createUser({ email: normalized, password, email_confirm: true,
        user_metadata: { full_name: typeof full_name === "string" ? full_name.trim().slice(0, 200) : null } });
      if (error || !data.user) throw new HttpError(400, "Unable to create this staff account");
      userId = data.user.id;
      createdUser = true;
    }
    const { error } = await ctx.admin.rpc("assign_business_staff", { p_actor_id: ctx.user.id, p_business_id: business_id, p_user_id: userId, p_modules: modules });
    if (error) {
      // Only remove a new account created by this request; existing users are never modified.
      if (createdUser) await ctx.admin.auth.admin.deleteUser(userId);
      throw new HttpError(400, error.message);
    }
    return json({ ok: true, user_id: userId });
  } catch (error) { return failure(error); }
});
