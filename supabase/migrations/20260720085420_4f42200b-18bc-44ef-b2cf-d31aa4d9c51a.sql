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
  ELSIF inv_type = 'sale_return' THEN delta := NEW.quantity;
  ELSIF inv_type = 'purchase_return' THEN delta := -NEW.quantity;
  ELSIF inv_type = 'purchase' THEN
    -- For purchases, the batch row itself is created with its received quantity.
    -- Do NOT add to the batch quantity again here (that caused double-stock).
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

  RETURN NEW;
END;
$function$;