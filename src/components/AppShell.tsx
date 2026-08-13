import { Link } from "@tanstack/react-router";
import { Bell, BellRing, User } from "lucide-react";
import tmaLogo from "@/assets/tma-logo.jpg.asset.json";
import { useEffect, useState } from "react";
import { enablePushNotifications, listenForegroundMessages } from "@/lib/firebase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Vehicle } from "@/lib/compliance";
import { DOC_FIELDS, daysUntil, severityFor } from "@/lib/compliance";
import { cn } from "@/lib/utils";

function useVehicleAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*");
      if (error) throw error;
      const alerts: {
        vehicleId: string;
        plate: string;
        doc: string;
        days: number | null;
        severity: "expired" | "expiring" | "missing";
      }[] = [];
      for (const v of (data ?? []) as Vehicle[]) {
        for (const { key, short } of DOC_FIELDS) {
          const sev = severityFor(v[key] as string | null);
          if (sev === "expired" || sev === "expiring" || sev === "missing") {
            alerts.push({
              vehicleId: v.id,
              plate: v.license_plate,
              doc: short,
              days: daysUntil(v[key] as string | null),
              severity: sev,
            });
          }
        }
      }
      const rank = { missing: 0, expired: 1, expiring: 2 } as const;
      return alerts.sort(
        (a, b) => rank[a.severity] - rank[b.severity] || (a.days ?? 0) - (b.days ?? 0),
      );

    },
    refetchInterval: 60_000,
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: alerts = [] } = useVehicleAlerts();
  const [pushState, setPushState] = useState<"idle" | "enabling" | "enabled" | "denied">("idle");

  // Sign out immediately if the admin removed this account from the approved list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) return;
      const { data: approved, error } = await supabase.rpc("is_email_approved", { _email: email });
      if (cancelled || error) return;
      if (!approved) {
        toast.error("Your access was revoked by the admin.");
        await supabase.auth.signOut();
        window.location.href = "/auth";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window && Notification.permission === "granted") {
      setPushState("enabled");
    } else if ("Notification" in window && Notification.permission === "denied") {
      setPushState("denied");
    }
    listenForegroundMessages((title, body) => toast(title, { description: body }));
  }, []);


  async function enablePush() {
    setPushState("enabling");
    const res = await enablePushNotifications();
    if (res.ok) {
      setPushState("enabled");
      toast.success("Push notifications enabled on this device");
    } else {
      setPushState(res.reason === "Permission denied" ? "denied" : "idle");
      toast.error(res.reason);
    }
  }




  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <img
              src={tmaLogo.url}
              alt="TMA Fleet"
              className="h-9 w-9 shrink-0 rounded-xl object-cover bg-white"
            />
            <span className="font-bold truncate">TMA Fleet</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-10 w-10">
                  <Bell className="h-5 w-5" />
                  {alerts.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Alerts</SheetTitle>
                </SheetHeader>
                <div className="mt-4 mb-3 rounded-xl border p-3 bg-muted/40">
                  <div className="flex items-center gap-2 mb-2">
                    <BellRing className="h-4 w-4" />
                    <span className="text-sm font-semibold">Push notifications</span>
                  </div>
                  {pushState === "enabled" ? (
                    <p className="text-xs text-muted-foreground">Enabled on this device. You'll get alerts when documents are due.</p>
                  ) : pushState === "denied" ? (
                    <p className="text-xs text-muted-foreground">Blocked by your browser. Enable notifications in site settings.</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">Get an alert on this device before documents expire.</p>
                      <Button size="sm" onClick={enablePush} disabled={pushState === "enabling"}>
                        {pushState === "enabling" ? "Enabling..." : "Enable notifications"}
                      </Button>
                    </>
                  )}
                </div>
                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-14rem)] pr-1">

                  {alerts.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      All clear. No missing or expiring documents.
                    </p>
                  )}
                  {alerts.map((a, i) => (
                    <Link
                      key={i}
                      to="/vehicles/$vehicleId"
                      params={{ vehicleId: a.vehicleId }}
                      className={cn(
                        "block rounded-xl border p-3 hover:bg-accent transition-colors",
                        a.severity === "expiring"
                          ? "border-yellow-500/40 bg-yellow-500/5"
                          : "border-destructive/30 bg-destructive/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{a.plate}</span>
                        <Badge variant={a.severity === "expiring" ? "secondary" : "destructive"}>
                          {a.severity === "missing" ? "Missing" : a.severity === "expired" ? "Expired" : "Soon"}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1">
                        {a.doc}{" "}
                        {a.severity === "missing"
                          ? "date not added yet — please update it."
                          : a.severity === "expired"
                            ? `expired ${Math.abs(a.days ?? 0)} day${Math.abs(a.days ?? 0) === 1 ? "" : "s"} ago!`
                            : `expires in ${a.days} day${a.days === 1 ? "" : "s"}!`}
                      </p>
                    </Link>
                  ))}

                </div>
              </SheetContent>
            </Sheet>
            <Button asChild variant="ghost" size="icon" className="h-10 w-10" aria-label="Profile">
              <Link to="/profile"><User className="h-5 w-5" /></Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4 pb-24">{children}</main>
    </div>
  );
}
