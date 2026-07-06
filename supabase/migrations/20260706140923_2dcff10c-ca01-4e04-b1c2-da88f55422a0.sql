CREATE OR REPLACE FUNCTION public.handle_invoice_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_type public.invoice_type;
  inv_business UUID;
  inv_creator UUID;
  mv_type public.stock_movement_type;
  is_tracked BOOLEAN;
  is_product BOOLEAN;
  item_name TEXT;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;

  SELECT type, business_id, created_by INTO inv_type, inv_business, inv_creator
  FROM public.invoices WHERE id = NEW.invoice_id;

  SELECT (type = 'product'), COALESCE(is_batch_tracked, FALSE), name
    INTO is_product, is_tracked, item_name
  FROM public.items WHERE id = NEW.item_id;

  IF NOT COALESCE(is_product, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Batch-tracked stock must always move through a selected batch.
  IF is_tracked THEN
    IF NEW.batch_id IS NULL AND inv_type IN ('sale', 'purchase', 'sale_return', 'purchase_return') THEN
      RAISE EXCEPTION 'Pick a batch for % before saving. Batch-tracked stock must be changed batch-wise.', COALESCE(item_name, NEW.item_name, 'this item')
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.batch_id IS NOT NULL THEN RETURN NEW; END IF;

  IF inv_type = 'sale' THEN mv_type := 'sale';
  ELSIF inv_type = 'purchase' THEN mv_type := 'purchase';
  ELSIF inv_type = 'sale_return' THEN mv_type := 'adjustment_in';
  ELSIF inv_type = 'purchase_return' THEN mv_type := 'adjustment_out';
  ELSE RETURN NEW;
  END IF;

  INSERT INTO public.stock_movements
    (business_id, item_id, type, quantity, reference_id, notes, created_by)
  VALUES
    (inv_business, NEW.item_id, mv_type, NEW.quantity, NEW.id,
     'Invoice line ' || NEW.id, inv_creator)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;