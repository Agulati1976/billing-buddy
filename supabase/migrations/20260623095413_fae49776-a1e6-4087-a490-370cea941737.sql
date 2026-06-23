
-- 1. Drop any old triggers (defensive — none currently bound)
DROP TRIGGER IF EXISTS trg_items_set_opening ON public.items;
DROP TRIGGER IF EXISTS trg_items_log_opening ON public.items;
DROP TRIGGER IF EXISTS trg_stock_movements_apply ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_invoice_items_stock ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_invoice_items_batch ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_batches_sync ON public.batches;

-- 2. Dedupe existing movements
--    Keep one 'opening' row per item.
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY created_at, id) AS rn
  FROM public.stock_movements WHERE type = 'opening'
) DELETE FROM public.stock_movements WHERE id IN (SELECT id FROM d WHERE rn > 1);

--    Keep one row per (item_id, type, reference_id) for invoice-derived movements.
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id, type, reference_id ORDER BY created_at, id) AS rn
  FROM public.stock_movements WHERE reference_id IS NOT NULL
) DELETE FROM public.stock_movements WHERE id IN (SELECT id FROM d WHERE rn > 1);

-- 3. Unique safeguard so trigger re-inserts can't duplicate
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_unique_ref_idx
  ON public.stock_movements (item_id, type, reference_id)
  WHERE reference_id IS NOT NULL;

-- 4. Rebuild handle_invoice_item_stock to use invoice_item.id as reference
--    (so multiple lines per invoice are tracked separately) and be idempotent.
CREATE OR REPLACE FUNCTION public.handle_invoice_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_type public.invoice_type;
  inv_business UUID;
  inv_creator UUID;
  mv_type public.stock_movement_type;
  is_tracked BOOLEAN;
  is_product BOOLEAN;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.batch_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT type, business_id, created_by INTO inv_type, inv_business, inv_creator
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN mv_type := 'sale';
  ELSIF inv_type = 'purchase' THEN mv_type := 'purchase';
  ELSIF inv_type = 'sale_return' THEN mv_type := 'adjustment_in';
  ELSIF inv_type = 'purchase_return' THEN mv_type := 'adjustment_out';
  ELSE RETURN NEW;
  END IF;

  SELECT (type = 'product'), COALESCE(is_batch_tracked, FALSE)
    INTO is_product, is_tracked
  FROM public.items WHERE id = NEW.item_id;

  IF is_product AND is_tracked = FALSE THEN
    INSERT INTO public.stock_movements
      (business_id, item_id, type, quantity, reference_id, notes, created_by)
    VALUES
      (inv_business, NEW.item_id, mv_type, NEW.quantity, NEW.id,
       'Invoice line ' || NEW.id, inv_creator)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Attach triggers (single, idempotent set)
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

-- 6. Recompute current_stock from scratch so any past damage is corrected.
--    Non-batch products: opening_stock + net of non-opening movements.
UPDATE public.items i
SET current_stock = i.opening_stock + COALESCE(s.delta, 0)
FROM (
  SELECT item_id,
    SUM(CASE
      WHEN type IN ('purchase', 'adjustment_in') THEN quantity
      WHEN type IN ('sale', 'adjustment_out', 'damage', 'transfer') THEN -quantity
      ELSE 0
    END) AS delta
  FROM public.stock_movements
  WHERE type <> 'opening'
  GROUP BY item_id
) s
WHERE s.item_id = i.id
  AND i.type = 'product'
  AND COALESCE(i.is_batch_tracked, FALSE) = FALSE;

-- Items with no movements: just set current_stock to opening_stock
UPDATE public.items
SET current_stock = opening_stock
WHERE type = 'product'
  AND COALESCE(is_batch_tracked, FALSE) = FALSE
  AND id NOT IN (SELECT DISTINCT item_id FROM public.stock_movements WHERE type <> 'opening');

-- Batch-tracked products: sum batches.quantity.
UPDATE public.items i
SET current_stock = COALESCE(b.total, 0)
FROM (
  SELECT item_id, SUM(quantity) AS total FROM public.batches GROUP BY item_id
) b
WHERE b.item_id = i.id AND COALESCE(i.is_batch_tracked, FALSE) = TRUE;
