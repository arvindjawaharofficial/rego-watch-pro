
-- Restrict profiles SELECT to own row only
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Replace always-true vehicle write policies with authenticated-user checks
DROP POLICY IF EXISTS "Authenticated can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated can delete vehicles" ON public.vehicles;

CREATE POLICY "Authenticated can insert vehicles"
  ON public.vehicles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update vehicles"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete vehicles"
  ON public.vehicles FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);
