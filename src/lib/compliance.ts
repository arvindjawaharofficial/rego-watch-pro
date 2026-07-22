import type { Tables } from "@/integrations/supabase/types";

export type Vehicle = Tables<"vehicles">;

export const DOC_FIELDS = [
  { key: "insurance_expiry", label: "Insurance", short: "Insurance" },
  { key: "fc_expiry", label: "Fitness Certificate", short: "FC" },
  { key: "puc_expiry", label: "Pollution (PUC)", short: "PUC" },
  { key: "road_tax_expiry", label: "Road Tax", short: "Road Tax" },
  { key: "permit_expiry", label: "Permit", short: "Permit" },
  { key: "rc_expiry", label: "Registration (RC)", short: "RC" },
] as const;

export type DocKey = (typeof DOC_FIELDS)[number]["key"];

export type Severity = "expired" | "expiring" | "valid" | "missing";

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function severityFor(dateStr: string | null): Severity {
  const d = daysUntil(dateStr);
  if (d === null) return "missing";
  if (d < 0) return "expired";
  if (d <= 30) return "expiring";
  return "valid";
}

export type OverallStatus = "green" | "yellow" | "red";

export function overallStatus(v: Vehicle): OverallStatus {
  let hasExpiring = false;
  for (const { key } of DOC_FIELDS) {
    const s = severityFor(v[key] as string | null);
    if (s === "expired" || s === "missing") return "red";
    if (s === "expiring") hasExpiring = true;
  }
  return hasExpiring ? "yellow" : "green";
}

export interface DocIssue {
  key: DocKey;
  short: string;
  label: string;
  severity: Severity;
  days: number | null;
}

export function issuesFor(v: Vehicle): DocIssue[] {
  return DOC_FIELDS.map(({ key, label, short }) => {
    const sev = severityFor(v[key] as string | null);
    return {
      key,
      label,
      short,
      severity: sev,
      days: daysUntil(v[key] as string | null),
    };
  }).filter((i) => i.severity !== "valid");
}

export function formatBadge(i: DocIssue): string {
  if (i.severity === "missing") return `${i.short} missing`;
  if (i.severity === "expired") return `${i.short} expired`;
  return `${i.short} in ${i.days}d`;
}
