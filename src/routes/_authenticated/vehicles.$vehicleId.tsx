import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { VehicleForm } from "@/components/VehicleForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Pencil, Trash2, User, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { Vehicle, Severity } from "@/lib/compliance";
import { DOC_FIELDS, daysUntil, severityFor } from "@/lib/compliance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/vehicles/$vehicleId")({
  component: VehicleDetail,
});

function VehicleDetail() {
  const { vehicleId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
      if (error) throw error;
      return data as Vehicle | null;
    },
  });

  async function remove() {
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
    if (error) return toast.error(error.message);
    toast.success("Vehicle deleted");
    qc.invalidateQueries({ queryKey: ["vehicles"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
    navigate({ to: "/dashboard" });
  }

  return (
    <AppShell>
      <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground mb-3 hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Link>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !vehicle ? (
        <p className="text-sm text-muted-foreground">Vehicle not found.</p>
      ) : (
        <>
          <div className="mb-4">
            <h1 className="text-2xl font-bold tracking-tight">{vehicle.license_plate}</h1>
            <p className="text-muted-foreground">{vehicle.make_model}</p>
            {vehicle.assigned_driver && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <User className="h-4 w-4" /> {vehicle.assigned_driver}
              </p>
            )}
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Compliance documents
          </h2>
          <div className="space-y-2">
            {DOC_FIELDS.map(({ key, label }) => {
              const val = vehicle[key] as string | null;
              const sev = severityFor(val);
              return <DocRow key={key} label={label} date={val} sev={sev} />;
            })}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button size="lg" className="h-12" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit / Renew
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" variant="outline" className="h-12">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this vehicle?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove {vehicle.license_plate} from the fleet.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <VehicleForm open={editing} onOpenChange={setEditing} vehicle={vehicle} />
        </>
      )}
    </AppShell>
  );
}

function DocRow({ label, date, sev }: { label: string; date: string | null; sev: Severity }) {
  const days = daysUntil(date);
  const config: Record<Severity, { icon: React.ReactNode; text: string; cls: string }> = {
    valid: {
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
      text: `Valid · ${days} days left`,
      cls: "border-emerald-500/20",
    },
    expiring: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
      text: `Expiring in ${days} day${days === 1 ? "" : "s"}`,
      cls: "border-amber-500/40 bg-amber-500/5",
    },
    expired: {
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      text: `Expired ${Math.abs(days ?? 0)} day${Math.abs(days ?? 0) === 1 ? "" : "s"} ago`,
      cls: "border-red-500/40 bg-red-500/5",
    },
    missing: {
      icon: <HelpCircle className="h-5 w-5 text-muted-foreground" />,
      text: "Not set",
      cls: "border-dashed",
    },
  };
  const c = config[sev];
  return (
    <Card className={cn("p-3 flex items-center gap-3", c.cls)}>
      <div className="shrink-0">{c.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium truncate">{label}</p>
          {date && <span className="text-xs text-muted-foreground shrink-0">{date}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{c.text}</p>
      </div>
    </Card>
  );
}
