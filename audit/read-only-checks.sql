-- Read-only consistency checks used during the 2026-10-23 audit.
-- Returns counts only. These checks neither reconcile nor mutate records.
-- Execute through the linked Supabase CLI in a trusted environment.
SELECT 'batch_stock_mismatch' AS check_name, count(*)::int AS affected
FROM public.items i
LEFT JOIN (SELECT item_id, sum(quantity) AS qty FROM public.batches GROUP BY item_id) b
  ON b.item_id = i.id
WHERE i.is_batch_tracked AND abs(i.current_stock - coalesce(b.qty, 0)) > 0.001
UNION ALL
SELECT 'payment_invoice_tenant_mismatch', count(*)::int
FROM public.payments p JOIN public.invoices i ON i.id = p.invoice_id
WHERE p.business_id <> i.business_id
UNION ALL
SELECT 'invoice_item_tenant_mismatch', count(*)::int
FROM public.invoice_items l
JOIN public.invoices i ON i.id = l.invoice_id
JOIN public.items it ON it.id = l.item_id
WHERE it.business_id <> i.business_id
UNION ALL
SELECT 'stock_history_balance_mismatch', count(*)::int
FROM public.items i
LEFT JOIN (
  SELECT item_id,
    sum(CASE WHEN type IN ('opening', 'purchase', 'adjustment_in') THEN quantity ELSE -quantity END) AS qty
  FROM public.stock_movements GROUP BY item_id
) s ON s.item_id = i.id
WHERE i.type = 'product' AND abs(i.current_stock - coalesce(s.qty, 0)) > 0.001
UNION ALL
SELECT 'multiple_roles_per_business_user', count(*)::int
FROM (
  SELECT user_id, business_id FROM public.user_roles
  GROUP BY user_id, business_id HAVING count(*) > 1
) r;
