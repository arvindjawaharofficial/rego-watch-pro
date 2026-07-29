import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { ADMIN_EMAIL } from "@/lib/access";

type Role = "Admin" | "Manager";

export function ApprovedEmails() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Manager");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Role>("Manager");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["approved-emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approved_emails")
        .select("id, email, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ value, role }: { value: string; role: Role }) => {
      const { error } = await supabase.from("approved_emails").insert({ email: value, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Email approved.");
      setEmail("");
      setRole("Manager");
      queryClient.invalidateQueries({ queryKey: ["approved-emails"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "That email is already approved." : e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, email, role }: { id: string; email: string; role: Role }) => {
      const { error } = await supabase.from("approved_emails").update({ role }).eq("id", id);
      if (error) throw error;

      // If the person already has an account, apply the role to it too.
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (profile) {
        await supabase.from("user_roles").delete().eq("user_id", profile.id);
        await supabase.from("user_roles").insert({ user_id: profile.id, role });
        await supabase.from("profiles").update({ role }).eq("id", profile.id);
      }
    },
    onSuccess: () => {
      toast.success("Role updated.");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["approved-emails"] });
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["is-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("approved_emails").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Email removed.");
      queryClient.invalidateQueries({ queryKey: ["approved-emails"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return toast.error("Enter a valid email address.");
    addMutation.mutate({ value, role });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approved emails</CardTitle>
        <CardDescription>
          Only these addresses can sign up or sign in. Assign the role they get on sign-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-2" onSubmit={handleAdd}>
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" className="h-10 shrink-0" disabled={addMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const locked = r.email.toLowerCase() === ADMIN_EMAIL;
              const editing = editingId === r.id;
              return (
                <li key={r.id} className="rounded-xl border p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate flex-1">{r.email}</span>
                    {locked ? (
                      <Badge variant="secondary">Admin (owner)</Badge>
                    ) : (
                      <>
                        <Badge variant={r.role === "Admin" ? "default" : "secondary"}>
                          {r.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit role for ${r.email}`}
                          onClick={() => {
                            setEditingId(editing ? null : r.id);
                            setEditRole(r.role as Role);
                          }}
                        >
                          {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${r.email}`}
                          onClick={() => removeMutation.mutate(r.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>

                  {editing && !locked && (
                    <div className="flex gap-2">
                      <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Manager">Manager</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        className="h-10 shrink-0"
                        disabled={updateRole.isPending}
                        onClick={() =>
                          updateRole.mutate({ id: r.id, email: r.email, role: editRole })
                        }
                      >
                        <Check className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
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
