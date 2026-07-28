import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovedEmails } from "@/components/ApprovedEmails";
import { useIsAdmin } from "@/lib/access";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile · TMA Fleet" },
      { name: "description", content: "Manage your TMA Fleet account details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, phone")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
      return toast.error("Mobile number must be 10 digits.");
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone: trimmedPhone || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated.");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold tracking-tight mb-4">Profile</h1>

      <Tabs defaultValue="account">
        <TabsList className="grid grid-cols-2 w-full mb-4">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="approved" disabled={!isAdmin}>
            Approved emails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approved">{isAdmin && <ApprovedEmails />}</TabsContent>

        <TabsContent value="account" className="space-y-4">


      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Update your name and mobile number.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !profile ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSave}>
              <div>
                <Label>Email</Label>
                <Input value={profile.email ?? ""} disabled />
              </div>
              <div>
                <Label>Role</Label>
                <div className="mt-1">
                  <Badge variant="secondary">{profile.role}</Badge>
                </div>
              </div>
              <div>
                <Label htmlFor="p-name">Full name</Label>
                <Input
                  id="p-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="p-phone">Mobile number</Label>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    +91
                  </div>
                  <Input
                    id="p-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SMS OTP verification isn't available on the free tier, so the number is saved as-is.
                </p>
              </div>
              <Button className="w-full h-12" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Sign out of this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full h-12" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
