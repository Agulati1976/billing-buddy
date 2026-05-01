-- Global shared barcode catalog
CREATE TABLE public.barcode_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  flavour TEXT,
  color TEXT,
  mrp NUMERIC NOT NULL DEFAULT 0,
  hsn_code TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  description TEXT,
  image_url TEXT,
  contributed_by UUID,
  contributor_business_id UUID,
  verified BOOLEAN NOT NULL DEFAULT false,
  scan_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_barcode_catalog_barcode ON public.barcode_catalog(barcode);

ALTER TABLE public.barcode_catalog ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view the global catalog
CREATE POLICY "Authenticated view catalog"
ON public.barcode_catalog FOR SELECT
TO authenticated
USING (true);

-- Any authenticated user can contribute a new barcode entry
CREATE POLICY "Authenticated insert catalog"
ON public.barcode_catalog FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = contributed_by);

-- Contributor or platform admin can update
CREATE POLICY "Contributor or admin update catalog"
ON public.barcode_catalog FOR UPDATE
TO authenticated
USING (auth.uid() = contributed_by OR public.is_platform_admin(auth.uid()));

-- Contributor or platform admin can delete
CREATE POLICY "Contributor or admin delete catalog"
ON public.barcode_catalog FOR DELETE
TO authenticated
USING (auth.uid() = contributed_by OR public.is_platform_admin(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_barcode_catalog_updated_at
BEFORE UPDATE ON public.barcode_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();