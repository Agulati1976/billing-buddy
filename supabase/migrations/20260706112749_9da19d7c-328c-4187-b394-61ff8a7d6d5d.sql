-- Recompute invoice paid_amount / balance_amount / status from actual payment rows.
-- Prior bug: invoices were inserted with paid_amount already set AND payment rows
-- were then inserted, causing the apply_payment_to_invoice trigger to double-count
-- the paid amount and mark partial-credit invoices as fully paid.
WITH paid AS (
  SELECT invoice_id, COALESCE(SUM(amount), 0) AS total_paid
  FROM public.payments
  WHERE invoice_id IS NOT NULL
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
FROM (SELECT id FROM public.invoices WHERE type IN ('sale','purchase') AND deleted_at IS NULL) f
LEFT JOIN paid p ON p.invoice_id = f.id
WHERE i.id = f.id;