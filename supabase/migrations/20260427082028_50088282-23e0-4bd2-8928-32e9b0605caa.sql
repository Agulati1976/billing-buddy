-- ============== CATEGORIES ==============
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view categories" ON public.categories FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create categories" ON public.categories FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update categories" ON public.categories FOR UPDATE
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete categories" ON public.categories FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner') OR public.has_role(auth.uid(), business_id, 'staff'));

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_batch_tracked BOOLEAN NOT NULL DEFAULT false;

-- ============== WAREHOUSES ==============
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view warehouses" ON public.warehouses FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create warehouses" ON public.warehouses FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update warehouses" ON public.warehouses FOR UPDATE
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete warehouses" ON public.warehouses FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner') OR public.has_role(auth.uid(), business_id, 'staff'));

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- ============== BATCHES (strict per-batch stock) ==============
CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  mfg_date DATE,
  expiry_date DATE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, batch_number)
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view batches" ON public.batches FOR SELECT
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create batches" ON public.batches FOR INSERT
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update batches" ON public.batches FOR UPDATE
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete batches" ON public.batches FOR DELETE
  USING (public.has_role(auth.uid(), business_id, 'owner') OR public.has_role(auth.uid(), business_id, 'staff'));

CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_batches_item ON public.batches(item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON public.batches(business_id, expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL;

-- ============== TRIGGERS ==============
-- When a batch's quantity changes, sync items.current_stock for batch-tracked items.
CREATE OR REPLACE FUNCTION public.sync_item_stock_from_batches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_item UUID;
  is_tracked BOOLEAN;
  total NUMERIC;
BEGIN
  target_item := COALESCE(NEW.item_id, OLD.item_id);
  SELECT is_batch_tracked INTO is_tracked FROM public.items WHERE id = target_item;
  IF is_tracked THEN
    SELECT COALESCE(SUM(quantity), 0) INTO total FROM public.batches WHERE item_id = target_item;
    UPDATE public.items SET current_stock = total WHERE id = target_item;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batches_sync_stock ON public.batches;
CREATE TRIGGER trg_batches_sync_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.sync_item_stock_from_batches();

-- When invoice_items references a batch, adjust batch.quantity and skip the normal item-level stock movement
CREATE OR REPLACE FUNCTION public.handle_invoice_item_batch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_type public.invoice_type;
  delta NUMERIC;
BEGIN
  IF NEW.batch_id IS NULL THEN RETURN NEW; END IF;
  SELECT type INTO inv_type FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN delta := -NEW.quantity;
  ELSIF inv_type = 'purchase' THEN delta := NEW.quantity;
  ELSIF inv_type = 'sale_return' THEN delta := NEW.quantity;
  ELSIF inv_type = 'purchase_return' THEN delta := -NEW.quantity;
  ELSE RETURN NEW;
  END IF;

  UPDATE public.batches SET quantity = quantity + delta WHERE id = NEW.batch_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_batch ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_batch
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_item_batch();

-- Modify the existing handle_invoice_item_stock trigger so it skips when a batch is selected
-- (batch trigger handles those). Keep behavior identical for non-batch lines.
CREATE OR REPLACE FUNCTION public.handle_invoice_item_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_type public.invoice_type;
  inv_business UUID;
  inv_creator UUID;
  mv_type public.stock_movement_type;
  is_tracked BOOLEAN;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.batch_id IS NOT NULL THEN RETURN NEW; END IF; -- batch trigger handles this

  SELECT type, business_id, created_by INTO inv_type, inv_business, inv_creator
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN mv_type := 'sale';
  ELSIF inv_type = 'purchase' THEN mv_type := 'purchase';
  ELSIF inv_type = 'sale_return' THEN mv_type := 'adjustment_in';
  ELSIF inv_type = 'purchase_return' THEN mv_type := 'adjustment_out';
  ELSE RETURN NEW;
  END IF;

  SELECT type = 'product', is_batch_tracked INTO is_tracked, is_tracked FROM public.items WHERE id = NEW.item_id;
  IF EXISTS (SELECT 1 FROM public.items WHERE id = NEW.item_id AND type = 'product' AND is_batch_tracked = false) THEN
    INSERT INTO public.stock_movements (business_id, item_id, type, quantity, reference_id, notes, created_by)
    VALUES (inv_business, NEW.item_id, mv_type, NEW.quantity, NEW.invoice_id, 'Invoice ' || NEW.invoice_id, inv_creator);
  END IF;

  RETURN NEW;
END;
$$;