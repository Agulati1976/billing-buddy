-- Stock History currently shows nothing for batch-tracked items: sale/purchase/return
-- stock changes for them go straight through `batches.quantity` (handle_invoice_item_batch)
-- and never touch stock_movements at all. This adds a proper audit trail for them too,
-- and a batch_id column so history/UI can show which batch was affected.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON public.stock_movements(batch_id) WHERE batch_id IS NOT NULL;

-- apply_stock_movement() updates items.current_stock for every stock_movements insert.
-- If handle_invoice_item_batch() below starts inserting rows for batch-tracked items,
-- this trigger would ALSO bump current_stock on top of what sync_item_stock_from_batches
-- already applies from the batches.quantity change — double-counting stock. Guard it:
-- for a batch-tracked item, the row is audit-only and must not touch current_stock.
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
  tracked BOOLEAN;
BEGIN
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  -- Skip 'opening' since it's already counted on item creation
  IF NEW.type = 'opening' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_batch_tracked, FALSE) INTO tracked FROM public.items WHERE id = NEW.item_id;
  IF tracked THEN
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

-- Extend the batch trigger to also log a stock_movements row per batch change, so
-- Stock History has something to show for batch-tracked items (it previously had
-- nothing at all for them). Quantity math on `batches` is unchanged.
CREATE OR REPLACE FUNCTION public.handle_invoice_item_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_type public.invoice_type;
  inv_business UUID;
  inv_creator UUID;
  delta NUMERIC;
  updated_qty NUMERIC;
  batch_rec RECORD;
  mv_type public.stock_movement_type;
BEGIN
  IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  SELECT type, business_id, created_by INTO inv_type, inv_business, inv_creator
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN delta := -NEW.quantity; mv_type := 'sale';
  ELSIF inv_type = 'sale_return' THEN delta := NEW.quantity; mv_type := 'adjustment_in';
  ELSIF inv_type = 'purchase_return' THEN delta := -NEW.quantity; mv_type := 'adjustment_out';
  ELSIF inv_type = 'purchase' THEN
    -- The batch row itself is created with its received quantity (or credited
    -- explicitly client-side for a reused batch) — do NOT add to the batch
    -- quantity again here (that caused double-stock). Still log the movement.
    INSERT INTO public.stock_movements
      (business_id, item_id, type, quantity, reference_id, batch_id, notes, created_by)
    VALUES (inv_business, NEW.item_id, 'purchase', NEW.quantity, NEW.id, NEW.batch_id,
            'Invoice line ' || NEW.id, inv_creator)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSE RETURN NEW;
  END IF;

  IF delta < 0 THEN
    UPDATE public.batches
    SET quantity = quantity + delta
    WHERE id = NEW.batch_id
      AND quantity + delta >= 0
    RETURNING quantity INTO updated_qty;

    IF NOT FOUND THEN
      SELECT b.batch_number, b.quantity, i.name AS item_name, i.unit
      INTO batch_rec
      FROM public.batches b
      LEFT JOIN public.items i ON i.id = b.item_id
      WHERE b.id = NEW.batch_id;

      RAISE EXCEPTION 'Out of stock: batch % of % has only % % available. Select another batch.',
        COALESCE(batch_rec.batch_number, 'selected'),
        COALESCE(batch_rec.item_name, 'item'),
        GREATEST(COALESCE(batch_rec.quantity, 0), 0),
        COALESCE(batch_rec.unit, '')
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF delta > 0 THEN
    UPDATE public.batches
    SET quantity = quantity + delta
    WHERE id = NEW.batch_id;
  END IF;

  INSERT INTO public.stock_movements
    (business_id, item_id, type, quantity, reference_id, batch_id, notes, created_by)
  VALUES (inv_business, NEW.item_id, mv_type, NEW.quantity, NEW.id, NEW.batch_id,
          'Invoice line ' || NEW.id, inv_creator)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
