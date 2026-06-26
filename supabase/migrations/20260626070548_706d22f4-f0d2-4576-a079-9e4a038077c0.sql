
-- Subscription plans (admin-configurable)
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_inr NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Admins manage plans" ON public.subscription_plans
  FOR ALL USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_subscription_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Business subscription state
CREATE TABLE public.business_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  last_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.business_subscriptions TO authenticated;
GRANT ALL ON public.business_subscriptions TO service_role;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their subscription" ON public.business_subscriptions
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Admins manage subscriptions" ON public.business_subscriptions
  FOR ALL USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_business_subscriptions_updated BEFORE UPDATE ON public.business_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cashfree orders log
CREATE TABLE public.subscription_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  cf_order_id TEXT NOT NULL UNIQUE,
  cf_payment_id TEXT,
  order_amount NUMERIC(10,2) NOT NULL,
  order_currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'CREATED',
  payment_method TEXT,
  payment_session_id TEXT,
  paid_at TIMESTAMPTZ,
  raw_response JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.subscription_orders TO authenticated;
GRANT ALL ON public.subscription_orders TO service_role;
ALTER TABLE public.subscription_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their orders" ON public.subscription_orders
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Members create orders" ON public.subscription_orders
  FOR INSERT WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE TRIGGER trg_subscription_orders_updated BEFORE UPDATE ON public.subscription_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_subscription_orders_business ON public.subscription_orders(business_id);
CREATE INDEX idx_subscription_orders_status ON public.subscription_orders(status);

-- Webhook events audit
CREATE TABLE public.cashfree_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  cf_order_id TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.cashfree_webhook_events TO service_role;
ALTER TABLE public.cashfree_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view webhook events" ON public.cashfree_webhook_events
  FOR SELECT USING (public.is_platform_admin(auth.uid()));

-- Seed default plans
INSERT INTO public.subscription_plans (code, name, description, price_inr, duration_days, features, sort_order) VALUES
  ('FREE', 'Free', 'Get started with core billing features', 0, 36500,
    '["Up to 50 invoices/month","1 user","Basic reports","Community support"]'::jsonb, 0),
  ('PRO', 'Pro', 'For growing shops needing full features', 499, 30,
    '["Unlimited invoices","Up to 5 users","All modules unlocked","Party Ledger & Branches","Email & WhatsApp share","Priority support"]'::jsonb, 1),
  ('PREMIUM', 'Premium', 'Best for multi-branch businesses', 1499, 30,
    '["Everything in Pro","Unlimited users & branches","Advanced reports & AI insights","POS multi-terminal","Dedicated support","Custom invoice templates"]'::jsonb, 2);
