-- Loyalty settings (one row per business)
CREATE TABLE public.loyalty_settings (
  business_id UUID PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  amount_per_point NUMERIC NOT NULL DEFAULT 100,   -- spend this much (₹) to earn 1 point
  point_value NUMERIC NOT NULL DEFAULT 1,          -- ₹ value of 1 point on redemption
  min_redeem_points NUMERIC NOT NULL DEFAULT 50,   -- minimum points required to redeem
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view loyalty settings" ON public.loyalty_settings FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members insert loyalty settings" ON public.loyalty_settings FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update loyalty settings" ON public.loyalty_settings FOR UPDATE
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners delete loyalty settings" ON public.loyalty_settings FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role));
CREATE POLICY "Platform admins view all loyalty_settings" ON public.loyalty_settings FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_loyalty_settings_updated_at
BEFORE UPDATE ON public.loyalty_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Loyalty transactions (ledger)
CREATE TABLE public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  party_id UUID NOT NULL,
  invoice_id UUID,
  points_earned NUMERIC NOT NULL DEFAULT 0,
  points_redeemed NUMERIC NOT NULL DEFAULT 0,
  redeem_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_tx_party ON public.loyalty_transactions(business_id, party_id);
CREATE INDEX idx_loyalty_tx_invoice ON public.loyalty_transactions(invoice_id);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view loyalty tx" ON public.loyalty_transactions FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members insert loyalty tx" ON public.loyalty_transactions FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update loyalty tx" ON public.loyalty_transactions FOR UPDATE
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete loyalty tx" ON public.loyalty_transactions FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'staff'::app_role));
CREATE POLICY "Platform admins view all loyalty_tx" ON public.loyalty_transactions FOR SELECT
  USING (public.is_platform_admin(auth.uid()));