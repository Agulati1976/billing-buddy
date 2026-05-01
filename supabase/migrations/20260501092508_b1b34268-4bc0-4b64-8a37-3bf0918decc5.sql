-- 1. Platform admins table
CREATE TABLE public.platform_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$$;

-- 3. Policies on platform_admins
CREATE POLICY "Platform admins view admins"
  ON public.platform_admins FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins add admins"
  ON public.platform_admins FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins remove admins"
  ON public.platform_admins FOR DELETE
  USING (public.is_platform_admin(auth.uid()));

-- 4. Add platform-admin SELECT-all policies to all tenant tables
CREATE POLICY "Platform admins view all businesses"
  ON public.businesses FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all profiles"
  ON public.profiles FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all user_roles"
  ON public.user_roles FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all parties"
  ON public.parties FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all items"
  ON public.items FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all categories"
  ON public.categories FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all warehouses"
  ON public.warehouses FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all batches"
  ON public.batches FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all invoices"
  ON public.invoices FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all invoice_items"
  ON public.invoice_items FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all payments"
  ON public.payments FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all expenses"
  ON public.expenses FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all stock_movements"
  ON public.stock_movements FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all payment_reminders"
  ON public.payment_reminders FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins view all invoice_settings"
  ON public.invoice_settings FOR SELECT USING (public.is_platform_admin(auth.uid()));

-- 5. Allow platform admins to suspend/disable: delete businesses
CREATE POLICY "Platform admins delete any business"
  ON public.businesses FOR DELETE USING (public.is_platform_admin(auth.uid()));