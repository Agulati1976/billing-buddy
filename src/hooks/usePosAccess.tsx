import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useBusiness } from "./useBusiness";
import { usePermissions } from "./usePermissions";

interface PosAccess {
  loading: boolean;
  posEnabled: boolean;       // platform-admin-controlled feature flag
  hasPosAccess: boolean;     // user is allowed to use POS
  canUsePos: boolean;        // posEnabled && hasPosAccess
  refresh: () => Promise<void>;
}

export function usePosAccess(): PosAccess {
  const { user } = useAuth();
  const { current } = useBusiness();
  const { isOwner, isAdmin } = usePermissions();
  const [posEnabled, setPosEnabled] = useState(false);
  const [hasPosAccess, setHasPosAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user || !current) {
      setPosEnabled(false); setHasPosAccess(false); setLoading(false); return;
    }
    setLoading(true);
    const [feat, access] = await Promise.all([
      supabase.from("business_features").select("pos_enabled").eq("business_id", current.id).maybeSingle(),
      supabase.from("pos_user_access").select("id").eq("business_id", current.id).eq("user_id", user.id).maybeSingle(),
    ]);
    setPosEnabled(!!feat.data?.pos_enabled);
    // Owners & admins implicitly have access; staff need explicit grant
    setHasPosAccess(isOwner || isAdmin || !!access.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id, current?.id, isOwner, isAdmin]);

  return {
    loading, posEnabled, hasPosAccess,
    canUsePos: posEnabled && hasPosAccess,
    refresh: load,
  };
}
