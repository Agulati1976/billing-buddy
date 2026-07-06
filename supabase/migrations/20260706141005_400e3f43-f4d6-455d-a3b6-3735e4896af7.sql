REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_invoice_item_batch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_invoice_item_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_item_stock_from_batches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_negative_item_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_negative_batch_stock() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_stock_movement() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_invoice_item_batch() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_invoice_item_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_item_stock_from_batches() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_negative_item_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_negative_batch_stock() TO service_role;