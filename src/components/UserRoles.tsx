import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ADMIN_EMAIL } from "@/lib/access";
import { Badge } from "@/components/ui/badge";

type Role = "Admin" | "Manager";

export function UserRoles() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      // Pin the Admin (owner) to the very top, regardless of other sorting.
      return [...rows].sort((a, b) => {
        const aOwner = (a.email ?? "").toLowerCase() === ADMIN_EMAIL ? 0 : 1;
        const bOwner = (b.email ?? "").toLowerCase() === ADMIN_EMAIL ? 0 : 1;
        return aOwner - bOwner;
      });
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: id, role });
      if (insErr) throw insErr;
      const { error: profErr } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (profErr) throw profErr;
    },
    onSuccess: () => {
      toast.success("Role updated.");
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; roles</CardTitle>
        <CardDescription>Assign Admin or Manager access to each signed-up user.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => {
              const locked = (u.email ?? "").toLowerCase() === ADMIN_EMAIL;
              return (
                <li key={u.id} className="rounded-xl border p-3 space-y-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  {locked ? (
                    <Badge variant="secondary">Admin (owner)</Badge>
                  ) : (
                    <Select
                      value={u.role}
                      onValueChange={(v) => setRole.mutate({ id: u.id, role: v as Role })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
