import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled Telegram + email compliance digest.
 * Called by the database scheduler with the `x-cron-secret` header.
 */
export const Route = createFileRoute("/api/public/notifications/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["NOTIFY_CRON_SECRET"];
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendEmail, sendTelegram, buildAlertLines, formatDigest } = await import(
          "@/lib/notify.server"
        );

        const { data: vehicles } = await supabaseAdmin
          .from("vehicles")
          .select(
            "license_plate, insurance_expiry, fc_expiry, puc_expiry, road_tax_expiry, permit_expiry, rc_expiry",
          );

        const lines = buildAlertLines((vehicles ?? []) as never);
        if (lines.length === 0) return Response.json({ ok: true, alerts: 0 });

        const { subject, text } = formatDigest(lines);
        const { data: settings } = await supabaseAdmin
          .from("notification_settings")
          .select("telegram_bot_token")
          .limit(1)
          .maybeSingle();
        const { data: recipients } = await supabaseAdmin
          .from("notification_recipients")
          .select("kind, value");

        let telegramSent = 0;
        let emailSent = 0;
        for (const r of recipients ?? []) {
          if (r.kind === "telegram") {
            const res = await sendTelegram(
              settings?.telegram_bot_token as string | null,
              r.value as string,
              text,
            );
            if (res.ok) telegramSent++;
          } else if (r.kind === "email") {
            const res = await sendEmail(r.value as string, subject, text);
            if (res.ok) emailSent++;
          }
        }

        return Response.json({ ok: true, alerts: lines.length, telegramSent, emailSent });
      },
    },
  },
});
