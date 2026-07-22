// Supabase Edge Function boilerplate — Daily RTO Expiry Check (Cron Job)
// -----------------------------------------------------------------------------
// Deploy this as a Supabase Edge Function and schedule it daily with pg_cron.
//
// 1. Save this file at:  supabase/functions/check-expiries/index.ts
// 2. Deploy:             supabase functions deploy check-expiries
// 3. Set secrets:        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//                        (Optional) WEB_PUSH_ENDPOINT for external push service
// 4. Schedule with pg_cron (run daily at 8 AM IST = 02:30 UTC):
//
//    select cron.schedule(
//      'daily-rto-expiry-check',
//      '30 2 * * *',
//      $$
//      select net.http_post(
//        url:='https://<project-ref>.supabase.co/functions/v1/check-expiries',
//        headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
//        body:='{}'::jsonb
//      );
//      $$
//    );
// -----------------------------------------------------------------------------

// @ts-expect-error - Deno runtime import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error - Deno global
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (r: Request) => Response | Promise<Response>) => void };

const DOC_FIELDS = [
  { key: "insurance_expiry", label: "Insurance" },
  { key: "fc_expiry", label: "Fitness Certificate (FC)" },
  { key: "puc_expiry", label: "Pollution (PUC)" },
  { key: "road_tax_expiry", label: "Road Tax" },
  { key: "permit_expiry", label: "Permit" },
  { key: "rc_expiry", label: "Registration Certificate (RC)" },
] as const;

const THRESHOLD_DAYS = 30;

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch all vehicles
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, license_plate, insurance_expiry, fc_expiry, puc_expiry, road_tax_expiry, permit_expiry, rc_expiry");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const alerts: { plate: string; message: string }[] = [];

  for (const v of vehicles ?? []) {
    for (const { key, label } of DOC_FIELDS) {
      const dateStr = v[key as keyof typeof v] as string | null;
      if (!dateStr) continue;
      const days = daysUntil(dateStr);
      if (days < 0) {
        alerts.push({
          plate: v.license_plate,
          message: `${v.license_plate}: ${label} expired ${Math.abs(days)} day(s) ago!`,
        });
      } else if (days <= THRESHOLD_DAYS) {
        alerts.push({
          plate: v.license_plate,
          message: `${v.license_plate}: ${label} expires in ${days} day(s)!`,
        });
      }
    }
  }

  // TODO: Fan out `alerts` to your web-push service.
  // Example: fetch(Deno.env.get("WEB_PUSH_ENDPOINT")!, { method: "POST", body: JSON.stringify({ alerts }) });
  console.log(`Generated ${alerts.length} alert(s)`, alerts);

  return new Response(JSON.stringify({ ok: true, alerts_count: alerts.length, alerts }), {
    headers: { "Content-Type": "application/json" },
  });
});
