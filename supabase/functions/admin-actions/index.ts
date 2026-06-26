// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const { action, target_id, metadata } = body ?? {};
  if (!action) return json(400, { error: "Missing action" });

  const log = (action_name: string, target_type: string, tid: string, meta: any = {}) =>
    admin.from("admin_audit_log").insert({
      admin_id: userData.user!.id,
      action: action_name,
      target_type,
      target_id: tid,
      metadata: meta,
    });

  try {
    switch (action) {
      case "suspend_business": {
        await admin.from("businesses").update({ status: "suspended" }).eq("id", target_id);
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "reactivate_business": {
        await admin.from("businesses").update({ status: "active" }).eq("id", target_id);
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "delete_business": {
        await admin
          .from("businesses")
          .update({ status: "suspended", deleted_at: new Date().toISOString() })
          .eq("id", target_id);
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "reset_user_password": {
        const { data: prof } = await admin
          .from("profiles")
          .select("email")
          .eq("user_id", target_id)
          .maybeSingle();
        if (!prof?.email) return json(404, { error: "No email on profile" });
        const { error } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: prof.email,
        });
        if (error) return json(500, { error: error.message });
        await log(action, "user", target_id, { email: prof.email });
        return json(200, { ok: true });
      }
      case "suspend_user": {
        const { error } = await admin.auth.admin.updateUserById(target_id, {
          ban_duration: "876000h",
        } as any);
        if (error) return json(500, { error: error.message });
        await log(action, "user", target_id, metadata);
        return json(200, { ok: true });
      }
      case "reactivate_user": {
        const { error } = await admin.auth.admin.updateUserById(target_id, {
          ban_duration: "none",
        } as any);
        if (error) return json(500, { error: error.message });
        await log(action, "user", target_id, metadata);
        return json(200, { ok: true });
      }
      case "update_plan": {
        const plan = metadata?.plan ?? "free";
        await admin
          .from("business_features")
          .upsert({ business_id: target_id, plan }, { onConflict: "business_id" });
        await log(action, "business", target_id, { plan });
        return json(200, { ok: true });
      }
      case "update_feature": {
        const patch: Record<string, any> = { business_id: target_id };
        for (const k of Object.keys(metadata ?? {})) patch[k] = metadata[k];
        await admin.from("business_features").upsert(patch, { onConflict: "business_id" });
        await log(action, "business", target_id, metadata);
        return json(200, { ok: true });
      }
      case "list_auth_users": {
        // Returns last_sign_in_at + banned_until for given user ids
        const ids: string[] = metadata?.ids ?? [];
        const out: Record<string, any> = {};
        // paginate
        let page = 1;
        while (true) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return json(500, { error: error.message });
          for (const u of data.users) {
            if (!ids.length || ids.includes(u.id)) {
              out[u.id] = {
                last_sign_in_at: u.last_sign_in_at,
                banned_until: (u as any).banned_until ?? null,
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
            const found = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);
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
          await admin.auth.admin.updateUserById(targetUserId, { password, email_confirm: true });
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
  } catch (e: any) {
    return json(500, { error: e?.message ?? "Server error" });
  }
});
