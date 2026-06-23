
CREATE TABLE public.invoice_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  edited_by uuid REFERENCES auth.users(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text
);

CREATE INDEX idx_invoice_edit_log_invoice ON public.invoice_edit_log(invoice_id, edited_at DESC);
CREATE INDEX idx_invoice_edit_log_business ON public.invoice_edit_log(business_id, edited_at DESC);

GRANT SELECT, INSERT ON public.invoice_edit_log TO authenticated;
GRANT ALL ON public.invoice_edit_log TO service_role;

ALTER TABLE public.invoice_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read invoice edit log"
  ON public.invoice_edit_log FOR SELECT
  TO authenticated
  USING (public.is_business_member(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Members insert invoice edit log"
  ON public.invoice_edit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_member(auth.uid(), business_id) AND edited_by = auth.uid());
