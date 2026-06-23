-- Fix duplicate stock triggers that caused invoice/POS sales to deduct stock multiple times.

-- 1) Remove every duplicate trigger involved in stock changes.
DROP TRIGGER IF EXISTS invoice_item_stock_trigger ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_handle_invoice_item_stock ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_invoice_items_stock ON public.invoice_items;

DROP TRIGGER IF EXISTS trg_handle_invoice_item_batch ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_invoice_items_batch ON public.invoice_items;

DROP TRIGGER IF EXISTS apply_stock_movement_trigger ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_stock_movements_apply ON public.stock_movements;

DROP TRIGGER IF EXISTS trg_batches_sync ON public.batches;
DROP TRIGGER IF EXISTS trg_batches_sync_stock ON public.batches;
DROP TRIGGER IF EXISTS trg_sync_item_stock_from_batches ON public.batches;

DROP TRIGGER IF EXISTS set_initial_stock ON public.items;
DROP TRIGGER IF EXISTS trg_handle_new_item ON public.items;
DROP TRIGGER IF EXISTS trg_items_set_opening ON public.items;
DROP TRIGGER IF EXISTS log_item_opening_stock ON public.items;
DROP TRIGGER IF EXISTS trg_items_log_opening ON public.items;
DROP TRIGGER IF EXISTS trg_log_opening_stock ON public.items;

-- 2) Recreate exactly one trigger for each stock responsibility.
CREATE TRIGGER trg_items_set_opening
  BEFORE INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_item();

CREATE TRIGGER trg_items_log_opening
  AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.log_opening_stock();

CREATE TRIGGER trg_stock_movements_apply
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

CREATE TRIGGER trg_invoice_items_stock
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_item_stock();

CREATE TRIGGER trg_invoice_items_batch
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_item_batch();

CREATE TRIGGER trg_batches_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.sync_item_stock_from_batches();

-- 3) Ensure invoice-line stock movements stay idempotent even if a client retries.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_unique_ref_idx
  ON public.stock_movements (item_id, type, reference_id)
  WHERE reference_id IS NOT NULL;

-- 4) Recalculate non-batch item stock from opening stock + movement history.
WITH movement_totals AS (
  SELECT
    item_id,
    COALESCE(SUM(
      CASE
        WHEN type IN ('purchase', 'adjustment_in') THEN quantity
        WHEN type IN ('sale', 'adjustment_out', 'damage', 'transfer') THEN -quantity
        ELSE 0
      END
    ), 0) AS delta
  FROM public.stock_movements
  WHERE type <> 'opening'
  GROUP BY item_id
)
UPDATE public.items i
SET current_stock = COALESCE(i.opening_stock, 0) + COALESCE(mt.delta, 0)
FROM movement_totals mt
WHERE i.id = mt.item_id
  AND COALESCE(i.is_batch_tracked, false) = false;

UPDATE public.items i
SET current_stock = COALESCE(i.opening_stock, 0)
WHERE COALESCE(i.is_batch_tracked, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.item_id = i.id AND sm.type <> 'opening'
  );

-- 5) Recalculate batch-tracked item stock from batch quantities.
WITH batch_totals AS (
  SELECT item_id, COALESCE(SUM(quantity), 0) AS total
  FROM public.batches
  GROUP BY item_id
)
UPDATE public.items i
SET current_stock = COALESCE(bt.total, 0)
FROM batch_totals bt
WHERE i.id = bt.item_id
  AND COALESCE(i.is_batch_tracked, false) = true;

UPDATE public.items i
SET current_stock = 0
WHERE COALESCE(i.is_batch_tracked, false) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.batches b WHERE b.item_id = i.id
  );