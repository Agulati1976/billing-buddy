ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS flavour TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS mrp NUMERIC,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS catalog_id UUID REFERENCES public.barcode_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_barcode ON public.items(business_id, barcode);