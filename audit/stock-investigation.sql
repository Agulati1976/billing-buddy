-- Read-only investigation. Results contain business data; keep them private.
WITH balances AS (
 SELECT i.id,i.business_id,i.name,i.type,i.is_batch_tracked,i.current_stock,i.created_at,
   coalesce((SELECT sum(quantity) FROM public.batches b WHERE b.item_id=i.id),0) batch_quantity,
   coalesce((SELECT sum(CASE WHEN type IN ('opening','purchase','adjustment_in') THEN quantity ELSE -quantity END) FROM public.stock_movements s WHERE s.item_id=i.id),0) ledger_quantity
 FROM public.items i WHERE i.type='product'
), affected AS (
 SELECT * FROM balances WHERE abs(current_stock-ledger_quantity)>0.001
 OR (is_batch_tracked AND abs(current_stock-batch_quantity)>0.001)
)
SELECT jsonb_build_object('item',to_jsonb(a),
 'batches',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.created_at),'[]') FROM public.batches b WHERE b.item_id=a.id),
 'movements',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at),'[]') FROM public.stock_movements s WHERE s.item_id=a.id),
 'invoice_lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('line',to_jsonb(l),'invoice',to_jsonb(v)) ORDER BY v.created_at),'[]') FROM public.invoice_items l JOIN public.invoices v ON v.id=l.invoice_id WHERE l.item_id=a.id)
) investigation FROM affected a;
