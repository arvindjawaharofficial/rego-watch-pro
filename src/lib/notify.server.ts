// Server-only notification helpers (Telegram + Email).

export type SendResult = { ok: boolean; detail: string };

export async function sendTelegram(
  botToken: string | null | undefined,
  chatId: string,
  text: string,
): Promise<SendResult> {
  if (!botToken) return { ok: false, detail: "telegram_bot_token_missing" };
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`Telegram send failed [${res.status}]: ${body}`);
    return { ok: false, detail: `failed_${res.status}` };
  }
  return { ok: true, detail: "sent" };
}

/**
 * Email delivery via a Google Apps Script web app webhook (free, no sender domain).
 * Configure EMAIL_WEBHOOK_URL (and optionally EMAIL_WEBHOOK_TOKEN) as backend secrets.
 * The script receives JSON: { token, to, subject, text } and calls MailApp.sendEmail.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<SendResult> {
  const url = process.env["EMAIL_WEBHOOK_URL"];
  if (!url) {
    console.warn(`Email to ${to} skipped: EMAIL_WEBHOOK_URL not configured.`);
    return { ok: false, detail: "email webhook not configured yet" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "follow",
      body: JSON.stringify({
        token: process.env["EMAIL_WEBHOOK_TOKEN"] ?? "",
        to,
        subject,
        text,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`Email webhook failed [${res.status}]: ${body}`);
      return { ok: false, detail: `failed_${res.status}` };
    }
    if (/"?ok"?\s*[:=]\s*false|error/i.test(body)) {
      console.error(`Email webhook rejected: ${body}`);
      return { ok: false, detail: body.slice(0, 120) };
    }
    return { ok: true, detail: "sent" };
  } catch (e) {
    console.error(`Email webhook error: ${String(e)}`);
    return { ok: false, detail: "webhook_unreachable" };
  }
}



function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

type VehicleRow = Record<string, unknown> & { license_plate: string };

/** One combined digest line list across all vehicles. Empty when everything is up to date. */
export function buildAlertLines(vehicles: VehicleRow[]): string[] {
  const lines: string[] = [];
  for (const v of vehicles) {
    for (const { key, label } of DOC_FIELDS) {
      const dateStr = v[key] as string | null;
      if (!dateStr) {
        lines.push(`${v.license_plate}: ${label} date missing`);
        continue;
      }
      const days = daysUntil(dateStr);
      if (days < 0) lines.push(`${v.license_plate}: ${label} expired ${Math.abs(days)}d ago`);
      else if (days <= THRESHOLD_DAYS) lines.push(`${v.license_plate}: ${label} expires in ${days}d`);
    }
  }
  return lines;
}

export function formatDigest(lines: string[]): { subject: string; text: string } {
  const subject = `TMA Fleet — ${lines.length} alert${lines.length === 1 ? "" : "s"}`;
  const text = `${subject}\n\n${lines.map((l) => `• ${l}`).join("\n")}`;
  return { subject, text };
}
