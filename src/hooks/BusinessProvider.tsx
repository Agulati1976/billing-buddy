import { BusinessContext } from "./useBusinessContext";
import type { Business } from "./useBusinessContext";
import { useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const STORAGE_KEY = "current_business_id";

export const BusinessProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [current, setCurrentState] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMembership,setHasMembership]=useState(false);

  const { loading: authLoading } = useAuth();
  const userId = user?.id;
  const requestVersion=useRef(0);

  // Keyed on the stable user id, not the `user` object — Supabase silently
  // refreshes the session (new session/user object each time) whenever the
  // tab regains focus, which must NOT be treated as "identity changed".
  const refresh = useCallback(async () => {
    const version=++requestVersion.current;
    if (!userId) {
      setBusinesses([]);
      setHasMembership(false);
      setCurrentState(null);
      setLoading(false);
      return;
    }
    // Deliberately scoped through user_roles (this user's actual memberships)
    // instead of a bare `SELECT * FROM businesses`. The businesses table also
    // carries a separate RLS policy so platform admins can see every business
    // for the admin dashboard — those two SELECT policies combine with OR, so
    // an unscoped query here would hand a platform-admin account every other
    // tenant's business in their own shopkeeper switcher. Going through
    // user_roles keeps this query correct regardless of that policy.
    const { data, error } = await supabase
      .from("user_roles")
      .select("businesses(*)")
      .eq("user_id", userId);
    if(version!==requestVersion.current)return;
    if (!error && data) {
      setHasMembership(data.length>0);
      const seen = new Set<string>();
      const list: Business[] = [];
      for (const row of data) {
        const b = row.businesses as Business | null;
        if (b && b.status==='active' && !b.deleted_at && !seen.has(b.id)) { seen.add(b.id); list.push(b); }
      }
      list.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
      setBusinesses(list);
      const savedId = localStorage.getItem(STORAGE_KEY+":"+userId);
      const found = list.find((b) => b.id === savedId) ?? list[0] ?? null;
      setCurrentState(found);
      if (found) localStorage.setItem(STORAGE_KEY+":"+userId, found.id);
    } else {setBusinesses([]);setCurrentState(null);setHasMembership(false);}
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // While auth is resolving, or whenever the signed-in user actually
    // changes, mark businesses as loading so AppLayout doesn't prematurely
    // redirect to /onboarding before we've fetched for this user. A token
    // refresh (e.g. from switching tabs) must not retrigger this — it would
    // unmount every page under AppLayout and wipe unsaved form state.
    if (authLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    refresh();
  }, [refresh, authLoading]);

  const setCurrent = (b: Business) => {
    setCurrentState(b);
    localStorage.setItem(STORAGE_KEY+":"+userId, b.id);
  };

  return (
    <BusinessContext.Provider value={{ businesses, current, loading, hasMembership, setCurrent, refresh }}>
      {children}
    </BusinessContext.Provider>
  );
};
