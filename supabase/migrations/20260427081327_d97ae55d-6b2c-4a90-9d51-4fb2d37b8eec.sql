-- Add barcode field to items for barcode billing
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS idx_items_barcode ON public.items(business_id, barcode) WHERE barcode IS NOT NULL;

-- Add non-GST toggle and invoice-level extra discount
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_gst BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS extra_discount NUMERIC NOT NULL DEFAULT 0;