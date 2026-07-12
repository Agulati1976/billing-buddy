
-- Enums
CREATE TYPE public.support_ticket_status AS ENUM ('open','in_progress','waiting_customer','resolved','closed');
CREATE TYPE public.support_ticket_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.support_sender_role AS ENUM ('customer','admin','staff');

-- support_staff
CREATE TABLE public.support_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_staff TO authenticated;
GRANT ALL ON public.support_staff TO service_role;
ALTER TABLE public.support_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.support_staff WHERE user_id = _user_id AND active = true)
$$;

CREATE POLICY "admins manage support staff" ON public.support_staff FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "staff see own record" ON public.support_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- support_tickets
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE DEFAULT ('TKT-' || to_char(now(),'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  priority public.support_ticket_priority NOT NULL DEFAULT 'medium',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_business_idx ON public.support_tickets(business_id);
CREATE INDEX support_tickets_created_by_idx ON public.support_tickets(created_by);
CREATE INDEX support_tickets_assigned_idx ON public.support_tickets(assigned_to);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user sees own tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "assignee sees tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());
CREATE POLICY "admins see all tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "user creates own ticket" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "user updates own open ticket" ON public.support_tickets FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "assignee updates ticket" ON public.support_tickets FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());
CREATE POLICY "admins update all tickets" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "admins delete tickets" ON public.support_tickets FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- support_ticket_messages
CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role public.support_sender_role NOT NULL,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "see messages of accessible tickets" ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid() OR public.is_platform_admin(auth.uid()))
    )
  );
CREATE POLICY "post messages on accessible tickets" ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid() OR public.is_platform_admin(auth.uid()))
    )
  );
CREATE POLICY "admins delete messages" ON public.support_ticket_messages FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Bump last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_ticket_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NEW.created_at,
      status = CASE
        WHEN status = 'closed' THEN 'open'
        WHEN NEW.sender_role = 'customer' AND status = 'waiting_customer' THEN 'in_progress'
        WHEN NEW.sender_role IN ('admin','staff') AND status = 'open' THEN 'in_progress'
        ELSE status
      END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bump_ticket_last_message AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_ticket_last_message();
