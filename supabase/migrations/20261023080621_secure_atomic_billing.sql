-- Additive stabilization migration. Never replay the historical migrations to deploy this.
-- Application and edge functions in this release use the transaction RPCs below.
BEGIN;

-- These legacy public plans stored marketing text rather than enforceable settings.
-- Convert only the known array definitions; preserve explicit operator-set limits.
UPDATE public.subscription_plans SET
 features=jsonb_build_object('pos',price_inr>0,'multi_branch',price_inr>0,'barcode',price_inr>0,'batch_tracking',price_inr>0,'quick_invoices',price_inr>0,'party_ledger',price_inr>0,'reports_export',price_inr>0,'custom_branding',price_inr>0,'loyalty',price_inr>0,'staff_accounts',price_inr>0,'ai_insights',price_inr>0,'priority_support',price_inr>0),
 limits=jsonb_build_object('max_invoices_per_month',CASE WHEN price_inr=0 THEN 50 ELSE 0 END,'max_users',CASE upper(code) WHEN 'FREE' THEN 1 WHEN 'PRO' THEN 5 ELSE 0 END,'max_businesses',CASE WHEN price_inr=0 THEN 1 ELSE 0 END)||coalesce(limits,'{}')
WHERE upper(code) IN ('FREE','PRO','PREMIUM') AND jsonb_typeof(features)='array';

CREATE TABLE public.business_operations (
  id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES public.businesses(id),
  user_id uuid NOT NULL, kind text NOT NULL, payload_hash text NOT NULL,
  result jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.business_operations TO service_role;
CREATE TABLE public.function_usage (
  business_id uuid NOT NULL REFERENCES public.businesses(id), user_id uuid NOT NULL,
  feature text NOT NULL, usage_date date NOT NULL, uses integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id,user_id,feature,usage_date)
);
ALTER TABLE public.function_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.function_usage FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.function_usage TO service_role;

ALTER TABLE public.invoice_items ADD COLUMN source_line_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_items ADD COLUMN unit_cost numeric;
ALTER TABLE public.invoice_items ADD COLUMN cost_is_estimate boolean NOT NULL DEFAULT false;
UPDATE public.invoice_items l SET unit_cost=coalesce((SELECT b.purchase_price FROM public.batches b WHERE b.id=l.batch_id),(SELECT i.purchase_price FROM public.items i WHERE i.id=l.item_id),0),cost_is_estimate=true;
-- Link unambiguous legacy returns; ambiguous historical returns require review on restore.
UPDATE public.invoice_items r SET source_line_id=(SELECT min(s.id::text)::uuid FROM public.invoice_items s WHERE s.invoice_id=v.source_invoice_id AND s.item_id IS NOT DISTINCT FROM r.item_id AND s.batch_id IS NOT DISTINCT FROM r.batch_id AND s.item_name=r.item_name HAVING count(*)=1)
FROM public.invoices v WHERE r.invoice_id=v.id AND v.source_invoice_id IS NOT NULL;
ALTER TABLE public.invoices ADD COLUMN loyalty_redeemed_points numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN loyalty_discount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN pos_session_id uuid REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
UPDATE public.payments p SET pos_session_id=i.pos_session_id FROM public.invoices i WHERE i.id=p.invoice_id;
ALTER TABLE public.stock_movements ADD COLUMN invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN invoice_number_snapshot text;
ALTER TABLE public.stock_movements ADD COLUMN operation_id uuid;
UPDATE public.stock_movements m SET invoice_id=i.invoice_id,invoice_number_snapshot=v.invoice_number
FROM public.invoice_items i JOIN public.invoices v ON v.id=i.invoice_id WHERE m.reference_id=i.id;
UPDATE public.invoices i SET loyalty_redeemed_points=t.points,loyalty_discount=t.value
FROM (SELECT invoice_id,sum(points_redeemed) points,sum(redeem_value) value FROM public.loyalty_transactions GROUP BY invoice_id) t WHERE i.id=t.invoice_id;
DROP INDEX IF EXISTS public.stock_movements_unique_ref_idx;
CREATE INDEX movement_operation_line ON public.stock_movements(operation_id,reference_id) WHERE operation_id IS NOT NULL;
CREATE UNIQUE INDEX membership_one_role ON public.user_roles(user_id,business_id);
-- A disabled member may see their own membership identity for the access screen,
-- while all business contents still require active membership.
CREATE POLICY own_membership_status ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE UNIQUE INDEX subscription_payment_once ON public.subscription_orders(cf_payment_id) WHERE cf_payment_id IS NOT NULL AND cf_payment_id<>'';

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id uuid,_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.businesses b ON b.id=r.business_id
  WHERE r.user_id=_user_id AND r.business_id=_business_id AND b.status='active' AND b.deleted_at IS NULL)
$$;

CREATE FUNCTION public.app_feature_enabled(p_business_id uuid,p_feature text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE features jsonb; override_pos boolean;
BEGIN
  SELECT p.features INTO features FROM public.business_subscriptions s JOIN public.subscription_plans p ON p.id=s.plan_id
    WHERE s.business_id=p_business_id AND s.status='active' AND (s.expires_at IS NULL OR s.expires_at>now());
  IF features IS NULL THEN SELECT p.features INTO features FROM public.subscription_plans p WHERE p.price_inr=0 AND p.is_active ORDER BY p.sort_order LIMIT 1; END IF;
  IF p_feature='pos' THEN
    SELECT pos_enabled INTO override_pos FROM public.business_features WHERE business_id=p_business_id;
    RETURN coalesce(override_pos,false) OR coalesce(features->'pos'='true'::jsonb,false);
  END IF;
  IF p_feature=ANY(ARRAY['multi_branch','barcode','batch_tracking','quick_invoices','party_ledger','reports_export','custom_branding','loyalty','staff_accounts','ai_insights','priority_support']) THEN RETURN coalesce(features->p_feature='true'::jsonb,false); END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id uuid,_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.businesses b ON b.id=r.business_id WHERE r.user_id=_user_id AND r.business_id=_business_id AND b.status='active' AND b.deleted_at IS NULL AND (r.role='owner' OR public.app_feature_enabled(b.id,'staff_accounts')))
$$;

CREATE FUNCTION public.app_has_access(p_business_id uuid,p_module text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE role_name text; allowed text[]; feature text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(auth.uid(),p_business_id) THEN RETURN false; END IF;
  SELECT role::text INTO role_name FROM public.user_roles WHERE user_id=auth.uid() AND business_id=p_business_id;
  IF role_name NOT IN ('owner','admin') THEN
    IF p_module='pos' THEN
      IF NOT EXISTS(SELECT 1 FROM public.pos_user_access WHERE business_id=p_business_id AND user_id=auth.uid()) THEN RETURN false; END IF;
    ELSE
      SELECT modules INTO allowed FROM public.staff_module_access WHERE business_id=p_business_id AND user_id=auth.uid();
      IF NOT (p_module='dashboard' OR p_module=ANY(coalesce(allowed,ARRAY[]::text[]))) THEN RETURN false; END IF;
    END IF;
  END IF;
  feature := CASE p_module WHEN 'batches' THEN 'batch_tracking' WHEN 'branches' THEN 'multi_branch' ELSE p_module END;
  RETURN public.app_feature_enabled(p_business_id,feature);
END $$;

CREATE FUNCTION public.app_is_manager(p_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_business_member(auth.uid(),p_business_id) AND EXISTS(SELECT 1 FROM public.user_roles
 WHERE business_id=p_business_id AND user_id=auth.uid() AND role IN ('owner','admin'))
$$;

CREATE FUNCTION public.invoice_module(p_type public.invoice_type)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE p_type WHEN 'sale' THEN 'sales' WHEN 'purchase' THEN 'purchases' WHEN 'sale_return' THEN 'sale_returns'
 WHEN 'purchase_return' THEN 'purchases' WHEN 'quotation' THEN 'quotations' WHEN 'non_inventory' THEN 'quick_invoices' ELSE 'sales' END
$$;

CREATE POLICY managers_update_business ON public.businesses FOR UPDATE TO authenticated
USING(public.app_is_manager(id)) WITH CHECK(public.app_is_manager(id));

CREATE FUNCTION public.app_read_access(p_business_id uuid,p_modules text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM unnest(p_modules) m WHERE public.app_has_access(p_business_id,m))
$$;

CREATE FUNCTION public.app_can_read_invoice(p_business_id uuid,p_type public.invoice_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.app_has_access(p_business_id,public.invoice_module(p_type)) OR public.app_read_access(p_business_id,ARRAY['payments','accounts','party_ledger','reports'])
 OR (p_type IN ('sale','sale_return') AND public.app_has_access(p_business_id,'pos'))
$$;

CREATE FUNCTION public.app_plan_limits(p_business_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT p.limits FROM public.business_subscriptions s JOIN public.subscription_plans p ON p.id=s.plan_id
 WHERE s.business_id=p_business_id AND s.status='active' AND (s.expires_at IS NULL OR s.expires_at>now())),
 (SELECT limits FROM public.subscription_plans WHERE price_inr=0 AND is_active ORDER BY sort_order LIMIT 1),'{}'::jsonb)
$$;

CREATE FUNCTION public.app_assert_limit(p_business_id uuid,p_limit text,p_count bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE max_count integer;
BEGIN
 max_count:=coalesce((public.app_plan_limits(p_business_id)->>p_limit)::integer,0);
 IF max_count>0 AND p_count>=max_count THEN RAISE EXCEPTION 'Plan limit reached: %. Upgrade your plan to continue.',p_limit USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION public.consume_function_quota(p_business_id uuid,p_feature text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; max_uses integer;
BEGIN
 IF p_feature NOT IN ('ocr','ai','reminder') OR NOT public.app_has_access(p_business_id,CASE WHEN p_feature='ocr' THEN 'purchases' WHEN p_feature='reminder' THEN 'payments' ELSE 'ai_insights' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_feature='ocr' AND NOT public.app_feature_enabled(p_business_id,'ai_insights') THEN RAISE EXCEPTION 'AI invoice reading is not included in this plan' USING ERRCODE='42501'; END IF;
 max_uses:=coalesce((public.app_plan_limits(p_business_id)->>'ai_requests_per_day')::integer,20);
 IF max_uses<=0 THEN max_uses:=20; END IF;
 INSERT INTO public.function_usage(business_id,user_id,feature,usage_date,uses)
 VALUES(p_business_id,auth.uid(),p_feature,(now() AT TIME ZONE 'Asia/Kolkata')::date,1)
 ON CONFLICT(business_id,user_id,feature,usage_date) DO UPDATE SET uses=function_usage.uses+1
 WHERE function_usage.uses<max_uses RETURNING uses INTO n;
 RETURN n IS NOT NULL;
END $$;

-- Validate foreign references even for direct REST and service-role operations.
CREATE FUNCTION public.validate_tenant_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE doc jsonb:=to_jsonb(NEW); biz uuid; foreign_biz uuid; field text; target text; val uuid; inv record; batch_item uuid;
BEGIN
 biz:=nullif(doc->>'business_id','')::uuid;
 IF TG_TABLE_NAME='invoice_items' THEN SELECT business_id INTO biz FROM public.invoices WHERE id=NEW.invoice_id; END IF;
 IF TG_OP='UPDATE' AND doc ? 'business_id' AND doc->>'business_id' IS DISTINCT FROM to_jsonb(OLD)->>'business_id' THEN RAISE EXCEPTION 'Business ownership cannot be changed' USING ERRCODE='23514'; END IF;
 FOR field,target IN SELECT * FROM (VALUES('invoice_id','invoices'),('source_invoice_id','invoices'),('party_id','parties'),('item_id','items'),('batch_id','batches'),('category_id','categories'),('warehouse_id','warehouses'),('branch_id','branches'),('pos_session_id','pos_sessions')) x(f,t) LOOP
  val:=nullif(doc->>field,'')::uuid;
  IF val IS NOT NULL THEN
   EXECUTE format('SELECT business_id FROM public.%I WHERE id=$1',target) INTO foreign_biz USING val;
   IF foreign_biz IS NULL OR foreign_biz IS DISTINCT FROM biz THEN RAISE EXCEPTION 'Invalid % for this business',field USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF nullif(doc->>'batch_id','') IS NOT NULL AND nullif(doc->>'item_id','') IS NOT NULL THEN
  SELECT item_id INTO batch_item FROM public.batches WHERE id=(doc->>'batch_id')::uuid;
  IF batch_item IS DISTINCT FROM (doc->>'item_id')::uuid THEN RAISE EXCEPTION 'Batch does not belong to this item' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='payments' THEN
  IF NEW.amount<=0 OR NEW.amount='NaN'::numeric THEN RAISE EXCEPTION 'Payment amount must be positive' USING ERRCODE='23514'; END IF;
  IF NEW.invoice_id IS NOT NULL THEN
   SELECT party_id,type INTO inv FROM public.invoices WHERE id=NEW.invoice_id;
   IF NEW.party_id IS DISTINCT FROM inv.party_id OR NEW.direction::text IS DISTINCT FROM (CASE WHEN inv.type IN ('purchase','sale_return') THEN 'out' ELSE 'in' END) THEN
    RAISE EXCEPTION 'Payment party or direction does not match invoice' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['invoices','invoice_items','invoice_edit_log','items','batches','stock_movements','payments','expenses','loyalty_transactions','pos_held_carts','support_tickets'] LOOP
  EXECUTE format('CREATE TRIGGER validate_tenant_links BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_links()',t);
 END LOOP;
END $$;

-- Replace permissive membership policies with module-aware access policies.
DO $$ DECLARE t text; pol record; modules text[]; write_expr text; read_expr text; BEGIN
 FOREACH t IN ARRAY ARRAY['invoices','invoice_items','invoice_edit_log','payments','items','batches','stock_movements','parties','expenses','categories','warehouses','branches','invoice_settings','loyalty_settings','loyalty_transactions','pos_sessions','pos_held_carts'] LOOP
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,t); END LOOP;
  modules:=CASE t
   WHEN 'invoices' THEN ARRAY['sales','purchases','sale_returns','quotations','quick_invoices','party_ledger','reports','pos','proforma_invoice','payments','accounts']
   WHEN 'payments' THEN ARRAY['payments','accounts','party_ledger','reports','pos','sales','purchases','quick_invoices']
   WHEN 'invoice_items' THEN ARRAY['sales','purchases','sale_returns','quotations','quick_invoices','reports','pos','proforma_invoice']
   WHEN 'items' THEN ARRAY['items','stock','batches','sales','purchases','sale_returns','pos','reports']
   WHEN 'batches' THEN ARRAY['batches','items','stock','sales','purchases','sale_returns','pos']
   WHEN 'stock_movements' THEN ARRAY['stock','items','batches','reports']
   WHEN 'parties' THEN ARRAY['customers','suppliers','party_ledger','sales','purchases','sale_returns','payments','accounts','pos','quick_invoices','quotations','loyalty']
   WHEN 'expenses' THEN ARRAY['expenses','accounts','reports']
   WHEN 'pos_sessions' THEN ARRAY['pos','accounts'] WHEN 'pos_held_carts' THEN ARRAY['pos']
   WHEN 'loyalty_settings' THEN ARRAY['loyalty','sales'] WHEN 'loyalty_transactions' THEN ARRAY['loyalty','sales']
   WHEN 'invoice_settings' THEN ARRAY['sales','purchases','pos','quotations','quick_invoices','proforma_invoice']
   ELSE ARRAY[t,'items','purchases','sales','pos'] END;
  IF t='invoices' THEN
   read_expr:='public.app_can_read_invoice(business_id,type)';write_expr:='false';
  ELSIF t='payments' THEN
   read_expr:='public.app_read_access(business_id,ARRAY[''payments'',''accounts'',''party_ledger'',''reports'']) OR EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=public.payments.invoice_id AND public.app_can_read_invoice(i.business_id,i.type))';write_expr:='false';
  ELSIF t='invoice_items' THEN
   read_expr:=format('EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND public.app_read_access(i.business_id,%L::text[]))',modules);
   write_expr:='false';
  ELSIF t='invoice_edit_log' THEN
   read_expr:='EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=public.invoice_edit_log.invoice_id AND public.app_can_read_invoice(i.business_id,i.type))';write_expr:='false';
  ELSIF t='pos_held_carts' THEN
   read_expr:='public.app_has_access(business_id,''pos'') AND (created_by=auth.uid() OR public.app_is_manager(business_id))';
   write_expr:='public.app_has_access(business_id,''pos'') AND created_by=auth.uid()';
  ELSE
   read_expr:=format('public.app_read_access(business_id,%L::text[])',modules);
   write_expr:=CASE WHEN t IN ('items','batches','stock_movements','categories','warehouses','branches','invoice_settings','loyalty_settings') THEN 'public.app_is_manager(business_id)'
    ELSE format('public.app_read_access(business_id,%L::text[])',modules) END;
  END IF;
  EXECUTE format('CREATE POLICY module_read ON public.%I FOR SELECT TO authenticated USING ((%s) OR public.is_platform_admin(auth.uid()))',t,read_expr);
  EXECUTE format('CREATE POLICY module_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',t,write_expr);
  EXECUTE format('CREATE POLICY module_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',t,write_expr,write_expr);
  EXECUTE format('CREATE POLICY manager_delete ON public.%I FOR DELETE TO authenticated USING (%s)',t,CASE WHEN t='invoice_items' THEN 'false' WHEN t='pos_held_carts' THEN read_expr ELSE 'public.app_is_manager(business_id)' END);
 END LOOP;
END $$;

CREATE FUNCTION public.guard_business_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.logo_url IS DISTINCT FROM OLD.logo_url THEN
  IF NEW.logo_url IS NOT NULL AND NOT public.app_feature_enabled(NEW.id,'custom_branding') THEN RAISE EXCEPTION 'Custom branding is not included in this plan'; END IF;
 END IF;
 IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
  IF TG_OP='UPDATE' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.status IS DISTINCT FROM OLD.status OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN RAISE EXCEPTION 'Only platform administrators can change business access' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND (NEW.owner_id<>auth.uid() OR NEW.status<>'active' OR NEW.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Invalid business owner or state' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_business_admin_fields BEFORE INSERT OR UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.guard_business_admin_fields();

CREATE FUNCTION public.member_contacts(p_business_id uuid)
RETURNS TABLE(user_id uuid,full_name text,email text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.app_is_manager(p_business_id) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.user_id,p.full_name,p.email FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.user_id WHERE r.business_id=p_business_id;
END $$;
CREATE FUNCTION public.ticket_contact(p_ticket_id uuid)
RETURNS TABLE(user_id uuid,full_name text,email text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY SELECT p.user_id,p.full_name,p.email FROM public.profiles p JOIN public.support_tickets t ON t.created_by=p.user_id
 WHERE t.id=p_ticket_id AND (t.created_by=auth.uid() OR public.is_platform_admin(auth.uid()) OR (t.assigned_to=auth.uid() AND public.is_support_staff(auth.uid())));
END $$;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('support_tickets','support_ticket_messages') LOOP
 EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
CREATE FUNCTION public.app_ticket_access(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=p_id AND (t.created_by=auth.uid() OR public.is_platform_admin(auth.uid()) OR (t.assigned_to=auth.uid() AND public.is_support_staff(auth.uid()))))
$$;
CREATE POLICY ticket_read ON public.support_tickets FOR SELECT TO authenticated USING(public.app_ticket_access(id));
CREATE POLICY ticket_create ON public.support_tickets FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND (business_id IS NULL OR public.is_business_member(auth.uid(),business_id)));
CREATE POLICY ticket_update ON public.support_tickets FOR UPDATE TO authenticated USING(public.app_ticket_access(id)) WITH CHECK(public.app_ticket_access(id));
CREATE POLICY ticket_delete ON public.support_tickets FOR DELETE TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE POLICY message_read ON public.support_ticket_messages FOR SELECT TO authenticated USING(public.app_ticket_access(ticket_id));
CREATE POLICY message_create ON public.support_ticket_messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND public.app_ticket_access(ticket_id));
CREATE POLICY message_delete ON public.support_ticket_messages FOR DELETE TO authenticated USING(public.is_platform_admin(auth.uid()));
CREATE FUNCTION public.guard_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
  IF TG_OP='INSERT' THEN
   IF NEW.assigned_to IS NOT NULL THEN RAISE EXCEPTION 'Ticket assignment is managed by support' USING ERRCODE='42501'; END IF;
  ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN RAISE EXCEPTION 'Ticket assignment is managed by support' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_support_ticket BEFORE INSERT OR UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.guard_support_ticket();
CREATE FUNCTION public.guard_support_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.app_ticket_access(NEW.ticket_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF length(trim(NEW.message))=0 OR length(NEW.message)>20000 THEN RAISE EXCEPTION 'Message must contain 1 to 20000 characters' USING ERRCODE='23514'; END IF;
 NEW.sender_id:=auth.uid();
 NEW.sender_role:=CASE WHEN public.is_platform_admin(auth.uid()) THEN 'admin'::public.support_sender_role
  WHEN public.is_support_staff(auth.uid()) AND EXISTS(SELECT 1 FROM public.support_tickets WHERE id=NEW.ticket_id AND assigned_to=auth.uid()) THEN 'staff'::public.support_sender_role ELSE 'customer'::public.support_sender_role END;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_support_message BEFORE INSERT ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.guard_support_message();

CREATE FUNCTION public.process_subscription_payment(p_order_id text,p_payment_id text,p_status text,p_amount numeric,p_currency text,p_method text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.subscription_orders; days integer; base timestamptz; result jsonb;
BEGIN
 SELECT * INTO o FROM public.subscription_orders WHERE cf_order_id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order'; END IF;
 IF o.mode<>'production' THEN RETURN jsonb_build_object('sandbox',true,'activated',false); END IF;
 IF p_status NOT IN ('PAID','FAILED','DROPPED') OR p_payment_id IS NULL OR p_payment_id='' THEN RAISE EXCEPTION 'Invalid payment status or identity'; END IF;
 IF o.status='PAID' THEN
  IF p_status='PAID' AND (p_amount IS DISTINCT FROM o.order_amount OR p_currency IS DISTINCT FROM o.order_currency) THEN RAISE EXCEPTION 'Paid order amount mismatch'; END IF;
  RETURN jsonb_build_object('activated',true,'already_processed',true);
 END IF;
 IF p_status<>'PAID' THEN
  UPDATE public.subscription_orders SET status=p_status,raw_response=p_payload WHERE id=o.id;
  INSERT INTO public.cashfree_webhook_events(event_type,cf_order_id,signature_verified,payload,processed) VALUES(coalesce(p_payload->>'type','ORDER_VERIFIED'),p_order_id,true,coalesce(p_payload,'{}'),true);
  RETURN jsonb_build_object('activated',false);
 END IF;
 IF p_amount IS DISTINCT FROM o.order_amount OR p_currency IS DISTINCT FROM o.order_currency THEN RAISE EXCEPTION 'Payment amount or currency mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o.business_id::text,0));
 SELECT duration_days INTO days FROM public.subscription_plans WHERE id=o.plan_id;
 IF days IS NULL OR days<=0 THEN RAISE EXCEPTION 'Order plan is unavailable'; END IF;
 SELECT greatest(coalesce(expires_at,now()),now()) INTO base FROM public.business_subscriptions WHERE business_id=o.business_id FOR UPDATE;
 base:=coalesce(base,now());
 INSERT INTO public.business_subscriptions(business_id,plan_id,status,started_at,expires_at,last_order_id)
 VALUES(o.business_id,o.plan_id,'active',now(),base+make_interval(days=>days),o.id)
 ON CONFLICT(business_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',expires_at=excluded.expires_at,last_order_id=o.id;
 UPDATE public.subscription_orders SET status='PAID',cf_payment_id=p_payment_id,payment_method=p_method,paid_at=now(),raw_response=p_payload WHERE id=o.id;
 INSERT INTO public.cashfree_webhook_events(event_type,cf_order_id,signature_verified,payload,processed) VALUES(coalesce(p_payload->>'type','ORDER_VERIFIED'),p_order_id,true,coalesce(p_payload,'{}'),true);
 RETURN jsonb_build_object('activated',true,'already_processed',false);
END $$;

REVOKE ALL ON FUNCTION public.process_subscription_payment(text,text,text,numeric,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_payment(text,text,text,numeric,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_has_access(uuid,text),public.consume_function_quota(uuid,text),public.member_contacts(uuid),public.ticket_contact(uuid) TO authenticated;

ALTER TABLE public.invoices ADD COLUMN loyalty_earn_rate numeric NOT NULL DEFAULT 0;
UPDATE public.invoices i SET loyalty_earn_rate=s.amount_per_point FROM public.loyalty_settings s WHERE s.business_id=i.business_id AND i.type='sale';
DROP TRIGGER IF EXISTS trg_invoice_items_stock ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_invoice_items_batch ON public.invoice_items;
REVOKE INSERT,UPDATE,DELETE ON public.invoices,public.invoice_items,public.invoice_edit_log,public.payments,public.stock_movements,public.loyalty_transactions FROM authenticated,anon;
-- Retire the legacy batch-credit RPC, which accepts any member without module,
-- manager, idempotency, or linked-invoice validation.
REVOKE ALL ON FUNCTION public.credit_batch_quantity(uuid,numeric,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_batch_quantity(uuid,numeric,uuid) FROM PUBLIC,authenticated,anon;

CREATE FUNCTION public.app_start_operation(p_id uuid,p_business_id uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op public.business_operations; fingerprint text:=md5(p_payload::text);
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_business_member(auth.uid(),p_business_id) THEN RAISE EXCEPTION 'Business access denied' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'Operation ID is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text,0));
 SELECT * INTO op FROM public.business_operations WHERE id=p_id;
 IF FOUND THEN
  IF op.business_id<>p_business_id OR op.user_id<>auth.uid() OR op.kind<>p_kind OR op.payload_hash<>fingerprint THEN RAISE EXCEPTION 'Operation ID was already used for a different request' USING ERRCODE='23514'; END IF;
  RETURN op.result;
 END IF;
 INSERT INTO public.business_operations(id,business_id,user_id,kind,payload_hash) VALUES(p_id,p_business_id,auth.uid(),p_kind,fingerprint);
 RETURN NULL;
END $$;
CREATE FUNCTION public.app_finish_operation(p_id uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE public.business_operations SET result=p_result WHERE id=p_id; RETURN p_result; END $$;

-- Batch changes log one immutable movement. Deletion records the batch label but no dangling FK.
CREATE OR REPLACE FUNCTION public.sync_item_stock_from_batches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta numeric; row_batch public.batches; movement_type public.stock_movement_type; inv_id uuid; ref_id uuid; op_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN row_batch:=OLD; delta:=-OLD.quantity;
 ELSIF TG_OP='INSERT' THEN row_batch:=NEW; delta:=NEW.quantity;
 ELSE row_batch:=NEW; delta:=NEW.quantity-OLD.quantity; END IF;
 IF delta=0 THEN RETURN coalesce(NEW,OLD); END IF;
 movement_type:=coalesce(nullif(current_setting('app.stock_movement_type',true),''),CASE WHEN delta>0 THEN 'adjustment_in' ELSE 'adjustment_out' END)::public.stock_movement_type;
 inv_id:=nullif(current_setting('app.stock_invoice_id',true),'')::uuid;
 ref_id:=nullif(current_setting('app.stock_movement_reference_id',true),'')::uuid;
 op_id:=nullif(current_setting('app.stock_operation_id',true),'')::uuid;
 INSERT INTO public.stock_movements(business_id,item_id,type,quantity,reference_id,batch_id,invoice_id,invoice_number_snapshot,operation_id,notes,created_by)
 VALUES(row_batch.business_id,row_batch.item_id,movement_type,abs(delta),ref_id,CASE WHEN TG_OP='DELETE' THEN NULL ELSE row_batch.id END,inv_id,
 (SELECT invoice_number FROM public.invoices WHERE id=inv_id),op_id,'Batch '||row_batch.batch_number||CASE WHEN TG_OP='DELETE' THEN ' removed' ELSE ' quantity changed' END,auth.uid());
 RETURN coalesce(NEW,OLD);
END $$;

CREATE FUNCTION public.app_apply_invoice_stock(p_invoice_id uuid,p_sign integer,p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices; line public.invoice_items; product public.items; delta numeric; kind public.stock_movement_type;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=p_invoice_id;
 IF inv.type NOT IN ('sale','purchase','sale_return','purchase_return') THEN RETURN; END IF;
 FOR line IN SELECT * FROM public.invoice_items WHERE invoice_id=p_invoice_id ORDER BY item_id,batch_id,id LOOP
  IF line.item_id IS NULL THEN CONTINUE; END IF;
  SELECT * INTO product FROM public.items WHERE id=line.item_id AND business_id=inv.business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item does not belong to this business'; END IF;
  IF product.type='service' THEN CONTINUE; END IF;
  IF line.quantity<=0 OR (NOT product.allow_decimal_qty AND trunc(line.quantity)<>line.quantity) THEN RAISE EXCEPTION 'Invalid quantity for %',product.name; END IF;
  delta:=line.quantity*p_sign*CASE WHEN inv.type IN ('purchase','sale_return') THEN 1 ELSE -1 END;
  kind:=CASE WHEN delta>0 THEN CASE WHEN inv.type='purchase' AND p_sign=1 THEN 'purchase'::public.stock_movement_type ELSE 'adjustment_in'::public.stock_movement_type END
   ELSE CASE WHEN inv.type='sale' AND p_sign=1 THEN 'sale'::public.stock_movement_type ELSE 'adjustment_out'::public.stock_movement_type END END;
  IF product.is_batch_tracked THEN
   IF line.batch_id IS NULL THEN RAISE EXCEPTION 'Pick a batch for %',product.name; END IF;
   PERFORM set_config('app.stock_movement_type',kind::text,true);
   PERFORM set_config('app.stock_movement_reference_id',line.id::text,true);
   PERFORM set_config('app.stock_invoice_id',inv.id::text,true);
   PERFORM set_config('app.stock_operation_id',p_operation_id::text,true);
   UPDATE public.batches SET quantity=quantity+delta WHERE id=line.batch_id AND item_id=line.item_id AND business_id=inv.business_id AND quantity+delta>=0;
   IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient batch stock to apply this operation for %',product.name USING ERRCODE='23514'; END IF;
   PERFORM set_config('app.stock_movement_type','',true); PERFORM set_config('app.stock_movement_reference_id','',true);
   PERFORM set_config('app.stock_invoice_id','',true); PERFORM set_config('app.stock_operation_id','',true);
  ELSE
   IF line.batch_id IS NOT NULL THEN RAISE EXCEPTION 'This item does not use batches'; END IF;
   INSERT INTO public.stock_movements(business_id,item_id,type,quantity,reference_id,invoice_id,invoice_number_snapshot,operation_id,notes,created_by)
   VALUES(inv.business_id,line.item_id,kind,abs(delta),line.id,inv.id,inv.invoice_number,p_operation_id,CASE WHEN p_sign=-1 THEN 'Invoice reversal' ELSE 'Invoice stock' END,auth.uid());
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.app_recalculate_invoice(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices; paid numeric; credits numeric; remaining numeric;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE invoice_id=p_id AND deleted_at IS NULL;
 SELECT coalesce(sum(total_amount),0) INTO credits FROM public.invoices WHERE source_invoice_id=p_id AND deleted_at IS NULL AND type IN ('sale_return','purchase_return');
 remaining:=CASE WHEN inv.deleted_at IS NOT NULL OR inv.type IN ('sale_return','purchase_return','quotation') THEN 0 ELSE greatest(0,inv.total_amount-credits-paid) END;
 UPDATE public.invoices SET paid_amount=paid,balance_amount=remaining,status=CASE
  WHEN inv.type='quotation' THEN 'draft'::public.invoice_status WHEN remaining=0 THEN 'paid'::public.invoice_status
  WHEN paid>0 OR credits>0 THEN 'partial'::public.invoice_status ELSE 'unpaid'::public.invoice_status END WHERE id=p_id;
END $$;
CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.invoice_id IS NOT NULL THEN PERFORM public.app_recalculate_invoice(OLD.invoice_id); END IF;
 IF TG_OP<>'DELETE' AND NEW.invoice_id IS NOT NULL THEN PERFORM public.app_recalculate_invoice(NEW.invoice_id); END IF;
 RETURN coalesce(NEW,OLD);
END $$;

CREATE FUNCTION public.app_sync_loyalty(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices; old_earned numeric; old_redeemed numeric; old_value numeric; earned numeric:=0; redeemed numeric:=0; value numeric:=0; returned numeric;
BEGIN
 SELECT * INTO inv FROM public.invoices WHERE id=p_id;
 IF inv.party_id IS NULL OR inv.type NOT IN ('sale','non_inventory') THEN RETURN; END IF;
 SELECT coalesce(sum(points_earned),0),coalesce(sum(points_redeemed),0),coalesce(sum(redeem_value),0)
 INTO old_earned,old_redeemed,old_value FROM public.loyalty_transactions WHERE invoice_id=p_id;
 IF inv.deleted_at IS NULL THEN
  SELECT coalesce(sum(total_amount),0) INTO returned FROM public.invoices WHERE source_invoice_id=p_id AND deleted_at IS NULL;
  IF inv.loyalty_earn_rate>0 THEN earned:=floor(greatest(0,inv.total_amount-returned)/inv.loyalty_earn_rate); END IF;
  redeemed:=inv.loyalty_redeemed_points; value:=inv.loyalty_discount;
 END IF;
 IF earned<>old_earned OR redeemed<>old_redeemed OR value<>old_value THEN
  INSERT INTO public.loyalty_transactions(business_id,party_id,invoice_id,points_earned,points_redeemed,redeem_value,notes,created_by)
  VALUES(inv.business_id,inv.party_id,inv.id,earned-old_earned,redeemed-old_redeemed,value-old_value,'Invoice lifecycle adjustment',auth.uid());
 END IF;
END $$;

CREATE FUNCTION public.app_compute_invoice(p_lines jsonb,p_gst boolean,p_interstate boolean,p_extra numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE l jsonb; lines jsonb:='[]'; qty numeric; price numeric; pct numeric; flat numeric; rate numeric; gross numeric; discount numeric; taxable numeric;
 subtotal numeric:=0; line_discount numeric:=0; line_taxable numeric:=0; line_tax numeric:=0; tax numeric; base numeric; total numeric;
BEGIN
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 OR jsonb_array_length(p_lines)>500 THEN RAISE EXCEPTION 'Provide 1 to 500 invoice lines'; END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
  qty:=coalesce((l->>'quantity')::numeric,0); price:=coalesce((l->>'price')::numeric,0); pct:=coalesce((l->>'discount_pct')::numeric,0); flat:=coalesce((l->>'discount_amount')::numeric,0);
  rate:=CASE WHEN p_gst THEN coalesce((l->>'tax_rate')::numeric,0) ELSE 0 END;
  IF qty<=0 OR price<0 OR pct<0 OR pct>100 OR flat<0 OR rate<0 OR rate>100 OR qty::text IN ('NaN','Infinity') OR price::text IN ('NaN','Infinity') OR pct::text IN ('NaN','Infinity') OR flat::text IN ('NaN','Infinity') OR rate::text IN ('NaN','Infinity') OR length(trim(coalesce(l->>'item_name','')))=0 THEN RAISE EXCEPTION 'Invalid invoice line'; END IF;
  gross:=qty*price; discount:=CASE WHEN flat>0 THEN least(flat,gross) ELSE gross*pct/100 END; taxable:=round(gross-discount,2);
  l:=l||jsonb_build_object('id',coalesce(nullif(l->>'id',''),gen_random_uuid()::text),'quantity',qty,'price',price,'discount_pct',CASE WHEN flat=0 THEN pct WHEN gross>0 THEN discount/gross*100 ELSE 0 END,
   'tax_rate',rate,'taxable_amount',taxable,'tax_amount',round(taxable*rate/100,2),'total_amount',round(taxable+taxable*rate/100,2));
  lines:=lines||jsonb_build_array(l); subtotal:=subtotal+gross; line_discount:=line_discount+gross-taxable; line_taxable:=line_taxable+taxable; line_tax:=line_tax+round(taxable*rate/100,2);
 END LOOP;
 IF p_extra<0 OR p_extra>line_taxable OR p_extra::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Overall discount exceeds the taxable amount'; END IF;
 base:=line_taxable-p_extra; tax:=CASE WHEN line_taxable>0 THEN round(line_tax*base/line_taxable,2) ELSE 0 END; total:=round(base+tax);
 RETURN jsonb_build_object('lines',lines,'subtotal',round(subtotal,2),'discount_amount',round(line_discount+p_extra,2),'extra_discount',p_extra,'taxable_total',base,'tax_amount',tax,
 'cgst_amount',CASE WHEN p_interstate THEN 0 ELSE round(tax/2,2) END,'sgst_amount',CASE WHEN p_interstate THEN 0 ELSE tax-round(tax/2,2) END,
 'igst_amount',CASE WHEN p_interstate THEN tax ELSE 0 END,'round_off',total-base-tax,'total_amount',total);
END $$;

CREATE FUNCTION public.save_invoice(p_operation_id uuid,p_invoice jsonb,p_lines jsonb,p_payments jsonb DEFAULT '[]',p_batches jsonb DEFAULT '[]',p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
<<save_invoice>>
DECLARE biz uuid:=(p_invoice->>'business_id')::uuid; invoice_id uuid:=(p_invoice->>'id')::uuid;
 old public.invoices; inv public.invoices; src public.invoices; source_line public.invoice_items; saved_line public.invoice_items; item public.items;
 unit_cost numeric; estimated_cost boolean;
 totals jsonb; l jsonb; batch jsonb; payment jsonb; result jsonb; normalized jsonb:='[]'; new_lines uuid[]:=ARRAY[]::uuid[];
 old_lines jsonb:='[]';
 is_edit boolean; is_return boolean; requested_redeem numeric:=coalesce((p_invoice->>'loyalty_redeemed_points')::numeric,0);
 points_available numeric; loyalty public.loyalty_settings; redeem_value numeric:=0; earned_rate numeric:=0;
 returned_qty numeric; sold_base numeric; factor numeric:=1; remaining numeric; paid numeric; own_refunds numeric; other_refunds numeric;
 invoice_number text:=trim(p_invoice->>'invoice_number'); suffix integer:=1; desired_type public.invoice_type:=(p_invoice->>'type')::public.invoice_type;
 inter_state boolean; gst boolean:=coalesce((p_invoice->>'is_gst')::boolean,true); party_state text; business_state text;
BEGIN
 IF invoice_id IS NULL THEN RAISE EXCEPTION 'Invoice ID is required'; END IF;
 IF NOT public.app_has_access(biz,public.invoice_module(desired_type)) AND NOT (coalesce(p_invoice->>'channel'='pos',false) AND public.app_has_access(biz,'pos')) THEN RAISE EXCEPTION 'Invoice access denied' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,biz,'save_invoice',jsonb_build_object('invoice',p_invoice,'lines',p_lines,'payments',p_payments,'batches',p_batches,'version',p_expected_updated_at));
 IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO old FROM public.invoices WHERE id=invoice_id FOR UPDATE;
 is_edit:=FOUND;
 IF is_edit THEN
  IF old.business_id<>biz OR old.type<>desired_type OR old.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Invoice does not match this business or document type'; END IF;
  IF p_expected_updated_at IS NULL OR old.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'This invoice changed. Reload it before saving.' USING ERRCODE='PT409'; END IF;
  IF old.source_invoice_id IS DISTINCT FROM nullif(p_invoice->>'source_invoice_id','')::uuid THEN RAISE EXCEPTION 'The source invoice of an existing document cannot be changed'; END IF;
  IF old.party_id IS DISTINCT FROM nullif(p_invoice->>'party_id','')::uuid AND (EXISTS(SELECT 1 FROM public.payments WHERE public.payments.invoice_id=old.id) OR EXISTS(SELECT 1 FROM public.loyalty_transactions WHERE public.loyalty_transactions.invoice_id=old.id) OR EXISTS(SELECT 1 FROM public.invoices WHERE source_invoice_id=old.id)) THEN RAISE EXCEPTION 'Party cannot change after payments, loyalty or returns have been recorded'; END IF;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Invoice no longer exists'; END IF;
  PERFORM public.app_assert_limit(biz,'max_invoices_per_month',(SELECT count(*) FROM public.invoices WHERE business_id=biz AND created_at>=(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')));
 END IF;
 IF desired_type NOT IN ('sale','purchase','sale_return','purchase_return','quotation','non_inventory') THEN RAISE EXCEPTION 'Unsupported invoice type'; END IF;
 IF invoice_number IS NULL OR invoice_number='' OR length(invoice_number)>100 THEN RAISE EXCEPTION 'A valid invoice number is required'; END IF;
 IF NOT is_edit AND coalesce((p_invoice->>'auto_number')::boolean,false) THEN
  WHILE EXISTS(SELECT 1 FROM public.invoices WHERE business_id=biz AND type=desired_type AND public.invoices.invoice_number=save_invoice.invoice_number) LOOP
   suffix:=suffix+1; invoice_number:=trim(p_invoice->>'invoice_number')||'-'||suffix;
  END LOOP;
 END IF;
 IF p_invoice->>'channel'='pos' THEN
  IF desired_type NOT IN ('sale','sale_return') THEN RAISE EXCEPTION 'POS can only create sales and linked sale returns'; END IF;
  IF NOT public.app_has_access(biz,'pos') OR NOT EXISTS(SELECT 1 FROM public.pos_sessions WHERE id=nullif(p_invoice->>'pos_session_id','')::uuid AND business_id=biz AND opened_by=auth.uid() AND closed_at IS NULL) THEN RAISE EXCEPTION 'Open your POS day before completing a sale'; END IF;
 END IF;
 IF coalesce((p_invoice->>'is_online_order')::boolean,false) AND NOT public.app_feature_enabled(biz,'multi_branch') THEN RAISE EXCEPTION 'Online branches are not included in this plan'; END IF;
 IF nullif(p_invoice->>'party_id','') IS NOT NULL THEN
  SELECT state_code INTO party_state FROM public.parties WHERE id=(p_invoice->>'party_id')::uuid AND business_id=biz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party does not belong to this business'; END IF;
 END IF;
 SELECT state_code INTO business_state FROM public.businesses WHERE id=biz;
 inter_state:=party_state IS NOT NULL AND business_state IS NOT NULL AND party_state<>business_state;
 is_return:=desired_type IN ('sale_return','purchase_return');
 IF NOT is_return AND nullif(p_invoice->>'source_invoice_id','') IS NOT NULL THEN RAISE EXCEPTION 'Only return documents may link an original invoice'; END IF;
 IF is_return THEN
  SELECT * INTO src FROM public.invoices WHERE id=nullif(p_invoice->>'source_invoice_id','')::uuid AND business_id=biz AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR src.type<>(CASE WHEN desired_type='sale_return' THEN 'sale'::public.invoice_type ELSE 'purchase'::public.invoice_type END) OR src.party_id IS DISTINCT FROM nullif(p_invoice->>'party_id','')::uuid THEN RAISE EXCEPTION 'Select the original invoice and its party for this return'; END IF;
  SELECT coalesce(sum(taxable_amount),0) INTO sold_base FROM public.invoice_items WHERE public.invoice_items.invoice_id=src.id;
  factor:=CASE WHEN sold_base>0 THEN greatest(0,sold_base-src.extra_discount)/sold_base ELSE 1 END;
 END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'Invoice lines are required'; END IF;
 IF p_payments IS NULL OR jsonb_typeof(p_payments)<>'array' OR jsonb_array_length(p_payments)>100 OR p_batches IS NULL OR jsonb_typeof(p_batches)<>'array' OR jsonb_array_length(p_batches)>500 THEN RAISE EXCEPTION 'Invalid payment or batch selection'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE nullif(x->>'id','') IS NOT NULL GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate invoice line ID'; END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
  unit_cost:=0;estimated_cost:=false;
  IF NOT is_return AND nullif(l->>'source_line_id','') IS NOT NULL THEN RAISE EXCEPTION 'Only returns may link original invoice lines'; END IF;
  IF nullif(l->>'id','') IS NOT NULL AND EXISTS(SELECT 1 FROM public.invoice_items WHERE id=(l->>'id')::uuid AND public.invoice_items.invoice_id<>save_invoice.invoice_id) THEN RAISE EXCEPTION 'Line belongs to another invoice'; END IF;
  IF nullif(l->>'item_id','') IS NOT NULL THEN
   SELECT * INTO item FROM public.items WHERE id=(l->>'item_id')::uuid AND business_id=biz;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item does not belong to this business'; END IF;
   IF item.is_batch_tracked AND desired_type NOT IN ('quotation','non_inventory') AND NOT public.app_feature_enabled(biz,'batch_tracking') THEN RAISE EXCEPTION 'Batch tracking is not included in this plan'; END IF;
   IF item.type='product' AND NOT item.allow_decimal_qty AND trunc((l->>'quantity')::numeric)<>(l->>'quantity')::numeric THEN RAISE EXCEPTION 'This item requires a whole quantity'; END IF;
   IF desired_type='sale' AND item.type='product' THEN
    SELECT * INTO saved_line FROM public.invoice_items WHERE id=nullif(l->>'id','')::uuid AND public.invoice_items.invoice_id=save_invoice.invoice_id AND item_id=item.id AND batch_id IS NOT DISTINCT FROM nullif(l->>'batch_id','')::uuid;
    IF FOUND AND saved_line.unit_cost IS NOT NULL THEN unit_cost:=saved_line.unit_cost;estimated_cost:=saved_line.cost_is_estimate;
    ELSE
     unit_cost:=item.purchase_price;
     IF nullif(l->>'batch_id','') IS NOT NULL THEN SELECT coalesce(purchase_price,item.purchase_price) INTO unit_cost FROM public.batches WHERE id=(l->>'batch_id')::uuid AND item_id=item.id AND business_id=biz; END IF;
    END IF;
   END IF;
  END IF;
  IF is_return THEN
   SELECT * INTO source_line FROM public.invoice_items WHERE id=nullif(l->>'source_line_id','')::uuid AND public.invoice_items.invoice_id=src.id;
   IF NOT FOUND OR source_line.item_id IS DISTINCT FROM nullif(l->>'item_id','')::uuid OR source_line.batch_id IS DISTINCT FROM nullif(l->>'batch_id','')::uuid THEN RAISE EXCEPTION 'Return line does not match the original invoice'; END IF;
   SELECT coalesce(sum(r.quantity),0) INTO returned_qty FROM public.invoice_items r JOIN public.invoices v ON v.id=r.invoice_id
    WHERE v.source_invoice_id=src.id AND v.deleted_at IS NULL AND v.id<>save_invoice.invoice_id
     AND (r.source_line_id=source_line.id OR (r.source_line_id IS NULL AND r.item_id IS NOT DISTINCT FROM source_line.item_id AND r.batch_id IS NOT DISTINCT FROM source_line.batch_id));
   returned_qty:=returned_qty+coalesce((SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(normalized) x WHERE x->>'source_line_id'=source_line.id::text),0);
   IF (l->>'quantity')::numeric+returned_qty>source_line.quantity THEN RAISE EXCEPTION 'Return quantity exceeds the remaining sold quantity'; END IF;
   l:=l||jsonb_build_object('price',source_line.taxable_amount/source_line.quantity*factor,'discount_pct',0,'discount_amount',0,'tax_rate',source_line.tax_rate);
   unit_cost:=coalesce(source_line.unit_cost,0);estimated_cost:=source_line.cost_is_estimate OR source_line.unit_cost IS NULL;
  END IF;
  l:=l||jsonb_build_object('unit_cost',unit_cost,'cost_is_estimate',estimated_cost);
  normalized:=normalized||jsonb_build_array(l);
 END LOOP;
 IF is_edit AND EXISTS(SELECT 1 FROM public.invoices WHERE source_invoice_id=old.id AND deleted_at IS NULL) THEN
  FOR source_line IN SELECT * FROM public.invoice_items WHERE public.invoice_items.invoice_id=old.id LOOP
   SELECT coalesce(sum(r.quantity),0) INTO returned_qty FROM public.invoice_items r JOIN public.invoices v ON v.id=r.invoice_id WHERE v.source_invoice_id=old.id AND v.deleted_at IS NULL AND (r.source_line_id=source_line.id OR (r.source_line_id IS NULL AND r.item_id IS NOT DISTINCT FROM source_line.item_id AND r.batch_id IS NOT DISTINCT FROM source_line.batch_id));
   IF returned_qty>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) x WHERE x->>'id'=source_line.id::text AND (x->>'quantity')::numeric>=returned_qty AND nullif(x->>'item_id','')::uuid IS NOT DISTINCT FROM source_line.item_id AND nullif(x->>'batch_id','')::uuid IS NOT DISTINCT FROM source_line.batch_id) THEN RAISE EXCEPTION 'An item with active returns cannot be removed or reduced below its returned quantity'; END IF;
  END LOOP;
 END IF;
 IF is_edit THEN
  SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') INTO old_lines FROM public.invoice_items i WHERE i.invoice_id=old.id;
  PERFORM public.app_apply_invoice_stock(old.id,-1,p_operation_id);
 END IF;
 -- Pending purchase batches are created with zero stock; the invoice receives their quantities once.
 IF jsonb_array_length(p_batches)>0 AND desired_type<>'purchase' THEN RAISE EXCEPTION 'New invoice batches are allowed only on purchases'; END IF;
 FOR batch IN SELECT * FROM jsonb_array_elements(p_batches) LOOP
  INSERT INTO public.batches(id,business_id,item_id,batch_number,quantity,purchase_price,sale_price,mfg_date,expiry_date,notes,created_by)
  VALUES((batch->>'id')::uuid,biz,(batch->>'item_id')::uuid,batch->>'batch_number',0,nullif(batch->>'purchase_price','')::numeric,nullif(batch->>'sale_price','')::numeric,nullif(batch->>'mfg_date','')::date,nullif(batch->>'expiry_date','')::date,batch->>'notes',auth.uid());
 END LOOP;
 SELECT * INTO loyalty FROM public.loyalty_settings WHERE business_id=biz;
 IF requested_redeem<0 OR trunc(requested_redeem)<>requested_redeem OR requested_redeem::text='NaN' THEN RAISE EXCEPTION 'Invalid loyalty redemption'; END IF;
 IF is_edit AND requested_redeem=old.loyalty_redeemed_points THEN
  redeem_value:=old.loyalty_discount;
 ELSIF requested_redeem>0 THEN
  IF NOT public.app_feature_enabled(biz,'loyalty') THEN RAISE EXCEPTION 'Loyalty is not included in this plan'; END IF;
  IF NOT coalesce(loyalty.enabled,false) OR desired_type NOT IN ('sale','non_inventory') OR nullif(p_invoice->>'party_id','') IS NULL THEN RAISE EXCEPTION 'Loyalty redemption is not available'; END IF;
  SELECT coalesce(sum(points_earned-points_redeemed),0) INTO points_available FROM public.loyalty_transactions WHERE business_id=biz AND party_id=(p_invoice->>'party_id')::uuid AND public.loyalty_transactions.invoice_id IS DISTINCT FROM save_invoice.invoice_id;
  IF requested_redeem>points_available OR points_available<loyalty.min_redeem_points THEN RAISE EXCEPTION 'Insufficient loyalty points'; END IF;
  redeem_value:=requested_redeem*loyalty.point_value;
 END IF;
 earned_rate:=CASE WHEN is_edit THEN old.loyalty_earn_rate WHEN coalesce(loyalty.enabled,false) AND public.app_feature_enabled(biz,'loyalty') THEN loyalty.amount_per_point ELSE 0 END;
 totals:=public.app_compute_invoice(normalized,gst,inter_state,coalesce((p_invoice->>'extra_discount')::numeric,0)+redeem_value);
 IF is_return THEN
  remaining:=greatest(0,src.total_amount-coalesce((SELECT sum(total_amount) FROM public.invoices WHERE source_invoice_id=src.id AND deleted_at IS NULL AND id<>save_invoice.invoice_id),0));
  -- Independent partial returns can round upwards. The last credit is capped at
  -- the remaining original value, with that rounding adjustment shown explicitly.
  IF (totals->>'total_amount')::numeric>remaining THEN totals:=totals||jsonb_build_object('total_amount',remaining,'round_off',(totals->>'round_off')::numeric+remaining-(totals->>'total_amount')::numeric); END IF;
 END IF;
 INSERT INTO public.invoices(id,business_id,party_id,type,invoice_number,invoice_date,due_date,received_date,party_state_code,is_inter_state,is_gst,is_online_order,branch_id,pos_session_id,source_invoice_id,subtotal,discount_amount,extra_discount,tax_amount,cgst_amount,sgst_amount,igst_amount,round_off,total_amount,notes,terms,created_by,loyalty_redeemed_points,loyalty_discount,loyalty_earn_rate)
 VALUES(invoice_id,biz,nullif(p_invoice->>'party_id','')::uuid,desired_type,invoice_number,(p_invoice->>'invoice_date')::date,nullif(p_invoice->>'due_date','')::date,nullif(p_invoice->>'received_date','')::date,party_state,inter_state,gst,coalesce((p_invoice->>'is_online_order')::boolean,false),nullif(p_invoice->>'branch_id','')::uuid,nullif(p_invoice->>'pos_session_id','')::uuid,nullif(p_invoice->>'source_invoice_id','')::uuid,(totals->>'subtotal')::numeric,(totals->>'discount_amount')::numeric,(totals->>'extra_discount')::numeric,(totals->>'tax_amount')::numeric,(totals->>'cgst_amount')::numeric,(totals->>'sgst_amount')::numeric,(totals->>'igst_amount')::numeric,(totals->>'round_off')::numeric,(totals->>'total_amount')::numeric,p_invoice->>'notes',p_invoice->>'terms',auth.uid(),requested_redeem,redeem_value,earned_rate)
 ON CONFLICT(id) DO UPDATE SET party_id=excluded.party_id,invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date,due_date=excluded.due_date,received_date=excluded.received_date,party_state_code=excluded.party_state_code,is_inter_state=excluded.is_inter_state,is_gst=excluded.is_gst,is_online_order=excluded.is_online_order,branch_id=excluded.branch_id,source_invoice_id=excluded.source_invoice_id,subtotal=excluded.subtotal,discount_amount=excluded.discount_amount,extra_discount=excluded.extra_discount,tax_amount=excluded.tax_amount,cgst_amount=excluded.cgst_amount,sgst_amount=excluded.sgst_amount,igst_amount=excluded.igst_amount,round_off=excluded.round_off,total_amount=excluded.total_amount,notes=excluded.notes,terms=excluded.terms,loyalty_redeemed_points=excluded.loyalty_redeemed_points,loyalty_discount=excluded.loyalty_discount;
 FOR l IN SELECT * FROM jsonb_array_elements(totals->'lines') LOOP
  INSERT INTO public.invoice_items(id,invoice_id,item_id,item_name,hsn_code,quantity,unit,price,discount_pct,tax_rate,taxable_amount,tax_amount,total_amount,batch_id,source_line_id,unit_cost,cost_is_estimate)
  VALUES((l->>'id')::uuid,invoice_id,nullif(l->>'item_id','')::uuid,l->>'item_name',l->>'hsn_code',(l->>'quantity')::numeric,l->>'unit',(l->>'price')::numeric,(l->>'discount_pct')::numeric,(l->>'tax_rate')::numeric,(l->>'taxable_amount')::numeric,(l->>'tax_amount')::numeric,(l->>'total_amount')::numeric,nullif(l->>'batch_id','')::uuid,nullif(l->>'source_line_id','')::uuid,(l->>'unit_cost')::numeric,(l->>'cost_is_estimate')::boolean)
  ON CONFLICT(id) DO UPDATE SET item_id=excluded.item_id,item_name=excluded.item_name,hsn_code=excluded.hsn_code,quantity=excluded.quantity,unit=excluded.unit,price=excluded.price,discount_pct=excluded.discount_pct,tax_rate=excluded.tax_rate,taxable_amount=excluded.taxable_amount,tax_amount=excluded.tax_amount,total_amount=excluded.total_amount,batch_id=excluded.batch_id,source_line_id=excluded.source_line_id,unit_cost=excluded.unit_cost,cost_is_estimate=excluded.cost_is_estimate;
  new_lines:=array_append(new_lines,(l->>'id')::uuid);
 END LOOP;
 DELETE FROM public.invoice_items WHERE public.invoice_items.invoice_id=save_invoice.invoice_id AND NOT (id=ANY(new_lines));
 PERFORM public.app_apply_invoice_stock(invoice_id,1,p_operation_id);
 SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE public.payments.invoice_id=save_invoice.invoice_id AND deleted_at IS NULL;
 remaining:=(totals->>'total_amount')::numeric-coalesce((SELECT sum(total_amount) FROM public.invoices WHERE source_invoice_id=save_invoice.invoice_id AND deleted_at IS NULL),0)-paid;
 IF NOT is_return AND desired_type<>'quotation' AND remaining<0 THEN RAISE EXCEPTION 'Invoice value cannot be reduced below existing payments and returns'; END IF;
 IF is_return AND paid>(totals->>'total_amount')::numeric THEN RAISE EXCEPTION 'Return value cannot be reduced below its existing refunds'; END IF;
 IF is_return THEN
  own_refunds:=paid;
  SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE public.payments.invoice_id=src.id AND deleted_at IS NULL;
  SELECT coalesce(sum(p.amount),0) INTO other_refunds FROM public.payments p JOIN public.invoices r ON r.id=p.invoice_id WHERE r.source_invoice_id=src.id AND r.deleted_at IS NULL AND p.deleted_at IS NULL;
  remaining:=least((totals->>'total_amount')::numeric-own_refunds,greatest(0,paid-src.total_amount+coalesce((SELECT sum(total_amount) FROM public.invoices WHERE source_invoice_id=src.id AND deleted_at IS NULL),0))-other_refunds);
 END IF;
 FOR payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
  IF payment->>'method'='credit' OR coalesce((payment->>'amount')::numeric,0)=0 THEN CONTINUE; END IF;
  IF (payment->>'amount')::numeric<0 OR (payment->>'amount')::numeric>remaining THEN RAISE EXCEPTION 'Payment exceeds the outstanding or refundable amount'; END IF;
  IF nullif(p_invoice->>'pos_session_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pos_sessions WHERE id=(p_invoice->>'pos_session_id')::uuid AND business_id=biz AND opened_by=auth.uid() AND closed_at IS NULL) THEN RAISE EXCEPTION 'Open your POS day before recording till payments'; END IF;
  INSERT INTO public.payments(id,business_id,party_id,invoice_id,direction,method,amount,payment_date,created_by,notes,pos_session_id)
  VALUES(coalesce(nullif(payment->>'id','')::uuid,gen_random_uuid()),biz,nullif(p_invoice->>'party_id','')::uuid,invoice_id,CASE WHEN desired_type IN ('purchase','sale_return') THEN 'out'::public.payment_direction ELSE 'in'::public.payment_direction END,(payment->>'method')::public.payment_method,(payment->>'amount')::numeric,(p_invoice->>'invoice_date')::date,auth.uid(),payment->>'notes',nullif(p_invoice->>'pos_session_id','')::uuid);
  remaining:=remaining-(payment->>'amount')::numeric;
 END LOOP;
 PERFORM public.app_recalculate_invoice(invoice_id); PERFORM public.app_sync_loyalty(invoice_id);
 IF src.id IS NOT NULL THEN PERFORM public.app_recalculate_invoice(src.id); PERFORM public.app_sync_loyalty(src.id); END IF;
 SELECT * INTO inv FROM public.invoices WHERE id=invoice_id;
 IF is_edit THEN INSERT INTO public.invoice_edit_log(invoice_id,business_id,edited_by,changes,summary) VALUES(invoice_id,biz,auth.uid(),jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(inv),'before_lines',old_lines,'after_lines',totals->'lines'),'Invoice updated atomically'); END IF;
 RETURN public.app_finish_operation(p_operation_id,to_jsonb(inv));
END $$;

CREATE FUNCTION public.record_payment(p_operation_id uuid,p_payment jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE biz uuid:=(p_payment->>'business_id')::uuid; inv public.invoices; payment public.payments; result jsonb; paid numeric; refundable numeric;
BEGIN
 IF NOT public.app_read_access(biz,ARRAY['payments','accounts','party_ledger','sales','purchases','quick_invoices','pos']) THEN RAISE EXCEPTION 'Payment access denied' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,biz,'payment',p_payment); IF result IS NOT NULL THEN RETURN result; END IF;
 IF nullif(p_payment->>'invoice_id','') IS NOT NULL THEN
  SELECT * INTO inv FROM public.invoices WHERE id=(p_payment->>'invoice_id')::uuid AND business_id=biz AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR inv.type='quotation' THEN RAISE EXCEPTION 'Select an active payable invoice'; END IF;
  IF NOT public.app_has_access(biz,public.invoice_module(inv.type)) AND NOT public.app_read_access(biz,ARRAY['payments','accounts','party_ledger']) AND NOT (inv.type IN ('sale','sale_return') AND public.app_has_access(biz,'pos')) THEN RAISE EXCEPTION 'Payment invoice access denied' USING ERRCODE='42501'; END IF;
  PERFORM public.app_recalculate_invoice(inv.id);
  SELECT * INTO inv FROM public.invoices WHERE id=inv.id;
  IF inv.type IN ('sale_return','purchase_return') THEN
   SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE invoice_id=inv.source_invoice_id AND deleted_at IS NULL;
   SELECT greatest(0,paid-s.total_amount+coalesce((SELECT sum(r.total_amount) FROM public.invoices r WHERE r.source_invoice_id=s.id AND r.deleted_at IS NULL),0))-coalesce((SELECT sum(p.amount) FROM public.payments p JOIN public.invoices r ON r.id=p.invoice_id WHERE r.source_invoice_id=s.id AND r.deleted_at IS NULL AND p.deleted_at IS NULL),0) INTO refundable FROM public.invoices s WHERE s.id=inv.source_invoice_id AND s.deleted_at IS NULL;
   IF refundable IS NULL OR (p_payment->>'amount')::numeric>least(refundable,inv.total_amount-inv.paid_amount) THEN RAISE EXCEPTION 'Payment exceeds the refundable amount'; END IF;
  ELSIF (p_payment->>'amount')::numeric>inv.balance_amount THEN RAISE EXCEPTION 'Payment exceeds outstanding balance. Record an advance separately.'; END IF;
 ELSE
  IF NOT public.app_read_access(biz,ARRAY['payments','accounts','party_ledger']) THEN RAISE EXCEPTION 'Standalone payment access denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF nullif(p_payment->>'pos_session_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pos_sessions WHERE id=(p_payment->>'pos_session_id')::uuid AND business_id=biz AND opened_by=auth.uid() AND closed_at IS NULL) THEN RAISE EXCEPTION 'Open your POS day before recording till payments'; END IF;
 INSERT INTO public.payments(id,business_id,party_id,invoice_id,direction,method,amount,payment_date,reference,notes,created_by,pos_session_id)
 VALUES(coalesce(nullif(p_payment->>'id','')::uuid,gen_random_uuid()),biz,nullif(p_payment->>'party_id','')::uuid,inv.id,(p_payment->>'direction')::public.payment_direction,(p_payment->>'method')::public.payment_method,(p_payment->>'amount')::numeric,(p_payment->>'payment_date')::date,p_payment->>'reference',p_payment->>'notes',auth.uid(),nullif(p_payment->>'pos_session_id','')::uuid) RETURNING * INTO payment;
 RETURN public.app_finish_operation(p_operation_id,to_jsonb(payment));
END $$;

CREATE FUNCTION public.change_invoice_state(p_operation_id uuid,p_invoice_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices; result jsonb; factor integer; receipt_biz uuid;
BEGIN
 SELECT business_id INTO receipt_biz FROM public.business_operations WHERE id=p_operation_id AND user_id=auth.uid();
 IF receipt_biz IS NOT NULL THEN
  IF NOT public.app_is_manager(receipt_biz) THEN RAISE EXCEPTION 'Owner or administrator access required' USING ERRCODE='42501'; END IF;
  result:=public.app_start_operation(p_operation_id,receipt_biz,'invoice_state',jsonb_build_object('id',p_invoice_id,'action',p_action));
  IF result IS NOT NULL THEN RETURN result; END IF;
 END IF;
 SELECT * INTO inv FROM public.invoices WHERE id=p_invoice_id;
 IF NOT FOUND OR NOT public.app_is_manager(inv.business_id) THEN RAISE EXCEPTION 'Owner or administrator access required' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,inv.business_id,'invoice_state',jsonb_build_object('id',p_invoice_id,'action',p_action)); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO inv FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF p_action NOT IN ('delete','restore','purge') THEN RAISE EXCEPTION 'Invalid invoice action'; END IF;
 IF p_action IN ('delete','purge') AND EXISTS(SELECT 1 FROM public.invoices WHERE source_invoice_id=inv.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Delete linked returns before deleting this invoice'; END IF;
 IF p_action='purge' THEN
  IF inv.deleted_at IS NULL THEN RAISE EXCEPTION 'Move the invoice to Deleted first'; END IF;
  DELETE FROM public.payments WHERE invoice_id=inv.id;
  DELETE FROM public.invoices WHERE id=inv.id;
 ELSE
  IF (p_action='delete' AND inv.deleted_at IS NOT NULL) OR (p_action='restore' AND inv.deleted_at IS NULL) THEN RETURN public.app_finish_operation(p_operation_id,jsonb_build_object('id',inv.id,'unchanged',true)); END IF;
  IF p_action='restore' AND inv.deleted_at<now()-interval '180 days' THEN RAISE EXCEPTION 'The restoration period has expired'; END IF;
  IF p_action='restore' AND inv.source_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=inv.source_invoice_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Restore the original invoice first'; END IF;
  -- Restoration reuses the save validator's cumulative return limit.
  IF p_action='restore' AND inv.type IN ('sale_return','purchase_return') AND EXISTS(SELECT 1 FROM public.invoice_items WHERE invoice_id=inv.id AND source_line_id IS NULL) THEN RAISE EXCEPTION 'This historical return needs its original lines reviewed before restoration'; END IF;
  IF p_action='restore' AND inv.type IN ('sale_return','purchase_return') AND EXISTS(
   SELECT 1 FROM public.invoice_items l JOIN public.invoice_items s ON s.id=l.source_line_id
   WHERE l.invoice_id=inv.id AND l.quantity+coalesce((SELECT sum(r.quantity) FROM public.invoice_items r JOIN public.invoices ri ON ri.id=r.invoice_id WHERE r.source_line_id=s.id AND ri.deleted_at IS NULL),0)>s.quantity
  ) THEN RAISE EXCEPTION 'Restoring this return would exceed the original quantity'; END IF;
  factor:=CASE WHEN p_action='delete' THEN -1 ELSE 1 END;
  PERFORM public.app_apply_invoice_stock(inv.id,factor,p_operation_id);
  UPDATE public.invoices SET deleted_at=CASE WHEN p_action='delete' THEN now() ELSE NULL END WHERE id=inv.id;
  UPDATE public.payments SET deleted_at=CASE WHEN p_action='delete' THEN now() ELSE NULL END WHERE invoice_id=inv.id;
  PERFORM public.app_recalculate_invoice(inv.id); PERFORM public.app_sync_loyalty(inv.id);
 END IF;
 IF inv.source_invoice_id IS NOT NULL THEN PERFORM public.app_recalculate_invoice(inv.source_invoice_id); PERFORM public.app_sync_loyalty(inv.source_invoice_id); END IF;
 RETURN public.app_finish_operation(p_operation_id,jsonb_build_object('id',inv.id,'action',p_action));
END $$;

CREATE FUNCTION public.adjust_stock(p_operation_id uuid,p_business_id uuid,p_item_id uuid,p_quantity numeric,p_type public.stock_movement_type,p_batch_id uuid DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.items; result jsonb; delta numeric;
BEGIN
 IF NOT public.app_is_manager(p_business_id) THEN RAISE EXCEPTION 'Inventory manager access required' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,p_business_id,'stock_adjustment',jsonb_build_object('item',p_item_id,'quantity',p_quantity,'type',p_type,'batch',p_batch_id,'notes',p_notes)); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO item FROM public.items WHERE id=p_item_id AND business_id=p_business_id FOR UPDATE;
 IF NOT FOUND OR item.type<>'product' OR p_quantity<=0 OR p_quantity::text IN ('NaN','Infinity') OR (NOT item.allow_decimal_qty AND trunc(p_quantity)<>p_quantity) OR p_type NOT IN ('adjustment_in','adjustment_out','damage','transfer') THEN RAISE EXCEPTION 'Invalid inventory adjustment'; END IF;
 delta:=p_quantity*CASE WHEN p_type='adjustment_in' THEN 1 ELSE -1 END;
 IF item.is_batch_tracked THEN
  IF p_batch_id IS NULL THEN RAISE EXCEPTION 'Select a batch'; END IF;
  PERFORM set_config('app.stock_movement_type',p_type::text,true); PERFORM set_config('app.stock_operation_id',p_operation_id::text,true);
  UPDATE public.batches SET quantity=quantity+delta WHERE id=p_batch_id AND item_id=p_item_id AND business_id=p_business_id AND quantity+delta>=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock in the selected batch'; END IF;
  PERFORM set_config('app.stock_movement_type','',true); PERFORM set_config('app.stock_operation_id','',true);
 ELSE
  INSERT INTO public.stock_movements(business_id,item_id,type,quantity,notes,created_by,operation_id) VALUES(p_business_id,p_item_id,p_type,p_quantity,p_notes,auth.uid(),p_operation_id);
 END IF;
 RETURN public.app_finish_operation(p_operation_id,jsonb_build_object('id',p_item_id,'adjusted',true));
END $$;

-- Item stock can only change through movement triggers; batch ownership is immutable.
CREATE FUNCTION public.guard_inventory_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='items' THEN
  IF TG_OP='UPDATE' AND pg_trigger_depth()=1 AND (NEW.current_stock IS DISTINCT FROM OLD.current_stock OR NEW.opening_stock IS DISTINCT FROM OLD.opening_stock) THEN RAISE EXCEPTION 'Use a stock adjustment to change inventory'; END IF;
  IF TG_OP='UPDATE' AND (NEW.type IS DISTINCT FROM OLD.type OR NEW.is_batch_tracked IS DISTINCT FROM OLD.is_batch_tracked) AND (OLD.current_stock<>0 OR EXISTS(SELECT 1 FROM public.invoice_items WHERE item_id=OLD.id) OR EXISTS(SELECT 1 FROM public.batches WHERE item_id=OLD.id)) THEN RAISE EXCEPTION 'Inventory tracking cannot change after stock or invoices exist'; END IF;
  IF NEW.type='service' AND (NEW.opening_stock<>0 OR NEW.current_stock<>0 OR NEW.is_batch_tracked) THEN RAISE EXCEPTION 'Services cannot carry stock'; END IF;
  IF TG_OP='INSERT' AND NEW.is_batch_tracked AND NEW.opening_stock<>0 THEN RAISE EXCEPTION 'Provide opening inventory through a batch'; END IF;
  IF NEW.is_batch_tracked AND (TG_OP='INSERT' OR NEW.is_batch_tracked IS DISTINCT FROM OLD.is_batch_tracked) AND NOT public.app_feature_enabled(NEW.business_id,'batch_tracking') THEN RAISE EXCEPTION 'Batch tracking is not included in this plan'; END IF;
  IF NOT NEW.allow_decimal_qty AND (trunc(NEW.opening_stock)<>NEW.opening_stock OR trunc(NEW.current_stock)<>NEW.current_stock) THEN RAISE EXCEPTION 'This item requires a whole quantity'; END IF;
  IF NEW.sale_price<0 OR NEW.purchase_price<0 OR NEW.tax_rate<0 OR NEW.tax_rate>100 OR NEW.sale_price::text IN ('NaN','Infinity') OR NEW.purchase_price::text IN ('NaN','Infinity') OR NEW.current_stock::text IN ('NaN','Infinity') OR NEW.opening_stock::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Invalid item price or stock'; END IF;
 ELSE
  IF TG_OP='DELETE' THEN
   IF EXISTS(SELECT 1 FROM public.invoice_items WHERE batch_id=OLD.id) THEN RAISE EXCEPTION 'This batch is linked to invoices. Use a stock adjustment to remove its inventory.'; END IF;
   RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.item_id IS DISTINCT FROM OLD.item_id THEN RAISE EXCEPTION 'A batch cannot move to another item'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.items WHERE id=NEW.item_id AND business_id=NEW.business_id AND type='product' AND is_batch_tracked AND (allow_decimal_qty OR trunc(NEW.quantity)=NEW.quantity)) OR NEW.quantity::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Invalid batch item or quantity'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_inventory_fields BEFORE INSERT OR UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_fields();
CREATE TRIGGER guard_inventory_fields BEFORE INSERT OR UPDATE OR DELETE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_fields();

CREATE FUNCTION public.close_pos_session(p_operation_id uuid,p_session_id uuid,p_closing_cash numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE session public.pos_sessions; result jsonb; cash numeric;
BEGIN
 SELECT * INTO session FROM public.pos_sessions WHERE id=p_session_id;
 IF NOT FOUND OR NOT public.app_has_access(session.business_id,'pos') OR (session.opened_by<>auth.uid() AND NOT public.app_is_manager(session.business_id)) THEN RAISE EXCEPTION 'Session access denied' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,session.business_id,'close_pos',jsonb_build_object('session',p_session_id,'cash',p_closing_cash)); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO session FROM public.pos_sessions WHERE id=p_session_id FOR UPDATE;
 IF session.closed_at IS NOT NULL THEN RAISE EXCEPTION 'This POS session is already closed'; END IF;
 IF p_closing_cash<0 OR p_closing_cash IS NULL OR p_closing_cash::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Invalid closing cash'; END IF;
 SELECT coalesce(sum(CASE WHEN p.direction='in' THEN p.amount ELSE -p.amount END),0) INTO cash
 FROM public.payments p LEFT JOIN public.invoices i ON i.id=p.invoice_id
 WHERE p.business_id=session.business_id AND p.pos_session_id=session.id AND p.method='cash' AND p.deleted_at IS NULL AND i.deleted_at IS NULL AND p.created_at>=session.opened_at;
 UPDATE public.pos_sessions SET closing_cash=p_closing_cash,expected_cash=opening_cash+cash,closed_at=now() WHERE id=session.id RETURNING * INTO session;
 RETURN public.app_finish_operation(p_operation_id,to_jsonb(session));
END $$;
REVOKE UPDATE ON public.pos_sessions FROM authenticated,anon;
DROP POLICY IF EXISTS "Members open session" ON public.pos_sessions;
REVOKE INSERT ON public.pos_sessions FROM authenticated,anon;
CREATE FUNCTION public.open_pos_session(p_operation_id uuid,p_business_id uuid,p_session_id uuid,p_opening_cash numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; session public.pos_sessions;
BEGIN
 IF NOT public.app_has_access(p_business_id,'pos') THEN RAISE EXCEPTION 'POS access denied' USING ERRCODE='42501'; END IF;
 IF p_opening_cash IS NULL OR p_opening_cash<0 OR p_opening_cash::text IN ('NaN','Infinity') THEN RAISE EXCEPTION 'Invalid opening cash'; END IF;
 result:=public.app_start_operation(p_operation_id,p_business_id,'open_pos',jsonb_build_object('session',p_session_id,'cash',p_opening_cash));
 IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO session FROM public.pos_sessions WHERE business_id=p_business_id AND opened_by=auth.uid() AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN RAISE EXCEPTION 'A POS session is already open. Reload to use that session'; END IF;
 INSERT INTO public.pos_sessions(id,business_id,opened_by,opening_cash) VALUES(p_session_id,p_business_id,auth.uid(),p_opening_cash) RETURNING * INTO session;
 RETURN public.app_finish_operation(p_operation_id,to_jsonb(session));
END $$;
REVOKE ALL ON FUNCTION public.open_pos_session(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_pos_session(uuid,uuid,uuid,numeric) TO authenticated;

CREATE FUNCTION public.save_item(p_operation_id uuid,p_item jsonb,p_batch jsonb DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE biz uuid:=(p_item->>'business_id')::uuid; item_id uuid:=coalesce(nullif(p_item->>'id','')::uuid,gen_random_uuid()); old public.items; saved public.items; result jsonb; opening numeric;
BEGIN
 IF NOT public.app_is_manager(biz) THEN RAISE EXCEPTION 'Inventory manager access required' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,biz,'save_item',jsonb_build_object('item',p_item,'batch',p_batch,'version',p_expected_updated_at)); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO old FROM public.items WHERE id=item_id FOR UPDATE;
 IF FOUND THEN
  IF old.business_id<>biz OR p_expected_updated_at IS NULL OR old.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Item changed. Reload before saving.' USING ERRCODE='PT409'; END IF;
  IF coalesce((p_item->>'opening_stock')::numeric,old.opening_stock)<>old.opening_stock THEN RAISE EXCEPTION 'Use a stock adjustment to change inventory'; END IF;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Item no longer exists'; END IF;
  PERFORM public.app_assert_limit(biz,'max_items',(SELECT count(*) FROM public.items WHERE business_id=biz));
 END IF;
 opening:=CASE WHEN p_item->>'type'='service' OR coalesce((p_item->>'is_batch_tracked')::boolean,false) THEN 0 ELSE coalesce((p_item->>'opening_stock')::numeric,0) END;
 IF length(trim(coalesce(p_item->>'name','')))=0 THEN RAISE EXCEPTION 'Item name is required'; END IF;
 INSERT INTO public.items(id,business_id,name,type,sku,barcode,hsn_code,unit,unit_size,sale_price,purchase_price,tax_rate,opening_stock,low_stock_alert,description,category_id,is_batch_tracked,allow_decimal_qty,brand,flavour,color,mrp,catalog_id,image_url,created_by)
 VALUES(item_id,biz,trim(p_item->>'name'),coalesce((p_item->>'type')::public.item_type,'product'),p_item->>'sku',p_item->>'barcode',p_item->>'hsn_code',coalesce(nullif(p_item->>'unit',''),'pcs'),nullif(p_item->>'unit_size','')::numeric,coalesce((p_item->>'sale_price')::numeric,0),coalesce((p_item->>'purchase_price')::numeric,0),coalesce((p_item->>'tax_rate')::numeric,0),opening,coalesce((p_item->>'low_stock_alert')::numeric,0),p_item->>'description',nullif(p_item->>'category_id','')::uuid,coalesce((p_item->>'is_batch_tracked')::boolean,false),coalesce((p_item->>'allow_decimal_qty')::boolean,false),p_item->>'brand',p_item->>'flavour',p_item->>'color',nullif(p_item->>'mrp','')::numeric,nullif(p_item->>'catalog_id','')::uuid,p_item->>'image_url',auth.uid())
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,sku=excluded.sku,barcode=excluded.barcode,hsn_code=excluded.hsn_code,unit=excluded.unit,unit_size=excluded.unit_size,sale_price=excluded.sale_price,purchase_price=excluded.purchase_price,tax_rate=excluded.tax_rate,low_stock_alert=excluded.low_stock_alert,description=excluded.description,category_id=excluded.category_id,is_batch_tracked=excluded.is_batch_tracked,allow_decimal_qty=excluded.allow_decimal_qty,brand=excluded.brand,flavour=excluded.flavour,color=excluded.color,mrp=excluded.mrp,catalog_id=excluded.catalog_id,image_url=excluded.image_url RETURNING * INTO saved;
 IF p_batch IS NOT NULL AND p_batch<>'null'::jsonb THEN
  INSERT INTO public.batches(id,business_id,item_id,batch_number,mfg_date,expiry_date,quantity,purchase_price,sale_price,created_by)
  VALUES(coalesce(nullif(p_batch->>'id','')::uuid,gen_random_uuid()),biz,saved.id,p_batch->>'batch_number',nullif(p_batch->>'mfg_date','')::date,nullif(p_batch->>'expiry_date','')::date,coalesce((p_batch->>'quantity')::numeric,0),nullif(p_batch->>'purchase_price','')::numeric,nullif(p_batch->>'sale_price','')::numeric,auth.uid());
 END IF;
 SELECT * INTO saved FROM public.items WHERE id=saved.id;
 RETURN public.app_finish_operation(p_operation_id,to_jsonb(saved));
END $$;

CREATE FUNCTION public.save_batch(p_operation_id uuid,p_batch jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE biz uuid:=(p_batch->>'business_id')::uuid; batch_id uuid:=coalesce(nullif(p_batch->>'id','')::uuid,gen_random_uuid()); old public.batches; saved public.batches; result jsonb;
BEGIN
 IF NOT public.app_is_manager(biz) OR NOT public.app_has_access(biz,'batches') THEN RAISE EXCEPTION 'Batch manager access required' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,biz,'save_batch',jsonb_build_object('batch',p_batch,'version',p_expected_updated_at)); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO old FROM public.batches WHERE id=batch_id FOR UPDATE;
 IF FOUND THEN
  IF old.business_id<>biz OR p_expected_updated_at IS NULL OR old.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Batch stock changed. Reload before saving.' USING ERRCODE='PT409'; END IF;
 ELSIF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Batch no longer exists'; END IF;
 INSERT INTO public.batches(id,business_id,item_id,batch_number,mfg_date,expiry_date,quantity,purchase_price,sale_price,notes,created_by)
 VALUES(batch_id,biz,(p_batch->>'item_id')::uuid,p_batch->>'batch_number',nullif(p_batch->>'mfg_date','')::date,nullif(p_batch->>'expiry_date','')::date,coalesce((p_batch->>'quantity')::numeric,0),nullif(p_batch->>'purchase_price','')::numeric,nullif(p_batch->>'sale_price','')::numeric,p_batch->>'notes',auth.uid())
 ON CONFLICT(id) DO UPDATE SET batch_number=excluded.batch_number,mfg_date=excluded.mfg_date,expiry_date=excluded.expiry_date,quantity=excluded.quantity,purchase_price=excluded.purchase_price,sale_price=excluded.sale_price,notes=excluded.notes RETURNING * INTO saved;
 RETURN public.app_finish_operation(p_operation_id,to_jsonb(saved));
END $$;
REVOKE UPDATE,INSERT ON public.batches FROM authenticated,anon;

CREATE FUNCTION public.delete_batch(p_operation_id uuid,p_business_id uuid,p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.app_is_manager(p_business_id) THEN RAISE EXCEPTION 'Inventory manager access required' USING ERRCODE='42501'; END IF;
 result:=public.app_start_operation(p_operation_id,p_business_id,'delete_batch',jsonb_build_object('batch',p_batch_id)); IF result IS NOT NULL THEN RETURN result; END IF;
 PERFORM set_config('app.stock_operation_id',p_operation_id::text,true);
 DELETE FROM public.batches WHERE id=p_batch_id AND business_id=p_business_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch no longer exists'; END IF;
 PERFORM set_config('app.stock_operation_id','',true);
 RETURN public.app_finish_operation(p_operation_id,jsonb_build_object('id',p_batch_id,'deleted',true));
END $$;
REVOKE ALL ON FUNCTION public.delete_batch(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_batch(uuid,uuid,uuid) TO authenticated;
REVOKE DELETE ON public.batches FROM authenticated,anon;

CREATE FUNCTION public.assign_business_staff(p_actor_id uuid,p_business_id uuid,p_user_id uuid,p_modules text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing_role public.app_role;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text,0));
 IF NOT public.is_business_member(p_actor_id,p_business_id) OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor_id AND business_id=p_business_id AND role IN ('owner','admin')) THEN RAISE EXCEPTION 'Business administrator access required' USING ERRCODE='42501'; END IF;
 SELECT role INTO existing_role FROM public.user_roles WHERE user_id=p_user_id AND business_id=p_business_id;
 IF FOUND AND existing_role<>'staff' THEN RAISE EXCEPTION 'This user already has another role in the business'; END IF;
 IF existing_role IS NULL THEN
  IF NOT public.app_feature_enabled(p_business_id,'staff_accounts') THEN RAISE EXCEPTION 'Staff accounts are not included in this plan'; END IF;
  PERFORM public.app_assert_limit(p_business_id,'max_users',(SELECT count(*) FROM public.user_roles WHERE business_id=p_business_id));
  INSERT INTO public.user_roles(user_id,business_id,role) VALUES(p_user_id,p_business_id,'staff');
 END IF;
 INSERT INTO public.staff_module_access(business_id,user_id,modules) VALUES(p_business_id,p_user_id,coalesce(p_modules,ARRAY[]::text[]))
 ON CONFLICT(business_id,user_id) DO UPDATE SET modules=excluded.modules;
END $$;
REVOKE ALL ON FUNCTION public.assign_business_staff(uuid,uuid,uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_business_staff(uuid,uuid,uuid,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_business_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_business_member(_user_id,_business_id) AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND business_id=_business_id AND role=_role)
$$;

CREATE FUNCTION public.app_business_limit(p_owner uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.businesses b JOIN public.business_subscriptions s ON s.business_id=b.id JOIN public.subscription_plans p ON p.id=s.plan_id
  WHERE b.owner_id=p_owner AND b.deleted_at IS NULL AND b.status='active' AND s.status='active' AND (s.expires_at IS NULL OR s.expires_at>now()) AND p.price_inr>0 AND coalesce((p.limits->>'max_businesses')::integer,0)=0) THEN 0
 ELSE greatest(coalesce((SELECT max((p.limits->>'max_businesses')::integer) FROM public.businesses b JOIN public.business_subscriptions s ON s.business_id=b.id JOIN public.subscription_plans p ON p.id=s.plan_id WHERE b.owner_id=p_owner AND b.deleted_at IS NULL AND s.status='active' AND (s.expires_at IS NULL OR s.expires_at>now())),1),1) END
$$;
CREATE FUNCTION public.account_business_limit()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.app_business_limit(auth.uid()) $$;

CREATE FUNCTION public.guard_plan_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE max_count integer; count_rows bigint; biz uuid; limit_name text;
BEGIN
 IF TG_TABLE_NAME='businesses' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text,1));
  max_count:=public.app_business_limit(NEW.owner_id);
  SELECT count(*) INTO count_rows FROM public.businesses WHERE owner_id=NEW.owner_id AND deleted_at IS NULL;
  IF max_count>0 AND count_rows>=max_count THEN RAISE EXCEPTION 'Your plan business limit has been reached'; END IF;
 ELSE
  biz:=NEW.business_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(biz::text,0));
  IF TG_TABLE_NAME='items' THEN
   IF NOT EXISTS(SELECT 1 FROM public.items WHERE id=NEW.id) THEN PERFORM public.app_assert_limit(biz,'max_items',(SELECT count(*) FROM public.items WHERE business_id=biz)); END IF;
  ELSIF TG_TABLE_NAME='branches' THEN
   IF NOT public.app_feature_enabled(biz,'multi_branch') THEN RAISE EXCEPTION 'Branches are not included in this plan'; END IF;
   PERFORM public.app_assert_limit(biz,'max_branches',(SELECT count(*) FROM public.branches WHERE business_id=biz));
  ELSIF TG_TABLE_NAME='user_roles' AND NEW.role<>'owner' THEN
   IF NOT public.app_feature_enabled(biz,'staff_accounts') THEN RAISE EXCEPTION 'Staff accounts are not included in this plan'; END IF;
   PERFORM public.app_assert_limit(biz,'max_users',(SELECT count(*) FROM public.user_roles WHERE business_id=biz));
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_plan_limits BEFORE INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.guard_plan_limits();
CREATE TRIGGER guard_plan_limits BEFORE INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION public.guard_plan_limits();
CREATE TRIGGER guard_plan_limits BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION public.guard_plan_limits();
CREATE TRIGGER guard_plan_limits BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_plan_limits();

CREATE FUNCTION public.guard_role_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.role='owner' AND OLD.user_id=(SELECT owner_id FROM public.businesses WHERE id=OLD.business_id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer ownership before removing the business owner'; END IF;
  IF NEW.role<>OLD.role OR NEW.user_id<>OLD.user_id OR NEW.business_id<>OLD.business_id THEN RAISE EXCEPTION 'Transfer ownership before changing the business owner'; END IF;
 END IF;
 IF TG_OP<>'DELETE' AND NEW.role='owner' AND NEW.user_id IS DISTINCT FROM (SELECT owner_id FROM public.businesses WHERE id=NEW.business_id) THEN RAISE EXCEPTION 'Only the business owner can hold the owner role'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER guard_role_fields BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_role_fields();

CREATE FUNCTION public.guard_invoice_design()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.app_feature_enabled(NEW.business_id,'custom_branding') AND coalesce(NEW.template,'classic')<>'classic' AND (TG_OP='INSERT' OR NEW.template IS DISTINCT FROM OLD.template) THEN RAISE EXCEPTION 'Custom invoice designs are not included in this plan'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_invoice_design BEFORE INSERT OR UPDATE ON public.invoice_settings FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_design();

CREATE FUNCTION public.business_entitlements(p_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE allowed jsonb; features jsonb;
BEGIN
 IF NOT public.is_business_member(auth.uid(),p_business_id) THEN RAISE EXCEPTION 'Business access denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(m),'[]') INTO allowed FROM unnest(ARRAY['dashboard','pos','sales','sale_returns','quotations','purchases','quick_invoices','proforma_invoice','customers','suppliers','party_ledger','items','stock','categories','warehouses','batches','branches','accounts','payments','expenses','loyalty','reports','ai_insights']) m WHERE public.app_has_access(p_business_id,m);
 SELECT coalesce(jsonb_object_agg(f,public.app_feature_enabled(p_business_id,f)),'{}') INTO features FROM unnest(ARRAY['pos','multi_branch','barcode','batch_tracking','quick_invoices','party_ledger','reports_export','custom_branding','loyalty','staff_accounts','ai_insights','priority_support']) f;
 RETURN jsonb_build_object('modules',allowed,'features',features,'limits',public.app_plan_limits(p_business_id));
END $$;

CREATE FUNCTION public.set_business_pincode(p_operation_id uuid,p_business_id uuid,p_pincode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE biz public.businesses; inv public.invoices; result jsonb; number_base text; next_number text; suffix integer; branch_code text; changed integer:=0;
BEGIN
 IF NOT public.app_is_manager(p_business_id) THEN RAISE EXCEPTION 'Business administrator access required' USING ERRCODE='42501'; END IF;
 IF p_pincode !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Pincode must have six digits'; END IF;
 result:=public.app_start_operation(p_operation_id,p_business_id,'pincode',jsonb_build_object('pincode',p_pincode)); IF result IS NOT NULL THEN RETURN result; END IF;
 UPDATE public.businesses SET pincode=p_pincode WHERE id=p_business_id RETURNING * INTO biz;
 -- Temporary unique numbers avoid collisions while reassigning a whole business.
 UPDATE public.invoices SET invoice_number='RENUMBER-'||id::text WHERE business_id=p_business_id AND deleted_at IS NULL;
 FOR inv IN SELECT * FROM public.invoices WHERE business_id=p_business_id AND deleted_at IS NULL ORDER BY invoice_date,created_at,id FOR UPDATE LOOP
  branch_code:=NULL;
  IF inv.is_online_order AND inv.branch_id IS NOT NULL THEN SELECT code INTO branch_code FROM public.branches WHERE id=inv.branch_id; END IF;
  number_base:=biz.pincode||'/'||lpad(biz.pincode_rank::text,3,'0')||CASE WHEN branch_code IS NULL THEN '' ELSE '/'||branch_code END||'/'||to_char(inv.invoice_date,'DDMMYY');
  next_number:=number_base;suffix:=1;
  WHILE EXISTS(SELECT 1 FROM public.invoices WHERE business_id=p_business_id AND type=inv.type AND invoice_number=next_number AND id<>inv.id) LOOP suffix:=suffix+1;next_number:=number_base||'-'||suffix;END LOOP;
  UPDATE public.invoices SET invoice_number=next_number WHERE id=inv.id;
  INSERT INTO public.invoice_edit_log(invoice_id,business_id,edited_by,summary,changes) VALUES(inv.id,p_business_id,auth.uid(),'Renumbered after business pincode update',jsonb_build_object('invoice_number',next_number));
  changed:=changed+1;
 END LOOP;
 RETURN public.app_finish_operation(p_operation_id,jsonb_build_object('pincode',biz.pincode,'pincode_rank',biz.pincode_rank,'renumbered',changed));
END $$;
REVOKE ALL ON FUNCTION public.business_entitlements(uuid),public.account_business_limit(),public.set_business_pincode(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_entitlements(uuid),public.account_business_limit(),public.set_business_pincode(uuid,uuid,text) TO authenticated;

-- Internal helpers are never callable through the public RPC surface.
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE 'app_%' OR p.prorettype='trigger'::regtype OR p.proname IN ('invoice_module','process_subscription_payment','save_invoice','save_item','save_batch','close_pos_session','record_payment','adjust_stock','change_invoice_state','consume_function_quota','member_contacts','ticket_contact')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.app_has_access(uuid,text),public.app_read_access(uuid,text[]),public.app_can_read_invoice(uuid,public.invoice_type),public.app_is_manager(uuid),public.app_ticket_access(uuid),public.invoice_module(public.invoice_type),public.consume_function_quota(uuid,text),public.member_contacts(uuid),public.ticket_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_invoice(uuid,jsonb,jsonb,jsonb,jsonb,timestamptz),public.record_payment(uuid,jsonb),public.change_invoice_state(uuid,uuid,text),public.adjust_stock(uuid,uuid,uuid,numeric,public.stock_movement_type,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_item(uuid,jsonb,jsonb,timestamptz),public.save_batch(uuid,jsonb,timestamptz),public.close_pos_session(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_payment(text,text,text,numeric,text,text,jsonb) TO service_role;
COMMIT;
