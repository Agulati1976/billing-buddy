
-- POS feature gating

-- 1) Per-business feature flags (controlled by Platform Admin)
CREATE TABLE public.business_features (
  business_id UUID PRIMARY KEY,
  pos_enabled BOOLEAN NOT NULL DEFAULT false,
  pos_enabled_at TIMESTAMPTZ,
  pos_enabled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_features ENABLE ROW LEVEL SECURITY;

-- Members of the business can READ their feature flags (so app can know if POS is enabled)
CREATE POLICY "Members view features"
  ON public.business_features FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));

-- Only platform admins can read/insert/update/delete features
CREATE POLICY "Platform admins view features"
  ON public.business_features FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins insert features"
  ON public.business_features FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins update features"
  ON public.business_features FOR UPDATE
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins delete features"
  ON public.business_features FOR DELETE
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_business_features_updated
  BEFORE UPDATE ON public.business_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Per-user POS access (within a business). Owner/admin can grant.
CREATE TABLE public.pos_user_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  user_id UUID NOT NULL,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

ALTER TABLE public.pos_user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view pos access"
  ON public.pos_user_access FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Owners/admins manage pos access insert"
  ON public.pos_user_access FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), business_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), business_id, 'admin'::app_role)
  );

CREATE POLICY "Owners/admins manage pos access delete"
  ON public.pos_user_access FOR DELETE
  USING (
    public.has_role(auth.uid(), business_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), business_id, 'admin'::app_role)
  );

CREATE POLICY "Platform admins view all pos access"
  ON public.pos_user_access FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- 3) Held/parked POS carts
CREATE TABLE public.pos_held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  created_by UUID NOT NULL,
  label TEXT,
  party_id UUID,
  cart JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_held_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view held carts"
  ON public.pos_held_carts FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members insert held carts"
  ON public.pos_held_carts FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id) AND auth.uid() = created_by);

CREATE POLICY "Members delete held carts"
  ON public.pos_held_carts FOR DELETE
  USING (public.is_business_member(auth.uid(), business_id));

-- 4) POS sessions (day open/close)
CREATE TABLE public.pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  opened_by UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC NOT NULL DEFAULT 0,
  closing_cash NUMERIC,
  expected_cash NUMERIC,
  notes TEXT
);

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view sessions"
  ON public.pos_sessions FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members open session"
  ON public.pos_sessions FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id) AND auth.uid() = opened_by);

CREATE POLICY "Members close own session"
  ON public.pos_sessions FOR UPDATE
  USING (public.is_business_member(auth.uid(), business_id));

-- Link invoices to a POS session (optional)
ALTER TABLE public.invoices ADD COLUMN pos_session_id UUID;
CREATE INDEX idx_invoices_pos_session ON public.invoices(pos_session_id);
