import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Business {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  state_code: string | null;
  logo_url: string | null;
  owner_id: string;
  pincode: string | null;
  pincode_rank: number | null;
}

interface BusinessCtx {
  businesses: Business[];
  current: Business | null;
  loading: boolean;
  setCurrent: (b: Business) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<BusinessCtx>({
  businesses: [], current: null, loading: true, setCurrent: () => {}, refresh: async () => {},
});

const STORAGE_KEY = "current_business_id";

export const BusinessProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [current, setCurrentState] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const { loading: authLoading } = useAuth();
  const userId = user?.id;

  // Keyed on the stable user id, not the `user` object — Supabase silently
  // refreshes the session (new session/user object each time) whenever the
  // tab regains focus, which must NOT be treated as "identity changed".
  const refresh = useCallback(async () => {
    if (!userId) {
      setBusinesses([]);
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
    if (!error && data) {
      const seen = new Set<string>();
      const list: Business[] = [];
      for (const row of data as any[]) {
        const b = row.businesses as Business | null;
        if (b && !seen.has(b.id)) { seen.add(b.id); list.push(b); }
      }
      list.sort((a: any, b: any) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
      setBusinesses(list);
      const savedId = localStorage.getItem(STORAGE_KEY);
      const found = list.find((b) => b.id === savedId) ?? list[0] ?? null;
      setCurrentState(found);
      if (found) localStorage.setItem(STORAGE_KEY, found.id);
    }
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
    localStorage.setItem(STORAGE_KEY, b.id);
  };

  return (
    <Ctx.Provider value={{ businesses, current, loading, setCurrent, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export const useBusiness = () => useContext(Ctx);
