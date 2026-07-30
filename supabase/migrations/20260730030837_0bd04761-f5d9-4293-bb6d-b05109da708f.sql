UPDATE public.profiles p
SET role = ur.role
FROM public.user_roles ur
WHERE ur.user_id = p.id AND p.role IS DISTINCT FROM ur.role;

DROP POLICY IF EXISTS "Authenticated can delete vehicles" ON public.vehicles;
CREATE POLICY "Admins can delete vehicles" ON public.vehicles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'Admin'));