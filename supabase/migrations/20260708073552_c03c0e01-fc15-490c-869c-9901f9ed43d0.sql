
-- Drop duplicate trigger — two triggers were calling apply_payment_to_invoice on every payment INSERT,
-- causing paid_amount to be incremented twice and balance to drop by 2x.
DROP TRIGGER IF EXISTS payment_to_invoice_trigger ON public.payments;
DROP TRIGGER IF EXISTS trg_apply_payment_to_invoice ON public.payments;

-- Rewrite function to recompute from actual payment rows (idempotent, safe against future dupes).
CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_id UUID;
  total_paid NUMERIC;
  inv_total NUMERIC;
  new_balance NUMERIC;
  new_status public.invoice_status;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF inv_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT total_amount INTO inv_total FROM public.invoices WHERE id = inv_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = inv_id AND deleted_at IS NULL;

  new_balance := GREATEST(0, inv_total - total_paid);
  IF new_balance <= 0 THEN new_status := 'paid';
  ELSIF total_paid > 0 THEN new_status := 'partial';
  ELSE new_status := 'unpaid';
  END IF;

  UPDATE public.invoices
  SET paid_amount = total_paid, balance_amount = new_balance, status = new_status
  WHERE id = inv_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Single trigger covering INSERT/UPDATE/DELETE so balance stays in sync.
CREATE TRIGGER trg_apply_payment_to_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_payment_to_invoice();

-- Resync existing invoices from real payment history to correct any past double-counting.
WITH paid AS (
  SELECT invoice_id, COALESCE(SUM(amount), 0) AS total_paid
  FROM public.payments
  WHERE invoice_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY invoice_id
)
UPDATE public.invoices i
SET
  paid_amount = COALESCE(p.total_paid, 0),
  balance_amount = GREATEST(0, i.total_amount - COALESCE(p.total_paid, 0)),
  status = CASE
    WHEN (i.total_amount - COALESCE(p.total_paid, 0)) <= 0 THEN 'paid'::public.invoice_status
    WHEN COALESCE(p.total_paid, 0) > 0 THEN 'partial'::public.invoice_status
    ELSE 'unpaid'::public.invoice_status
  END
FROM public.invoices f
LEFT JOIN paid p ON p.invoice_id = f.id
WHERE i.id = f.id
  AND f.type IN ('sale','purchase')
  AND f.deleted_at IS NULL;
