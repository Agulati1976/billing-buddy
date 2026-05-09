-- 1) Per-staff module access
CREATE TABLE IF NOT EXISTS public.staff_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  user_id uuid NOT NULL,
  modules text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

ALTER TABLE public.staff_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view module access"
  ON public.staff_module_access FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Owners/admins insert module access"
  ON public.staff_module_access FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), business_id, 'owner'::app_role)
           OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

CREATE POLICY "Owners/admins update module access"
  ON public.staff_module_access FOR UPDATE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

CREATE POLICY "Owners/admins delete module access"
  ON public.staff_module_access FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

CREATE TRIGGER staff_module_access_updated_at
  BEFORE UPDATE ON public.staff_module_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Restrict deletes: remove staff delete privileges across data tables
DROP POLICY IF EXISTS "Owners/staff delete invoices" ON public.invoices;
CREATE POLICY "Owners/admins delete invoices"
  ON public.invoices FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete items" ON public.items;
CREATE POLICY "Owners/admins delete items"
  ON public.items FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete parties" ON public.parties;
CREATE POLICY "Owners/admins delete parties"
  ON public.parties FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete categories" ON public.categories;
CREATE POLICY "Owners/admins delete categories"
  ON public.categories FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete batches" ON public.batches;
CREATE POLICY "Owners/admins delete batches"
  ON public.batches FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete warehouses" ON public.warehouses;
CREATE POLICY "Owners/admins delete warehouses"
  ON public.warehouses FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete expenses" ON public.expenses;
CREATE POLICY "Owners/admins delete expenses"
  ON public.expenses FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

DROP POLICY IF EXISTS "Owners/staff delete loyalty tx" ON public.loyalty_transactions;
CREATE POLICY "Owners/admins delete loyalty tx"
  ON public.loyalty_transactions FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), business_id, 'admin'::app_role));

-- Invoice items: members can delete if they belong to business; restrict to owner/admin
DROP POLICY IF EXISTS "Members delete invoice items" ON public.invoice_items;
CREATE POLICY "Owners/admins delete invoice items"
  ON public.invoice_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (public.has_role(auth.uid(), i.business_id, 'owner'::app_role)
        OR public.has_role(auth.uid(), i.business_id, 'admin'::app_role))
  ));