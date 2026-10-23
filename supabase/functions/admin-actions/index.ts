import { requestJson } from "../_shared/security.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405,{error:"Method not allowed"});

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json(401, { error: "Missing token" });

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: uErr } = await userClient.auth.getUser();
  if (uErr || !userData?.user) return json(401, { error: "Invalid session" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdminRow } = await admin
    .from("platform_admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!isAdminRow) return json(403, { error: "Not a platform admin" });

  let body: {action?:string;target_id?:string;metadata?:Record<string,unknown>&{plan?:string;ids?:string[];email?:string;password?:string;full_name?:string}} = {};
  try { body = await requestJson(req); } catch { return json(400, { error: "Invalid JSON" }); }
  const { action, metadata } = body ?? {};
  const target_id = typeof body.target_id === "string" ? body.target_id : "";
  if (!action) return json(400, { error: "Missing action" });
  if (!["list_auth_users", "create_admin_user"].includes(action) &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target_id)) {
    return json(400, { error: "A valid target ID is required" });
  }

  const log = (action_name: string, target_type: string, tid: string, meta: Record<string,unknown> = {}) =>
    admin.from("admin_audit_log").insert({
      admin_id: userData.user!.id,
      action: action_name,
      target_type,
      target_id: tid,
      metadata: meta,
    }).throwOnError();

  try {
    switch (action) {
      case "suspend_business": {
        await admin.from("businesses").update({ status: "suspended" }).eq("id", target_id).select("id").single().throwOnError();
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "reactivate_business": {
        await admin.from("businesses").update({ status: "active" }).eq("id", target_id).select("id").single().throwOnError();
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "delete_business": {
        await admin
          .from("businesses")
          .update({ status: "suspended", deleted_at: new Date().toISOString() })
          .eq("id", target_id).select("id").single().throwOnError();
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "reset_user_password": {
        const { data: target, error: targetError } = await admin.auth.admin.getUserById(target_id);
        if(targetError || !target.user?.email)return json(404,{error:"User email not found"});
        const {error}=await userClient.auth.resetPasswordForEmail(target.user.email,{
          redirectTo:(Deno.env.get("APP_URL") || "https://billlook.com")+"/auth/reset-password",
        });
        if(error)return json(502,{error:"Password reset email could not be requested"});
        const prof={email:target.user.email};
        await log(action, "user", target_id, { email: prof.email });
        return json(200, { ok: true });
      }
      case "suspend_user": {
        const { error } = await admin.auth.admin.updateUserById(target_id, {
          ban_duration: "876000h",
        });
        if (error) return json(500, { error: error.message });
        await log(action, "user", target_id, metadata);
        return json(200, { ok: true });
      }
      case "reactivate_user": {
        const { error } = await admin.auth.admin.updateUserById(target_id, {
          ban_duration: "none",
        });
        if (error) return json(500, { error: error.message });
        await log(action, "user", target_id, metadata);
        return json(200, { ok: true });
      }
      case "update_plan": {
        const plan = metadata?.plan ?? "free";
        await admin
          .from("business_features")
          .upsert({ business_id: target_id, plan }, { onConflict: "business_id" }).throwOnError();
        await log(action, "business", target_id, { plan });
        return json(200, { ok: true });
      }
      case "update_feature": {
        const patch: Record<string,unknown> = { business_id: target_id };
        if(typeof metadata?.pos_enabled!=="boolean")return json(400,{error:"A POS access flag is required"});
        patch.pos_enabled=metadata.pos_enabled;
        await admin.from("business_features").upsert(patch, { onConflict: "business_id" }).throwOnError();
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "list_auth_users": {
        // Returns last_sign_in_at + banned_until for given user ids
        const ids: string[] = metadata?.ids ?? [];
        const out: Record<string,unknown> = {};
        // paginate
        let page = 1;
        while (true) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return json(500, { error: error.message });
          for (const u of data.users) {
            if (!ids.length || ids.includes(u.id)) {
              out[u.id] = {
                last_sign_in_at: u.last_sign_in_at,
                banned_until: u.banned_until ?? null,
                created_at: u.created_at,
              };
            }
          }
          if (data.users.length < 1000) break;
          page++;
          if (page > 20) break;
        }
        return json(200, { users: out });
      }
      case "create_admin_user": {
        const email = String(metadata?.email ?? "").trim().toLowerCase();
        const password = String(metadata?.password ?? "");
        const full_name = String(metadata?.full_name ?? "").trim() || null;
        if (!email || !password) return json(400, { error: "email and password required" });
        if (password.length < 6) return json(400, { error: "Password must be at least 6 characters" });

        let targetUserId: string | null = null;

        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: full_name ? { full_name } : {},
        });

        if (created?.user) {
          targetUserId = created.user.id;
        } else {
          const msg = (cErr?.message ?? "").toLowerCase();
          const alreadyExists = msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate");
          if (!alreadyExists && cErr) return json(500, { error: cErr.message });

          let page = 1;
          while (page <= 20 && !targetUserId) {
            const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
            const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
            if (found) { targetUserId = found.id; break; }
            if (!list || list.users.length < 1000) break;
            page++;
          }
          if (!targetUserId) {
            const { data: prof } = await admin.from("profiles").select("user_id").eq("email", email).maybeSingle();
            if (prof?.user_id) targetUserId = prof.user_id;
          }
          if (!targetUserId) return json(500, { error: cErr?.message ?? "Could not create or locate user" });

          // Reset password so the admin can sign in with the value just entered
          const {error:passwordError}=await admin.auth.admin.updateUserById(targetUserId, { password, email_confirm: true });
          if(passwordError)throw passwordError;
        }

        const { error: paErr } = await admin
          .from("platform_admins")
          .insert({ user_id: targetUserId, created_by: userData.user!.id });
        if (paErr && !paErr.message.toLowerCase().includes("duplicate")) {
          return json(500, { error: paErr.message });
        }

        await log("create_admin_user", "user", targetUserId, { email });
        return json(200, { ok: true, user_id: targetUserId });
      }
      default:
        return json(400, { error: `Unknown action: ${action}` });

    }
  } catch (error: unknown) {
    console.error("Admin action failed",error);
    return json(500, { error: "The administrator action could not be completed" });
  }
});
