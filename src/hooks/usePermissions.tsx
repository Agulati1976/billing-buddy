import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useBusiness } from "./useBusiness";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/modules";

export type Role = "owner" | "admin" | "staff";

interface Perms {
  role: Role | null;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;       // owner OR admin
  isStaff: boolean;
  canManageTeam: boolean;     // owner only
  canEditSettings: boolean;   // owner + admin
  canDelete: boolean;         // owner + admin
  canManageInventory: boolean;
  modules: Set<ModuleKey> | null; // null = all (owner/admin), Set = staff allowed list
  canSeeModule: (m: ModuleKey) => boolean;
}

export function usePermissions(): Perms {
  const { user } = useAuth();
  const { current } = useBusiness();
  const [role, setRole] = useState<Role | null>(null);
  const [modules, setModules] = useState<Set<ModuleKey> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user || !current) { setRole(null); setModules(null); setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("business_id", current.id)
        .maybeSingle();
      if (!alive) return;
      const r = (data?.role as Role) ?? null;
      setRole(r);

      if (r === "staff") {
        const { data: ma } = await supabase
          .from("staff_module_access")
          .select("modules")
          .eq("user_id", user.id)
          .eq("business_id", current.id)
          .maybeSingle();
        if (!alive) return;
        setModules(new Set(((ma?.modules ?? []) as ModuleKey[])));
      } else {
        setModules(null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, current?.id]);

  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";
  const isStaff = role === "staff";

  const canSeeModule = (m: ModuleKey) => {
    if (!isStaff) return true;
    return modules ? modules.has(m) : false;
  };

  return {
    role, loading, isOwner, isAdmin, isStaff,
    canManageTeam: isOwner,
    canEditSettings: isAdmin,
    canDelete: isAdmin,
    canManageInventory: isAdmin,
    modules,
    canSeeModule,
  };
}
