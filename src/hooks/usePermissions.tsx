import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useBusiness } from "./useBusiness";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/modules";

export type Role = "owner" | "admin" | "staff" | "accountant";

interface Perms {
  role: Role | null;
  features: Record<string,boolean>;
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
  const userId = user?.id;
  const { current } = useBusiness();
  const currentId = current?.id;
  const [role, setRole] = useState<Role | null>(null);
  const [features,setFeatures]=useState<Record<string,boolean>>({});
  const [modules, setModules] = useState<Set<ModuleKey> | null>(null);
  const [loading, setLoading] = useState(true);
  const scope = `${user?.id ?? ""}:${current?.id ?? ""}`;
  const [resolvedScope,setResolvedScope]=useState<string|null>(null);
  const pending=loading || resolvedScope!==scope;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!userId || !currentId) { setRole(null); setModules(new Set());setFeatures({}); setResolvedScope(scope);setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("business_id", currentId)
        .maybeSingle();
      if (!alive) return;
      const r = (data?.role as Role) ?? null;
      setRole(r);

      const {data:entitlements,error}=await supabase.rpc("business_entitlements",{p_business_id:currentId});
      if(!alive)return;
      const ent=entitlements as {modules?:ModuleKey[];features?:Record<string,boolean>} | null;
      setModules(new Set(error ? [] : ent?.modules ?? []));
      setFeatures(error ? {} : ent?.features ?? {});
      setResolvedScope(scope);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId, currentId,scope]);

  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";
  const isStaff = role === "staff" || role === "accountant";

  const canSeeModule = (m: ModuleKey) => {
    return !pending && role!==null && !!modules?.has(m);
  };

  return {
    role, features, loading:pending, isOwner, isAdmin, isStaff,
    canManageTeam: isOwner,
    canEditSettings: isAdmin,
    canDelete: isAdmin,
    canManageInventory: isAdmin,
    modules,
    canSeeModule,
  };
}
