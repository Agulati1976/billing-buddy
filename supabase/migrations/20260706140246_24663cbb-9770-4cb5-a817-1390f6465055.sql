-- Repair existing negative stock values before enabling strict guards
UPDATE public.batches
SET quantity = 0
WHERE quantity < 0;

UPDATE public.items
SET current_stock = 0
WHERE current_stock < 0;

UPDATE public.items
SET opening_stock = 0
WHERE opening_stock < 0;

-- Validate direct item writes cannot store negative stock
CREATE OR REPLACE FUNCTION public.prevent_negative_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.opening_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Opening stock cannot be negative.' USING ERRCODE = '23514';
  END IF;

  IF COALESCE(NEW.current_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Out of stock: stock cannot go negative. Available stock is %.', GREATEST(COALESCE(OLD.current_stock, 0), 0)
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_items_prevent_negative_stock ON public.items;
CREATE TRIGGER trg_items_prevent_negative_stock
BEFORE INSERT OR UPDATE OF opening_stock, current_stock ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_negative_item_stock();

-- Validate direct batch writes cannot store negative stock
CREATE OR REPLACE FUNCTION public.prevent_negative_batch_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.quantity, 0) < 0 THEN
    RAISE EXCEPTION 'Out of stock: batch stock cannot go negative. Available batch stock is %.', GREATEST(COALESCE(OLD.quantity, 0), 0)
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_batches_prevent_negative_stock ON public.batches;
CREATE TRIGGER trg_batches_prevent_negative_stock
BEFORE INSERT OR UPDATE OF quantity ON public.batches
FOR EACH ROW
EXECUTE FUNCTION public.prevent_negative_batch_stock();

-- Apply stock movements atomically and reject overdraws with clear errors
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

-- Apply invoice batch changes atomically and reject batch overdraws
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
BEGIN
  IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
  END IF;

  SELECT type INTO inv_type FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN delta := -NEW.quantity;
  ELSIF inv_type = 'purchase' THEN delta := NEW.quantity;
  ELSIF inv_type = 'sale_return' THEN delta := NEW.quantity;
  ELSIF inv_type = 'purchase_return' THEN delta := -NEW.quantity;
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

  RETURN NEW;
END;
$function$;