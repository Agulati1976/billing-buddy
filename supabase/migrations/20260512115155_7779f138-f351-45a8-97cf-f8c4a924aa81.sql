ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(business_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON public.payments(business_id, deleted_at);