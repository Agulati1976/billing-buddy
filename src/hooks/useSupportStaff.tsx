import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useSupportStaff() {
  const { user, loading: authLoading } = useAuth();
  const [isSupportStaff, setIsSupportStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { setIsSupportStaff(false); setLoading(false); return; }
    supabase
      .from("support_staff")
      .select("id, active")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle()
      .then(({ data }) => {
        setIsSupportStaff(!!data);
        setLoading(false);
      });
  }, [userId, authLoading]);

  return { isSupportStaff, loading: loading || authLoading };
}
