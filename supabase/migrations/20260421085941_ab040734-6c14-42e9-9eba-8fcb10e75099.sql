-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner', 'staff', 'accountant');
CREATE TYPE public.party_type AS ENUM ('customer', 'supplier');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ BUSINESSES ============
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gstin TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  state_code TEXT,
  logo_url TEXT,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES (per business) ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _business_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id UUID, _business_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id
  )
$$;

-- ============ PARTIES ============
CREATE TABLE public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type party_type NOT NULL DEFAULT 'customer',
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  state TEXT,
  state_code TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_parties_business ON public.parties(business_id);
CREATE INDEX idx_parties_type ON public.parties(business_id, type);

-- ============ updated_at TRIGGER FN ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ NEW USER → PROFILE ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ NEW BUSINESS → AUTO OWNER ROLE ============
CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, business_id, role)
  VALUES (NEW.owner_id, NEW.id, 'owner');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_business_created
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.handle_new_business();

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- businesses
CREATE POLICY "Members view their businesses" ON public.businesses
  FOR SELECT USING (public.is_business_member(auth.uid(), id));
CREATE POLICY "Authenticated create businesses" ON public.businesses
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update business" ON public.businesses
  FOR UPDATE USING (public.has_role(auth.uid(), id, 'owner'));
CREATE POLICY "Owners delete business" ON public.businesses
  FOR DELETE USING (public.has_role(auth.uid(), id, 'owner'));

-- user_roles
CREATE POLICY "Members view roles in their business" ON public.user_roles
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners manage roles" ON public.user_roles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), business_id, 'owner'));
CREATE POLICY "Owners update roles" ON public.user_roles
  FOR UPDATE USING (public.has_role(auth.uid(), business_id, 'owner'));
CREATE POLICY "Owners delete roles" ON public.user_roles
  FOR DELETE USING (public.has_role(auth.uid(), business_id, 'owner'));

-- parties
CREATE POLICY "Members view parties" ON public.parties
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members create parties" ON public.parties
  FOR INSERT WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members update parties" ON public.parties
  FOR UPDATE USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Owners/staff delete parties" ON public.parties
  FOR DELETE USING (
    public.has_role(auth.uid(), business_id, 'owner')
    OR public.has_role(auth.uid(), business_id, 'staff')
  );