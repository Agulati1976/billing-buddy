ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS pincode_rank integer;

CREATE OR REPLACE FUNCTION public.assign_business_pincode_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pincode IS NOT NULL AND length(trim(NEW.pincode)) > 0 THEN
    IF TG_OP = 'INSERT' OR OLD.pincode IS DISTINCT FROM NEW.pincode THEN
      SELECT COUNT(*) + 1 INTO NEW.pincode_rank
      FROM public.businesses
      WHERE pincode = NEW.pincode
        AND id <> NEW.id
        AND created_at < COALESCE(NEW.created_at, now());
    END IF;
  ELSE
    NEW.pincode_rank := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_business_pincode_rank ON public.businesses;
CREATE TRIGGER trg_assign_business_pincode_rank
BEFORE INSERT OR UPDATE OF pincode ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.assign_business_pincode_rank();