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
  mv_type public.stock_movement_type;
  note TEXT;
  batch_label TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.quantity, 0);
    target_item := NEW.item_id;
    target_business := NEW.business_id;
    batch_label := COALESCE(NULLIF(NEW.batch_number, ''), 'batch');
    note := 'Batch ' || batch_label
            || COALESCE(' added (exp ' || NEW.expiry_date::text || ')', ' added');
  ELSIF TG_OP = 'UPDATE' THEN
    delta := COALESCE(NEW.quantity, 0) - COALESCE(OLD.quantity, 0);
    target_item := NEW.item_id;
    target_business := NEW.business_id;
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
    batch_label := COALESCE(NULLIF(OLD.batch_number, ''), 'batch');
    note := 'Batch ' || batch_label || ' removed';
  END IF;

  IF delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF delta > 0 THEN
    mv_type := 'adjustment_in';
  ELSE
    mv_type := 'adjustment_out';
  END IF;

  INSERT INTO public.stock_movements
    (business_id, item_id, type, quantity, notes)
  VALUES
    (target_business, target_item, mv_type, ABS(delta), note);

  RETURN COALESCE(NEW, OLD);
END;
$function$;