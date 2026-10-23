import { useContext } from "react";
import { BusinessContext } from "./useBusinessContext";
export type { Business } from "./useBusinessContext";

export const useBusiness = () => useContext(BusinessContext);
