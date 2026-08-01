// Supabase Edge Function — Daily RTO Expiry Check + FCM Push
// -----------------------------------------------------------------------------
// Schedule with pg_cron (daily at 8 AM IST = 02:30 UTC):
//
//   select cron.schedule(
//     'daily-rto-expiry-check',
//     '30 2 * * *',
//     $$ select net.http_post(
//        url:='https://<project-ref>.supabase.co/functions/v1/check-expiries',
//        headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
//        body:='{}'::jsonb
//     ); $$
//   );
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIREBASE_SERVICE_ACCOUNT_JSON
// -----------------------------------------------------------------------------

// @ts-expect-error - Deno runtime import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error - Deno global
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (r: Request) => Response | Promise<Response>) => void };

const DOC_FIELDS = [
  { key: "insurance_expiry", label: "Insurance" },
  { key: "fc_expiry", label: "Fitness Certificate" },
  { key: "puc_expiry", label: "PUC" },
  { key: "road_tax_expiry", label: "Road Tax" },
  { key: "permit_expiry", label: "Permit" },
  { key: "rc_expiry", label: "RC" },
] as const;

const THRESHOLD_DAYS = 30;

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// -- FCM v1 access token from service account (RS256 JWT) ---------------------

function b64url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = ""; for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getFcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OAuth failed: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

async function sendFcm(projectId: string, accessToken: string, token: string, title: string, body: string) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: { fcm_options: { link: "/dashboard" } },
      },
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

// -----------------------------------------------------------------------------

Deno.serve(async (_req: Request) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id, license_plate, insurance_expiry, fc_expiry, puc_expiry, road_tax_expiry, permit_expiry, rc_expiry");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const alerts: string[] = [];
  for (const v of vehicles ?? []) {
    for (const { key, label } of DOC_FIELDS) {
      const dateStr = v[key as keyof typeof v] as string | null;
      if (!dateStr) continue;
      const days = daysUntil(dateStr);
      if (days < 0) alerts.push(`${v.license_plate}: ${label} expired ${Math.abs(days)}d ago`);
      else if (days <= THRESHOLD_DAYS) alerts.push(`${v.license_plate}: ${label} expires in ${days}d`);
    }
  }

  if (alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, alerts: 0, sent: 0, whatsapp: "skipped" }), { headers: { "Content-Type": "application/json" } });
  }

  const title = `TMA Fleet — ${alerts.length} alert${alerts.length === 1 ? "" : "s"}`;
  const body = alerts.slice(0, 3).join(" • ") + (alerts.length > 3 ? ` +${alerts.length - 3} more` : "");

  // WhatsApp digest to the admin number (independent of push delivery).
  const whatsapp = await sendWhatsApp(`*${title}*\n\n${alerts.map((a) => `• ${a}`).join("\n")}`);

  const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!saRaw) {
    console.log("FIREBASE_SERVICE_ACCOUNT_JSON not set; skipping push", alerts);
    return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent: 0, whatsapp, note: "no service account" }), { headers: { "Content-Type": "application/json" } });
  }
  const sa = JSON.parse(saRaw);
  const accessToken = await getFcmAccessToken(sa);

  const { data: tokens } = await supabase.from("push_tokens").select("token");


  let sent = 0;
  const failed: string[] = [];
  for (const { token } of tokens ?? []) {
    const r = await sendFcm(sa.project_id, accessToken, token, title, body);
    if (r.ok) sent++;
    else {
      failed.push(r.body);
      if (r.status === 404 || r.status === 403) {
        await supabase.from("push_tokens").delete().eq("token", token);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, sent, failed_count: failed.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
