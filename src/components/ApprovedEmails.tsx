import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ADMIN_EMAIL } from "@/lib/access";

export function ApprovedEmails() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["approved-emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approved_emails")
        .select("id, email, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from("approved_emails").insert({ email: value });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Email approved.");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["approved-emails"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "That email is already approved." : e.message),
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
    if (rows.length >= 5) return toast.error("Maximum of 5 approved users reached.");
    addMutation.mutate(value);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approved emails</CardTitle>
        <CardDescription>
          Only these addresses can sign up or sign in. Up to 5 users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex gap-2" onSubmit={handleAdd}>
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="h-10 shrink-0" disabled={addMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const locked = r.email.toLowerCase() === ADMIN_EMAIL;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-xl border p-3 text-sm"
                >
                  <span className="truncate flex-1">{r.email}</span>
                  {locked ? (
                    <Badge variant="secondary">Admin</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${r.email}`}
                      onClick={() => removeMutation.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
