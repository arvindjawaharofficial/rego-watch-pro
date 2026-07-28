import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_EMAIL = "tma.fleetrto@gmail.com";

/** Checks the allowlist without exposing the list itself. */
export async function isEmailApproved(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_email_approved", { _email: email });
  if (error) throw error;
  return Boolean(data);
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "Admin")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
}
