// Create a staff user (email + password) and assign them to a business with module access.
// Only callable by an owner or admin of the target business.
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

    const body = await req.json();
    const { business_id, email, password, full_name, modules } = body as {
      business_id: string; email: string; password: string;
      full_name?: string; modules?: string[];
    };

    if (!business_id || !email || !password) {
      return new Response(JSON.stringify({ error: "business_id, email, password required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Verify caller is owner or admin of this business
    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("business_id", business_id)
      .maybeSingle();

    if (!callerRole || (callerRole.role !== "owner" && callerRole.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Only owners/admins can create staff" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to find existing user by email
    let userId: string | null = null;
    const normalized = email.trim().toLowerCase();
    const { data: existingProfile } = await admin
      .from("profiles").select("user_id").eq("email", normalized).maybeSingle();

    if (existingProfile) {
      userId = existingProfile.user_id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: normalized,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? null },
      });
      if (cErr || !created.user) {
        return new Response(JSON.stringify({ error: cErr?.message ?? "Failed to create user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = created.user.id;
    }

    // Insert role (ignore conflict)
    const { error: rErr } = await admin.from("user_roles").insert({
      user_id: userId, business_id, role: "staff",
    });
    if (rErr && rErr.code !== "23505") {
      return new Response(JSON.stringify({ error: rErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert module access
    const { error: mErr } = await admin.from("staff_module_access").upsert({
      business_id, user_id: userId, modules: modules ?? [],
    }, { onConflict: "business_id,user_id" });
    if (mErr) {
      return new Response(JSON.stringify({ error: mErr.message }), {
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
