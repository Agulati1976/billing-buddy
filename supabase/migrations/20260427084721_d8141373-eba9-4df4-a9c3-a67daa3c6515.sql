-- Track payment reminders sent to customers
CREATE TABLE public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  party_id uuid NOT NULL,
  invoice_ids uuid[] NOT NULL DEFAULT '{}',
  total_overdue numeric NOT NULL DEFAULT 0,
  recipient_email text,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  channel text NOT NULL DEFAULT 'email',
  message text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view reminders"
  ON public.payment_reminders FOR SELECT
  USING (is_business_member(auth.uid(), business_id));

CREATE POLICY "Members create reminders"
  ON public.payment_reminders FOR INSERT
  WITH CHECK (is_business_member(auth.uid(), business_id));

CREATE POLICY "Owners delete reminders"
  ON public.payment_reminders FOR DELETE
  USING (has_role(auth.uid(), business_id, 'owner'::app_role));

CREATE INDEX idx_payment_reminders_party ON public.payment_reminders(party_id);
CREATE INDEX idx_payment_reminders_business ON public.payment_reminders(business_id);