import { supabase } from "@/integrations/supabase/client";

export interface CatalogEntry {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  flavour: string | null;
  color: string | null;
  mrp: number;
  hsn_code: string | null;
  tax_rate: number;
  unit: string;
  unit_size: number | null;
  description: string | null;
  image_url: string | null;
  contributed_by: string | null;
  contributor_business_id: string | null;
  verified: boolean;
  scan_count: number;
}

export async function lookupBarcode(barcode: string): Promise<CatalogEntry | null> {
  const code = barcode.trim();
  if (!code) return null;
  const { data } = await supabase
    .from("barcode_catalog")
    .select("*")
    .eq("barcode", code)
    .maybeSingle();
  return (data as CatalogEntry) ?? null;
}

export async function bumpScanCount(catalogId: string, current: number) {
  await supabase.from("barcode_catalog").update({ scan_count: current + 1 }).eq("id", catalogId);
}

export interface CatalogUpsertInput {
  barcode: string;
  name: string;
  brand?: string | null;
  flavour?: string | null;
  color?: string | null;
  mrp?: number;
  hsn_code?: string | null;
  tax_rate?: number;
  unit?: string;
  description?: string | null;
  image_url?: string | null;
  contributed_by: string;
  contributor_business_id?: string | null;
}

/**
 * If barcode exists in catalog: do nothing (preserve original contributor's basic info).
 * If not: create the entry from this shopkeeper's data.
 */
export async function ensureCatalogEntry(input: CatalogUpsertInput): Promise<CatalogEntry | null> {
  const code = input.barcode.trim();
  if (!code) return null;
  const existing = await lookupBarcode(code);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("barcode_catalog")
    .insert({
      barcode: code,
      name: input.name,
      brand: input.brand ?? null,
      flavour: input.flavour ?? null,
      color: input.color ?? null,
      mrp: input.mrp ?? 0,
      hsn_code: input.hsn_code ?? null,
      tax_rate: input.tax_rate ?? 0,
      unit: input.unit ?? "pcs",
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      contributed_by: input.contributed_by,
      contributor_business_id: input.contributor_business_id ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("ensureCatalogEntry failed", error);
    return null;
  }
  return (data as CatalogEntry) ?? null;
}

/**
 * Create a local item in the current business from a catalog entry (auto-fill basic details).
 * Sale price defaults to MRP if not provided.
 */
export async function createItemFromCatalog(
  entry: CatalogEntry,
  businessId: string,
  userId: string,
  overrides?: { sale_price?: number; purchase_price?: number; opening_stock?: number },
) {
  const payload = {
    business_id: businessId,
    created_by: userId,
    name: entry.name,
    type: "product" as const,
    barcode: entry.barcode,
    hsn_code: entry.hsn_code,
    unit: entry.unit,
    tax_rate: entry.tax_rate,
    sale_price: overrides?.sale_price ?? entry.mrp ?? 0,
    purchase_price: overrides?.purchase_price ?? 0,
    opening_stock: overrides?.opening_stock ?? 0,
    description: entry.description,
    brand: entry.brand,
    flavour: entry.flavour,
    color: entry.color,
    mrp: entry.mrp,
    image_url: entry.image_url,
    catalog_id: entry.id,
  };
  const { data, error } = await supabase.from("items").insert(payload).select("*").maybeSingle();
  if (error) throw error;
  if (entry) bumpScanCount(entry.id, entry.scan_count);
  return data;
}
