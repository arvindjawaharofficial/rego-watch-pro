import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VehicleCard } from "@/components/VehicleCard";
import { VehicleForm } from "@/components/VehicleForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Truck, Send, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendNotificationNow } from "@/lib/notifications.functions";
import type { Vehicle } from "@/lib/compliance";
import { overallStatus } from "@/lib/compliance";
import { useIsAdmin } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Fleet Dashboard · TMA Fleet" },
      { name: "description", content: "All vehicles and their RTO compliance status at a glance." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: isAdmin } = useIsAdmin();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; text: string }>(null);

  const sendNow = useServerFn(sendNotificationNow);

  const sendAlerts = async () => {
    setSending(true);
    setStatus(null);
    try {
      const res = await sendNow({});
      const parts = [
        ...res.telegram.map((t: { to: string; ok: boolean; detail: string }) => `Telegram → ${t.to}: ${t.ok ? "delivered" : t.detail}`),
        ...res.email.map((t: { to: string; ok: boolean; detail: string }) => `Email → ${t.to}: ${t.ok ? "delivered" : t.detail}`),
      ];
      const anyOk = [...res.telegram, ...res.email].some((r: { ok: boolean }) => r.ok);
      const headline =
        res.alerts === 0
          ? "All vehicles up to date — all-clear message sent."
          : `${res.alerts} alert${res.alerts === 1 ? "" : "s"} in 1 message.`;
      setStatus({ ok: anyOk, text: `${headline} ${parts.join(" · ")}` });

      if (anyOk) toast.success("Notification sent");
      else toast.error("Delivery failed — check notification settings");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatus({ ok: false, text: `Could not send: ${msg}` });
      toast.error("Could not send notification");
    } finally {
      setSending(false);
    }
  };

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const filtered = vehicles.filter(
    (v) =>
      v.license_plate.toLowerCase().includes(q.toLowerCase()) ||
      v.make_model.toLowerCase().includes(q.toLowerCase()) ||
      (v.assigned_driver ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const counts = {
    green: vehicles.filter((v) => overallStatus(v) === "green").length,
    yellow: vehicles.filter((v) => overallStatus(v) === "yellow").length,
    red: vehicles.filter((v) => overallStatus(v) === "red").length,
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Fleet</h1>
          <p className="text-sm text-muted-foreground">{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}</p>
        </div>
        <Button size="lg" className="h-11 rounded-xl" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard color="emerald" label="Up to Date" value={counts.green} />
        <StatCard color="amber" label="Due soon" value={counts.yellow} />
        <StatCard color="red" label="Action needed" value={counts.red} />
      </div>

      {isAdmin && (
        <div className="mb-4 rounded-2xl border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Send notification</p>
              <p className="text-xs text-muted-foreground">
                Sends all due-soon and action-needed vehicles to Telegram and email in one message.
              </p>
            </div>
            <Button
              onClick={sendAlerts}
              disabled={sending}
              className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {sending ? "Sending…" : "Send now"}
            </Button>
          </div>
          {status && (
            <p className={`mt-2 text-xs font-medium ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {status.text}
            </p>
          )}
        </div>
      )}


      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search plate, model, driver…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium">No vehicles yet</p>
          <p className="text-sm text-muted-foreground mb-4">Add your first vehicle to start tracking.</p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add vehicle
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <VehicleCard key={v.id} v={v} />
          ))}
        </div>
      )}

      <VehicleForm open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

function StatCard({ color, label, value }: { color: "emerald" | "amber" | "red"; label: string; value: number }) {
  const cls = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/10 text-red-700 dark:text-red-400",
  }[color];
  return (
    <div className={`rounded-2xl p-3 ${cls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
