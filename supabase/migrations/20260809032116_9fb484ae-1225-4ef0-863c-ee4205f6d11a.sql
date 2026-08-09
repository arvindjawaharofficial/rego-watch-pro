CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  telegram_bot_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view notification settings" ON public.notification_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins insert notification settings" ON public.notification_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins update notification settings" ON public.notification_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin')) WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE TRIGGER trg_notification_settings_updated BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.notification_settings (singleton) VALUES (true);

CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('telegram', 'email', 'admin_email')),
  value text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view recipients" ON public.notification_recipients FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins insert recipients" ON public.notification_recipients FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins update recipients" ON public.notification_recipients FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin')) WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins delete recipients" ON public.notification_recipients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));

INSERT INTO public.notification_recipients (kind, value, label, is_primary) VALUES
  ('telegram', '1018939518', 'Arun', true),
  ('telegram', '5656921322', 'Vijay', true),
  ('telegram', '1741927477', 'Arvind', true),
  ('email', 'tmaarun1993@gmail.com', 'Arun', true),
  ('email', 'svijay981@gmail.com', 'Vijay', true),
  ('email', 'tma.fleetrto@gmail.com', 'TMA Fleet RTO', true),
  ('admin_email', 'tma.fleetrto@gmail.com', 'Admin', true),
  ('admin_email', 'tmaarun1993@gmail.com', 'Admin', true);

CREATE TABLE public.notification_unlock_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.notification_unlock_codes TO service_role;
ALTER TABLE public.notification_unlock_codes ENABLE ROW LEVEL SECURITY;