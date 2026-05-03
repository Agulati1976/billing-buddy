
-- Attach triggers to auto-update inventory from invoices

-- 1. New item: set current_stock = opening_stock + log opening movement
DROP TRIGGER IF EXISTS trg_handle_new_item ON public.items;
CREATE TRIGGER trg_handle_new_item
BEFORE INSERT ON public.items
FOR EACH ROW EXECUTE FUNCTION public.handle_new_item();

DROP TRIGGER IF EXISTS trg_log_opening_stock ON public.items;
CREATE TRIGGER trg_log_opening_stock
AFTER INSERT ON public.items
FOR EACH ROW EXECUTE FUNCTION public.log_opening_stock();

-- 2. Stock movements adjust item stock
DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 3. Invoice items adjust stock (non-batch) and batches (batch-tracked)
DROP TRIGGER IF EXISTS trg_handle_invoice_item_stock ON public.invoice_items;
CREATE TRIGGER trg_handle_invoice_item_stock
AFTER INSERT ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_item_stock();

DROP TRIGGER IF EXISTS trg_handle_invoice_item_batch ON public.invoice_items;
CREATE TRIGGER trg_handle_invoice_item_batch
AFTER INSERT ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_item_batch();

-- 4. Batch quantity changes sync item stock
DROP TRIGGER IF EXISTS trg_sync_item_stock_from_batches ON public.batches;
CREATE TRIGGER trg_sync_item_stock_from_batches
AFTER INSERT OR UPDATE OR DELETE ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.sync_item_stock_from_batches();

-- 5. Payments auto-apply to invoices
DROP TRIGGER IF EXISTS trg_apply_payment_to_invoice ON public.payments;
CREATE TRIGGER trg_apply_payment_to_invoice
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_payment_to_invoice();
