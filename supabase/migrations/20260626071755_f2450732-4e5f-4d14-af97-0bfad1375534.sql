
-- Extend subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS limits jsonb NOT NULL DEFAULT '{}'::jsonb;

-- SAAS INVOICES (admin -> shopkeeper)
CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  gst_percent numeric NOT NULL DEFAULT 18,
  gst_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',  -- draft|sent|paid|overdue|cancelled
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_at timestamptz,
  cf_order_id text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_invoices TO authenticated;
GRANT ALL ON public.saas_invoices TO service_role;

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage saas_invoices"
  ON public.saas_invoices FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Business owners view own saas_invoices"
  ON public.saas_invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS saas_invoices_business_idx ON public.saas_invoices(business_id);
CREATE INDEX IF NOT EXISTS saas_invoices_status_idx ON public.saas_invoices(status);

CREATE TRIGGER trg_saas_invoices_updated
  BEFORE UPDATE ON public.saas_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SAAS REMINDERS
CREATE TABLE IF NOT EXISTS public.saas_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,        -- renewal_due|payment_overdue|trial_ending|custom
  channel text NOT NULL,              -- email|whatsapp|both
  subject text,
  body text,
  recipient_email text,
  recipient_phone text,
  status text NOT NULL DEFAULT 'sent', -- sent|failed|queued
  error text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_reminders TO authenticated;
GRANT ALL ON public.saas_reminders TO service_role;

ALTER TABLE public.saas_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage saas_reminders"
  ON public.saas_reminders FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS saas_reminders_business_idx ON public.saas_reminders(business_id);
CREATE INDEX IF NOT EXISTS saas_reminders_sent_at_idx ON public.saas_reminders(sent_at DESC);
