import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useBusiness } from "./useBusiness";
import { supabase } from "@/integrations/supabase/client";

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
  canManageInventory: boolean; // owner + admin (staff can adjust stock but not delete items)
}

export function usePermissions(): Perms {
  const { user } = useAuth();
  const { current } = useBusiness();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user || !current) { setRole(null); setLoading(false); return; }
      setLoading(true);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("business_id", current.id)
        .maybeSingle();
      if (!alive) return;
      setRole((data?.role as Role) ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, current?.id]);

  const isOwner = role === "owner";
  const isAdmin = role === "owner" || role === "admin";
  const isStaff = role === "staff";

  return {
    role, loading, isOwner, isAdmin, isStaff,
    canManageTeam: isOwner,
    canEditSettings: isAdmin,
    canDelete: isAdmin,
    canManageInventory: isAdmin,
  };
}
