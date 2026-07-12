import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useSupportStaff() {
  const { user, loading: authLoading } = useAuth();
  const [isSupportStaff, setIsSupportStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setIsSupportStaff(false); setLoading(false); return; }
    supabase
      .from("support_staff")
      .select("id, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle()
      .then(({ data }) => {
        setIsSupportStaff(!!data);
        setLoading(false);
      });
  }, [user, authLoading]);

  return { isSupportStaff, loading: loading || authLoading };
}
