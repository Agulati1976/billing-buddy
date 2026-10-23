import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setOfflineAccount } from "@/lib/offlineDb";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate=useNavigate();
  const queryClient=useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let version=0;
    // Set listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      version++;
      setOfflineAccount(sess?.user.id ?? null);
      if (_event === "SIGNED_OUT" && "caches" in window) void caches.delete("supabase-rest");
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if(_event==="SIGNED_OUT")queryClient.clear();
      if(_event==="PASSWORD_RECOVERY")navigate("/auth/reset-password",{replace:true});
    });

    const initialVersion=version;
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if(version!==initialVersion)return;
      setOfflineAccount(sess?.user.id ?? null);
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate,queryClient]);

  const signOut = async () => {
    setOfflineAccount(null);
    if ("caches" in window) await caches.delete("supabase-rest");
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ user, session, loading, signOut }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
