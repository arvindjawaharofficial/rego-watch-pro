ALTER TABLE public.approved_emails ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'Manager';

UPDATE public.approved_emails SET role = 'Admin' WHERE lower(email) = 'tma.fleetrto@gmail.com';
UPDATE public.profiles SET role = 'Admin' WHERE lower(email) = 'tma.fleetrto@gmail.com';

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
BEGIN
  SELECT ae.role INTO _role FROM public.approved_emails ae WHERE lower(ae.email) = lower(NEW.email) LIMIT 1;

  IF lower(NEW.email) = 'tma.fleetrto@gmail.com' THEN
    _role := 'Admin'::public.app_role;
  END IF;

  _role := COALESCE(_role, 'Manager'::public.app_role);

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), _role)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;