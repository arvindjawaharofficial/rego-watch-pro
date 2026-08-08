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
import { Plus, Search, Truck, MessageCircle, Loader2 } from "lucide-react";
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

  const sendWhatsApp = async () => {
    setSending(true);
    setStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("check-expiries", { body: {} });
      if (error) throw error;
      const alerts = (data as { alerts?: number })?.alerts ?? 0;
      const wa = (data as { whatsapp?: string })?.whatsapp ?? "unknown";
      if (alerts === 0) {
        setStatus({ ok: true, text: "No alerts — all vehicles up to date, nothing sent." });
        toast.info("Nothing to send: all vehicles are up to date.");
      } else if (wa === "sent") {
        setStatus({ ok: true, text: `Delivered to admin WhatsApp — ${alerts} alert${alerts === 1 ? "" : "s"} in 1 message.` });
        toast.success("WhatsApp update sent");
      } else if (wa === "not_configured") {
        setStatus({ ok: false, text: "WhatsApp is not configured (missing credentials)." });
        toast.error("WhatsApp not configured");
      } else {
        setStatus({ ok: false, text: `WhatsApp delivery failed (${wa}).` });
        toast.error("WhatsApp delivery failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatus({ ok: false, text: `Could not send: ${msg}` });
      toast.error("Could not send WhatsApp update");
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
