-- Per-batch pricing: batches previously had no price of their own, so every
-- sale/purchase line always used the item's single sale_price/purchase_price
-- regardless of which batch was picked. These columns are optional overrides —
-- a null value means "use the item's default price".
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC,
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC;
