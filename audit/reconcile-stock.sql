-- Operator-reviewed, one-off reconciliation of confirmed TEST DATA.
-- Template inputs are supplied by prepare-stock-reconciliation.mjs. Never run
-- against customer inventory without obtaining authoritative physical counts.
-- Old movements and batches remain intact. Corrections explicitly record the
-- old ledger and item balances, batch authority, and reconciliation run UUID.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.items,public.batches,public.stock_movements IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE reconciliation_plan ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset('__APPROVED_PLAN_JSON__'::jsonb)
 AS p(id uuid,business_id uuid,current_stock numeric,batch_quantity numeric,ledger_quantity numeric,movement_count integer,batch_count integer);
DO $$
DECLARE p record; item public.items; ledger numeric; batches numeric;
BEGIN
 IF (SELECT count(*) FROM reconciliation_plan)<>6 THEN RAISE EXCEPTION 'Expected exactly six reviewed test items'; END IF;
 FOR p IN SELECT * FROM reconciliation_plan LOOP
  SELECT * INTO STRICT item FROM public.items WHERE id=p.id;
  SELECT coalesce(sum(quantity),0) INTO batches FROM public.batches WHERE item_id=p.id;
  SELECT coalesce(sum(CASE WHEN type IN ('opening','purchase','adjustment_in') THEN quantity ELSE -quantity END),0) INTO ledger FROM public.stock_movements WHERE item_id=p.id;
  IF item.business_id<>p.business_id OR item.type<>'product' OR NOT item.is_batch_tracked
   OR item.current_stock<>p.current_stock OR batches<>p.batch_quantity OR ledger<>p.ledger_quantity
   OR (SELECT count(*) FROM public.stock_movements WHERE item_id=p.id)<>p.movement_count
   OR (SELECT count(*) FROM public.batches WHERE item_id=p.id)<>p.batch_count
   OR batches<0 THEN RAISE EXCEPTION 'Reconciliation precondition changed for %; investigate again',p.id; END IF;
 END LOOP;
END $$;
-- The six ledger repairs must not apply their quantities a second time to the
-- already-counted batches. The table locks block other inventory writers until
-- this transaction restores the triggers and commits (or rolls back on error).
ALTER TABLE public.stock_movements DISABLE TRIGGER trg_stock_movements_apply;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.items'::regclass AND tgname='guard_inventory_fields') THEN
  ALTER TABLE public.items DISABLE TRIGGER guard_inventory_fields;
 END IF;
END $$;
INSERT INTO public.stock_movements(business_id,item_id,type,quantity,notes)
 SELECT business_id,id,
  CASE WHEN batch_quantity>ledger_quantity THEN 'adjustment_in' ELSE 'adjustment_out' END::public.stock_movement_type,
  abs(batch_quantity-ledger_quantity),
  'TEST DATA reconciliation __RUN_ID__; user confirmed test data; existing batches are authority. Ledger-only correction; old ledger='||ledger_quantity||', old item='||current_stock||', verified batch total='||batch_quantity||'. Original movements preserved.'
 FROM reconciliation_plan WHERE batch_quantity<>ledger_quantity;
UPDATE public.items i SET current_stock=p.batch_quantity FROM reconciliation_plan p
 WHERE i.id=p.id AND i.current_stock<>p.batch_quantity;
ALTER TABLE public.stock_movements ENABLE TRIGGER trg_stock_movements_apply;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.items'::regclass AND tgname='guard_inventory_fields') THEN
  ALTER TABLE public.items ENABLE TRIGGER guard_inventory_fields;
 END IF;
 IF EXISTS(SELECT 1 FROM reconciliation_plan p JOIN public.items i ON i.id=p.id WHERE i.current_stock<>p.batch_quantity
  OR (SELECT coalesce(sum(CASE WHEN s.type IN ('opening','purchase','adjustment_in') THEN s.quantity ELSE -s.quantity END),0) FROM public.stock_movements s WHERE s.item_id=p.id)<>p.batch_quantity)
 THEN RAISE EXCEPTION 'Reconciled balances failed verification'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.items'::regclass,'public.stock_movements'::regclass) AND tgname IN ('guard_inventory_fields','trg_stock_movements_apply') AND tgenabled<>'O') THEN
  RAISE EXCEPTION 'Inventory trigger was not restored';
 END IF;
END $$;
SELECT '__RUN_ID__' run_id,count(*)::int reconciled_items,
 count(*) FILTER(WHERE current_stock<>batch_quantity)::int item_totals_changed,
 count(*) FILTER(WHERE ledger_quantity<>batch_quantity)::int ledger_corrections FROM reconciliation_plan;
__FINALIZE__;
