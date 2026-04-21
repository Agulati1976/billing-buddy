-- Create item type enum
CREATE TYPE public.item_type AS ENUM ('product', 'service');

-- Create items table
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.item_type NOT NULL DEFAULT 'product',
  sku TEXT,
  hsn_code TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  sale_price NUMERIC NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  opening_stock NUMERIC NOT NULL DEFAULT 0,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  low_stock_alert NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create stock movements table
CREATE TYPE public.stock_movement_type AS ENUM ('opening', 'purchase', 'sale', 'adjustment_in', 'adjustment_out', 'damage', 'transfer');

CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  quantity NUMERIC NOT NULL,
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_items_business ON public.items(business_id);
CREATE INDEX idx_stock_movements_item ON public.stock_movements(item_id);
CREATE INDEX idx_stock_movements_business ON public.stock_movements(business_id);

-- Enable RLS
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- RLS for items
CREATE POLICY "Members view items" ON public.items
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create items" ON public.items
  FOR INSERT WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update items" ON public.items
  FOR UPDATE USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete items" ON public.items
  FOR DELETE USING (
    public.has_role(auth.uid(), business_id, 'owner'::app_role) OR
    public.has_role(auth.uid(), business_id, 'staff'::app_role)
  );

-- RLS for stock_movements
CREATE POLICY "Members view stock movements" ON public.stock_movements
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create stock movements" ON public.stock_movements
  FOR INSERT WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners delete stock movements" ON public.stock_movements
  FOR DELETE USING (public.has_role(auth.uid(), business_id, 'owner'::app_role));

-- Trigger to update timestamps on items
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when item is created with opening stock, set current_stock and log movement
CREATE OR REPLACE FUNCTION public.handle_new_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.current_stock := NEW.opening_stock;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_initial_stock
  BEFORE INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_item();

-- Trigger: log opening stock movement after item insert
CREATE OR REPLACE FUNCTION public.log_opening_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'product' AND NEW.opening_stock <> 0 THEN
    INSERT INTO public.stock_movements (business_id, item_id, type, quantity, notes, created_by)
    VALUES (NEW.business_id, NEW.id, 'opening', NEW.opening_stock, 'Opening stock', NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_item_opening_stock
  AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.log_opening_stock();

-- Trigger: when stock movement is added, update item current_stock
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC;
BEGIN
  -- Skip 'opening' since it's already counted
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

  UPDATE public.items
  SET current_stock = current_stock + delta
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER apply_stock_movement_trigger
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();