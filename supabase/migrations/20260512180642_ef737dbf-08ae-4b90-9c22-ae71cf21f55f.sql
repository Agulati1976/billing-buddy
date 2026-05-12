-- Branches table
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view branches" ON public.branches
FOR SELECT USING (is_business_member(auth.uid(), business_id));

CREATE POLICY "Members create branches" ON public.branches
FOR INSERT WITH CHECK (is_business_member(auth.uid(), business_id));

CREATE POLICY "Members update branches" ON public.branches
FOR UPDATE USING (is_business_member(auth.uid(), business_id));

CREATE POLICY "Owners/admins delete branches" ON public.branches
FOR DELETE USING (
  has_role(auth.uid(), business_id, 'owner'::app_role)
  OR has_role(auth.uid(), business_id, 'admin'::app_role)
);

CREATE POLICY "Platform admins view all branches" ON public.branches
FOR SELECT USING (is_platform_admin(auth.uid()));

CREATE TRIGGER update_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoice fields for online order tracking
ALTER TABLE public.invoices
  ADD COLUMN is_online_order BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN branch_id UUID;

CREATE INDEX idx_invoices_online ON public.invoices (business_id, is_online_order) WHERE is_online_order = true;
CREATE INDEX idx_invoices_branch ON public.invoices (branch_id);