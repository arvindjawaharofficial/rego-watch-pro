-- Roles in a dedicated table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));

-- Approved email allowlist
CREATE TABLE public.approved_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX approved_emails_email_key ON public.approved_emails (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approved_emails TO authenticated;
GRANT ALL ON public.approved_emails TO service_role;
ALTER TABLE public.approved_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view approved emails" ON public.approved_emails
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins add approved emails" ON public.approved_emails
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins update approved emails" ON public.approved_emails
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin')) WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins delete approved emails" ON public.approved_emails
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));

CREATE TRIGGER approved_emails_updated_at
  BEFORE UPDATE ON public.approved_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the first admin email
INSERT INTO public.approved_emails (email) VALUES ('tma.fleetrto@gmail.com');

-- Public check used by the sign-in/sign-up screen (does not expose the list)
CREATE OR REPLACE FUNCTION public.is_email_approved(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.approved_emails WHERE lower(email) = lower(trim(_email)))
$$;

REVOKE ALL ON FUNCTION public.is_email_approved(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_approved(text) TO anon, authenticated;

-- Assign roles on signup: the fixed admin address becomes Admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  _role := CASE WHEN lower(NEW.email) = 'tma.fleetrto@gmail.com' THEN 'Admin'::public.app_role
                ELSE 'Manager'::public.app_role END;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), _role)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill roles for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- Prevent users from escalating their own profile role
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role(auth.uid(), 'Admin') THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_change();