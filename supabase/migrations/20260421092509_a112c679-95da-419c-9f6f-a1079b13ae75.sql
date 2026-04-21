-- Enums for invoicing
CREATE TYPE public.invoice_type AS ENUM ('sale', 'purchase', 'sale_return', 'purchase_return', 'quotation', 'credit_note', 'debit_note');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'unpaid', 'partial', 'paid', 'overdue', 'cancelled');

-- Invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  type public.invoice_type NOT NULL DEFAULT 'sale',
  status public.invoice_status NOT NULL DEFAULT 'unpaid',
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  -- Party snapshot for inter/intra-state detection
  party_state_code TEXT,
  is_inter_state BOOLEAN NOT NULL DEFAULT false,
  -- Totals
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  igst_amount NUMERIC NOT NULL DEFAULT 0,
  round_off NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  balance_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, type, invoice_number)
);

CREATE INDEX idx_invoices_business ON public.invoices(business_id);
CREATE INDEX idx_invoices_party ON public.invoices(party_id);
CREATE INDEX idx_invoices_date ON public.invoices(invoice_date);

-- Invoice line items
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  discount_pct NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  taxable_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_item ON public.invoice_items(item_id);

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invoices" ON public.invoices FOR SELECT USING (is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create invoices" ON public.invoices FOR INSERT WITH CHECK (is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update invoices" ON public.invoices FOR UPDATE USING (is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete invoices" ON public.invoices FOR DELETE USING (
  has_role(auth.uid(), business_id, 'owner') OR has_role(auth.uid(), business_id, 'staff')
);

CREATE POLICY "Members view invoice items" ON public.invoice_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_business_member(auth.uid(), i.business_id))
);
CREATE POLICY "Members create invoice items" ON public.invoice_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_business_member(auth.uid(), i.business_id))
);
CREATE POLICY "Members update invoice items" ON public.invoice_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_business_member(auth.uid(), i.business_id))
);
CREATE POLICY "Members delete invoice items" ON public.invoice_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_business_member(auth.uid(), i.business_id))
);

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create stock movements when invoice items are inserted on sale/purchase invoices
CREATE OR REPLACE FUNCTION public.handle_invoice_item_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_type public.invoice_type;
  inv_business UUID;
  inv_creator UUID;
  mv_type public.stock_movement_type;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;

  SELECT type, business_id, created_by INTO inv_type, inv_business, inv_creator
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF inv_type = 'sale' THEN mv_type := 'sale';
  ELSIF inv_type = 'purchase' THEN mv_type := 'purchase';
  ELSIF inv_type = 'sale_return' THEN mv_type := 'adjustment_in';
  ELSIF inv_type = 'purchase_return' THEN mv_type := 'adjustment_out';
  ELSE RETURN NEW; -- quotation / notes don't move stock
  END IF;

  -- Only product items affect stock
  IF EXISTS (SELECT 1 FROM public.items WHERE id = NEW.item_id AND type = 'product') THEN
    INSERT INTO public.stock_movements (business_id, item_id, type, quantity, reference_id, notes, created_by)
    VALUES (inv_business, NEW.item_id, mv_type, NEW.quantity, NEW.invoice_id, 'Invoice ' || NEW.invoice_id, inv_creator);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_item_stock_trigger
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_item_stock();

-- Payments table
CREATE TYPE public.payment_method AS ENUM ('cash', 'bank', 'upi', 'cheque', 'card', 'other');
CREATE TYPE public.payment_direction AS ENUM ('in', 'out');

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  direction public.payment_direction NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'cash',
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_business ON public.payments(business_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_party ON public.payments(party_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view payments" ON public.payments FOR SELECT USING (is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create payments" ON public.payments FOR INSERT WITH CHECK (is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update payments" ON public.payments FOR UPDATE USING (is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners delete payments" ON public.payments FOR DELETE USING (has_role(auth.uid(), business_id, 'owner'));

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update invoice paid/balance/status when payment is added
CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv RECORD;
  new_paid NUMERIC;
  new_balance NUMERIC;
  new_status public.invoice_status;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  new_paid := inv.paid_amount + NEW.amount;
  new_balance := inv.total_amount - new_paid;

  IF new_balance <= 0 THEN new_status := 'paid';
  ELSIF new_paid > 0 THEN new_status := 'partial';
  ELSE new_status := 'unpaid';
  END IF;

  UPDATE public.invoices
  SET paid_amount = new_paid, balance_amount = new_balance, status = new_status
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_to_invoice_trigger
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_payment_to_invoice();

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL DEFAULT 'cash',
  description TEXT,
  reference TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_business ON public.expenses(business_id);
CREATE INDEX idx_expenses_date ON public.expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view expenses" ON public.expenses FOR SELECT USING (is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create expenses" ON public.expenses FOR INSERT WITH CHECK (is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update expenses" ON public.expenses FOR UPDATE USING (is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete expenses" ON public.expenses FOR DELETE USING (
  has_role(auth.uid(), business_id, 'owner') OR has_role(auth.uid(), business_id, 'staff')
);

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();