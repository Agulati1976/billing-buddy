import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function usePlatformAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    supabase
      .from("platform_admins")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(!!data);
        setLoading(false);
      });
  }, [userId, authLoading]);

  return { isAdmin, loading: loading || authLoading };
}
