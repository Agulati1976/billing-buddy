-- The previous migration (20260825170000) guarded apply_stock_movement() by
-- checking items.is_batch_tracked, intending to make the new audit-only rows
-- inserted by handle_invoice_item_batch() a no-op for current_stock. But that
-- guard also blocked the PRE-EXISTING, legitimate path: sync_item_stock_from_batches()
-- inserts its own (batch_id-less) stock_movements row on every batches.quantity
-- change, and THAT row is what has always driven items.current_stock for
-- batch-tracked items. Blocking "is_batch_tracked" blocked both rows, not just
-- the new one — batch-tracked stock silently stopped updating.
--
-- Correct guard: skip current_stock updates only for rows that carry a batch_id
-- (i.e. the new audit rows inserted by handle_invoice_item_batch, which always
-- set batch_id). sync_item_stock_from_batches() never sets batch_id, so its rows
-- keep applying exactly as before.
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  delta NUMERIC;
  updated_stock NUMERIC;
  item_rec RECORD;
BEGIN
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  -- Skip 'opening' since it's already counted on item creation
  IF NEW.type = 'opening' THEN
    RETURN NEW;
  END IF;

  -- Audit-only row (carries a batch reference) — the matching batches.quantity
  -- change already propagated through sync_item_stock_from_batches() separately.
  IF NEW.batch_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type IN ('purchase', 'adjustment_in') THEN
    delta := NEW.quantity;
  ELSIF NEW.type IN ('sale', 'adjustment_out', 'damage', 'transfer') THEN
    delta := -NEW.quantity;
  ELSE
    delta := 0;
  END IF;

  IF delta < 0 THEN
    UPDATE public.items
    SET current_stock = current_stock + delta
    WHERE id = NEW.item_id
      AND current_stock + delta >= 0
    RETURNING current_stock INTO updated_stock;

    IF NOT FOUND THEN
      SELECT name, current_stock, unit INTO item_rec
      FROM public.items
      WHERE id = NEW.item_id;

      RAISE EXCEPTION 'Out of stock: % has only % % in stock.',
        COALESCE(item_rec.name, 'item'),
        GREATEST(COALESCE(item_rec.current_stock, 0), 0),
        COALESCE(item_rec.unit, '')
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF delta > 0 THEN
    UPDATE public.items
    SET current_stock = current_stock + delta
    WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Repair any batch-tracked item whose current_stock drifted from the true sum of
-- its batches while the broken guard was live (applies across all businesses).
UPDATE public.items i
SET current_stock = COALESCE((SELECT SUM(b.quantity) FROM public.batches b WHERE b.item_id = i.id), 0)
WHERE COALESCE(i.is_batch_tracked, false) = true;
