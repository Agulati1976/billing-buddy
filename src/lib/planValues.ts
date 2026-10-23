import type {Json} from "@/integrations/supabase/types";
export function featureFlags(value:Json):Record<string,boolean>{
  return value && typeof value==="object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry):entry is [string,boolean]=>typeof entry[1]==="boolean")) : {};
}
export function planLimits(value:Json):Record<string,number>{
  return value && typeof value==="object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry):entry is [string,number]=>typeof entry[1]==="number"&&Number.isFinite(entry[1])&&entry[1]>=0)) : {};
}
