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
import { UserRoles } from "@/components/UserRoles";
import { NotificationSettings } from "@/components/NotificationSettings";
import { useIsAdmin } from "@/lib/access";
import { LogOut, Pencil } from "lucide-react";
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
  const { data: isAdmin = false } = useIsAdmin();


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
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  function handleCancel() {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setEditing(false);
  }

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
    setEditing(false);
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
        <TabsList className={`grid w-full mb-4 ${isAdmin ? "grid-cols-4" : "grid-cols-1"}`}>
          <TabsTrigger value="account">Account</TabsTrigger>
          {isAdmin && <TabsTrigger value="approved">Emails</TabsTrigger>}
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="alerts">Alerts</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <>
            <TabsContent value="approved">
              <ApprovedEmails />
            </TabsContent>
            <TabsContent value="users">
              <UserRoles />
            </TabsContent>
            <TabsContent value="alerts">
              <NotificationSettings />
            </TabsContent>
          </>
        )}


        <TabsContent value="account" className="space-y-4">


      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Your account</CardTitle>
          {!editing && !isLoading && profile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit profile"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading || !profile ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSave}>
              <div>
                <Label htmlFor="p-name">Full name</Label>
                <Input
                  id="p-name"
                  value={fullName}
                  disabled={!editing}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <Label>Role</Label>
                <div className="mt-1">
                  <Badge variant="secondary">{isAdmin ? "Admin" : profile.role}</Badge>
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={profile.email ?? ""} disabled />
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
                    disabled={!editing}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SMS OTP verification isn't available on the free tier, so the number is saved as-is.
                </p>
              </div>
              {editing && (
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 h-12" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12"
                    disabled={saving}
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                </div>
              )}
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
