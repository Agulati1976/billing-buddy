-- Links a sale_return/purchase_return invoice back to the original invoice it
-- was created against, so the return can net against the original invoice's
-- balance_amount instead of leaving it permanently overstated.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_source_invoice ON public.invoices(source_invoice_id) WHERE source_invoice_id IS NOT NULL;
