// Server-only notification helpers (Telegram + Email).
import { sendLovableEmail, EmailAPIError } from "@lovable.dev/email-js";

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

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<SendResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const senderDomain = process.env["EMAIL_SENDER_DOMAIN"] ?? process.env["SENDER_DOMAIN"];
  if (!apiKey || !senderDomain) return { ok: false, detail: "email_not_configured" };

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(text)}</div>`;
  try {
    await sendLovableEmail(
      {
        to,
        from: `TMA Fleet <alerts@${senderDomain}>`,
        sender_domain: senderDomain,
        subject,
        html,
        text,
      },
      { apiKey },
    );
    return { ok: true, detail: "sent" };
  } catch (e) {
    if (e instanceof EmailAPIError) {
      console.error(`Email send failed [${e.status}]: ${e.message}`);
      return { ok: false, detail: e.code ?? `failed_${e.status}` };
    }
    console.error("Email send failed", e);
    return { ok: false, detail: "failed" };
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
