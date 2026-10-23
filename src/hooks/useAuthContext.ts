import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });
