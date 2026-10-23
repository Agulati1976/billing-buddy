import { useContext } from "react";
import { AuthContext } from "./useAuthContext";

export const useAuth = () => useContext(AuthContext);
