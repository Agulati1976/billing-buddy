import { createContext } from "react";
export interface Business {
  id: string;
  created_at?: string;
  pan?: string | null;
  status: string;
  deleted_at: string | null;
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
  hasMembership: boolean;
  setCurrent: (b: Business) => void;
  refresh: () => Promise<void>;
}

export const BusinessContext = createContext<BusinessCtx>({
  businesses: [], current: null, loading: true, hasMembership:false, setCurrent: () => {}, refresh: async () => {},
});
