
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS upi_payee_name text,
  ADD COLUMN IF NOT EXISTS show_upi_qr boolean NOT NULL DEFAULT true;
