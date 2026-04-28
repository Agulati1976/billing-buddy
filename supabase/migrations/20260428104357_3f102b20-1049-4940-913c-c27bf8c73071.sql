
CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE,
  template TEXT NOT NULL DEFAULT 'classic',
  accent_color TEXT NOT NULL DEFAULT '#2563EB',
  footer_text TEXT,
  default_terms TEXT,
  default_notes TEXT,
  signature_label TEXT DEFAULT 'Authorised Signatory',
  show_signature BOOLEAN NOT NULL DEFAULT true,
  show_amount_in_words BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invoice settings"
  ON public.invoice_settings FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members create invoice settings"
  ON public.invoice_settings FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Owners/admins update invoice settings"
  ON public.invoice_settings FOR UPDATE
  USING (
    public.has_role(auth.uid(), business_id, 'owner'::public.app_role)
    OR public.has_role(auth.uid(), business_id, 'admin'::public.app_role)
  );

CREATE POLICY "Owners delete invoice settings"
  ON public.invoice_settings FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::public.app_role));

CREATE TRIGGER trg_invoice_settings_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
