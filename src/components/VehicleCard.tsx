import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBadge, issuesFor, overallStatus, type Vehicle } from "@/lib/compliance";

const statusStyles: Record<string, { dot: string; ring: string; label: string }> = {
  green: { dot: "bg-emerald-500", ring: "ring-emerald-500/20", label: "Up to Date" },
  yellow: { dot: "bg-amber-500", ring: "ring-amber-500/20", label: "Renewal due" },
  red: { dot: "bg-red-500", ring: "ring-red-500/20", label: "Action required" },
};

export function VehicleCard({ v }: { v: Vehicle }) {
  const status = overallStatus(v);
  const s = statusStyles[status];
  const issues = issuesFor(v);

  return (
    <Link to="/vehicles/$vehicleId" params={{ vehicleId: v.id }}>
      <Card className={cn("p-4 hover:shadow-md transition-shadow ring-1", s.ring)}>
        <div className="flex items-start gap-3">
          <div className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", s.dot)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base truncate">{v.license_plate}</h3>
              <Badge variant="outline" className="text-[10px] font-medium">{s.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{v.make_model}</p>
            {v.assigned_driver && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <User className="h-3 w-3" /> {v.assigned_driver}
              </p>
            )}
            {issues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {issues.map((i) => (
                  <span
                    key={i.key}
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      i.severity === "expired" || i.severity === "missing"
                        ? "bg-red-500/10 text-red-700 dark:text-red-400"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {formatBadge(i)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
        </div>
      </Card>
    </Link>
  );
}
