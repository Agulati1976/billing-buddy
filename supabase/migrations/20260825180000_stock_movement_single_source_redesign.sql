-- The previous two migrations left a real duplication bug: handle_invoice_item_batch()
-- now inserts its own labeled stock_movements row (Sale/Purchase, with batch_id +
-- reference_id) AND its inline `UPDATE batches` still triggers the pre-existing
-- sync_item_stock_from_batches(), which inserts its OWN generic "Adjustment" row for
-- the same event. Two rows per change means the running balance shown in Stock History
-- (computed client-side by walking the rows) double-counts every batch movement.
--
-- Redesign: sync_item_stock_from_batches() becomes the ONLY inserter again (as it
-- always was), but now (a) always records which batch changed via the new batch_id
-- column, and (b) optionally records the real invoice-line reference + movement type
-- when handle_invoice_item_batch() sets transaction-local context before its UPDATE.
-- One event -> one row, always. apply_stock_movement() goes back to applying every
-- non-opening row exactly once, same as before this whole feature was added.

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

  IF NEW.type = 'opening' THEN
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

CREATE OR REPLACE FUNCTION public.sync_item_stock_from_batches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  delta NUMERIC := 0;
  target_item UUID;
  target_business UUID;
  target_batch UUID;
  mv_type public.stock_movement_type;
  note TEXT;
  batch_label TEXT;
  ctx_ref_id UUID;
  ctx_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.quantity, 0);
    target_item := NEW.item_id;
    target_business := NEW.business_id;
    target_batch := NEW.id;
    batch_label := COALESCE(NULLIF(NEW.batch_number, ''), 'batch');
    note := 'Batch ' || batch_label || ' added';
  ELSIF TG_OP = 'UPDATE' THEN
    delta := COALESCE(NEW.quantity, 0) - COALESCE(OLD.quantity, 0);
    target_item := NEW.item_id;
    target_business := NEW.business_id;
    target_batch := NEW.id;
    batch_label := COALESCE(NULLIF(NEW.batch_number, ''), 'batch');
    IF delta > 0 THEN
      note := 'Batch ' || batch_label || ' qty increased';
    ELSE
      note := 'Batch ' || batch_label || ' consumed / qty decreased';
    END IF;
  ELSE
    delta := -COALESCE(OLD.quantity, 0);
    target_item := OLD.item_id;
    target_business := OLD.business_id;
    target_batch := OLD.id;
    batch_label := COALESCE(NULLIF(OLD.batch_number, ''), 'batch');
    note := 'Batch ' || batch_label || ' removed';
  END IF;

  IF delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Optional context set by handle_invoice_item_batch() (or credit_batch_quantity())
  -- right before the UPDATE that fired this trigger, transaction-local only. Lets a
  -- single row carry the real movement type + a link back to the invoice line instead
  -- of a generic, untraceable "adjustment".
  ctx_ref_id := NULLIF(current_setting('app.stock_movement_reference_id', true), '')::uuid;
  ctx_type := NULLIF(current_setting('app.stock_movement_type', true), '');

  IF ctx_type IS NOT NULL THEN
    mv_type := ctx_type::public.stock_movement_type;
  ELSIF delta > 0 THEN
    mv_type := 'adjustment_in';
  ELSE
    mv_type := 'adjustment_out';
  END IF;

  IF ctx_ref_id IS NOT NULL THEN
    note := 'Invoice line ' || ctx_ref_id;
  END IF;

  INSERT INTO public.stock_movements
    (business_id, item_id, type, quantity, reference_id, batch_id, notes)
  VALUES
    (target_business, target_item, mv_type, ABS(delta), ctx_ref_id, target_batch, note)
  ON CONFLICT DO NOTHING;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_invoice_item_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_type public.invoice_type;
  delta NUMERIC;
  updated_qty NUMERIC;
  batch_rec RECORD;
  mv_type public.stock_movement_type;
BEGIN
  IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  SELECT type INTO inv_type FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN delta := -NEW.quantity; mv_type := 'sale';
  ELSIF inv_type = 'sale_return' THEN delta := NEW.quantity; mv_type := 'adjustment_in';
  ELSIF inv_type = 'purchase_return' THEN delta := -NEW.quantity; mv_type := 'adjustment_out';
  ELSIF inv_type = 'purchase' THEN
    -- The batch row itself is created with its received quantity, or credited via
    -- credit_batch_quantity() for a reused batch (see that function) — either path
    -- already lets sync_item_stock_from_batches() log the movement. Nothing to do here.
    RETURN NEW;
  ELSE RETURN NEW;
  END IF;

  -- Tell the nested sync_item_stock_from_batches() (fired by the UPDATE below) to
  -- label its row with the real type and link it back to this invoice line, instead
  -- of inserting a second, separate row here (which double-counted every movement).
  PERFORM set_config('app.stock_movement_reference_id', NEW.id::text, true);
  PERFORM set_config('app.stock_movement_type', mv_type::text, true);

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

  RETURN NEW;
END;
$function$;

-- Lets the client credit an existing (reused) batch on a purchase and, in the SAME
-- transaction, tag the resulting sync_item_stock_from_batches() row with the invoice
-- line it belongs to — the client previously did a plain `.update()` here, which left
-- that row generic and unlinked (no way to pass transaction-local context across two
-- separate REST calls otherwise).
CREATE OR REPLACE FUNCTION public.credit_batch_quantity(p_batch_id UUID, p_qty NUMERIC, p_reference_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.batches b WHERE b.id = p_batch_id AND public.is_business_member(auth.uid(), b.business_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.stock_movement_reference_id', p_reference_id::text, true);
  PERFORM set_config('app.stock_movement_type', 'purchase', true);

  UPDATE public.batches SET quantity = quantity + p_qty WHERE id = p_batch_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.credit_batch_quantity(UUID, NUMERIC, UUID) TO authenticated;

-- Clean up the duplicate rows inserted directly by the now-replaced version of
-- handle_invoice_item_batch() during this session's live testing. Before this
-- migration, sync_item_stock_from_batches() never produced type='sale'/'purchase'
-- with batch_id set, so any such row that already exists is unambiguously one of
-- those stray duplicates.
DELETE FROM public.stock_movements
WHERE type IN ('sale', 'purchase') AND batch_id IS NOT NULL;
