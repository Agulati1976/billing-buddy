// Create a support staff login. Platform admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Only platform admins
    const { data: adminRow } = await admin
      .from("platform_admins").select("id").eq("user_id", caller.id).maybeSingle();
    if (!adminRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name } = await req.json() as {
      email: string; password: string; full_name?: string;
    };

    if (!email || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: "email and password (min 6 chars) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalized = email.trim().toLowerCase();
    let userId: string | null = null;

    const { data: existing } = await admin
      .from("profiles").select("user_id").eq("email", normalized).maybeSingle();

    if (existing) {
      userId = existing.user_id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: normalized, password, email_confirm: true,
        user_metadata: { full_name: full_name ?? null },
      });
      if (cErr || !created.user) {
        return new Response(JSON.stringify({ error: cErr?.message ?? "Failed to create user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = created.user.id;
    }

    const { error: sErr } = await admin.from("support_staff").upsert({
      user_id: userId, full_name: full_name ?? null, email: normalized,
      active: true, created_by: caller.id,
    }, { onConflict: "user_id" });
    if (sErr) {
      return new Response(JSON.stringify({ error: sErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
