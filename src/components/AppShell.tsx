import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, BellRing, LogOut, Truck } from "lucide-react";
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
        severity: "expired" | "expiring";
      }[] = [];
      for (const v of (data ?? []) as Vehicle[]) {
        for (const { key, short } of DOC_FIELDS) {
          const sev = severityFor(v[key] as string | null);
          if (sev === "expired" || sev === "expiring") {
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
      return alerts.sort((a, b) => (a.days ?? -999) - (b.days ?? -999));
    },
    refetchInterval: 60_000,
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { data: alerts = [] } = useVehicleAlerts();
  const [pushState, setPushState] = useState<"idle" | "enabling" | "enabled" | "denied">("idle");

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

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Truck className="h-4 w-4" />
            </div>
            <span className="font-bold truncate">Fleet RTO</span>
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
                <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-6rem)] pr-1">
                  {alerts.length === 0 && (
                    <p className="text-sm text-muted-foreground">All clear. No documents expiring soon.</p>
                  )}
                  {alerts.map((a, i) => (
                    <Link
                      key={i}
                      to="/vehicles/$vehicleId"
                      params={{ vehicleId: a.vehicleId }}
                      className={cn(
                        "block rounded-xl border p-3 hover:bg-accent transition-colors",
                        a.severity === "expired" ? "border-destructive/30 bg-destructive/5" : "border-yellow-500/40 bg-yellow-500/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{a.plate}</span>
                        <Badge variant={a.severity === "expired" ? "destructive" : "secondary"}>
                          {a.severity === "expired" ? "Expired" : "Soon"}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1">
                        {a.doc}{" "}
                        {a.severity === "expired"
                          ? `expired ${Math.abs(a.days ?? 0)} day${Math.abs(a.days ?? 0) === 1 ? "" : "s"} ago`
                          : `expires in ${a.days} day${a.days === 1 ? "" : "s"}`}
                        !
                      </p>
                    </Link>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4 pb-24">{children}</main>
    </div>
  );
}
