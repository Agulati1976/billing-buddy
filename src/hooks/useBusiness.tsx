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

  const refresh = useCallback(async () => {
    if (!user) {
      setBusinesses([]);
      setCurrentState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("businesses").select("*").order("created_at", { ascending: true });
    if (!error && data) {
      setBusinesses(data as Business[]);
      const savedId = localStorage.getItem(STORAGE_KEY);
      const found = (data as Business[]).find((b) => b.id === savedId) ?? data[0] ?? null;
      setCurrentState(found as Business | null);
      if (found) localStorage.setItem(STORAGE_KEY, found.id);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

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
