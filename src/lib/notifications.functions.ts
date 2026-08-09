import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const recipientSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().max(80).nullable().optional(),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "Admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

function hash(code: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(code).digest("hex");
}

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 8) return "••••••";
  return `${token.slice(0, 4)}••••••${token.slice(-4)}`;
}

/** Masked core credentials + all recipients. */
export const getNotificationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("notification_settings")
      .select("telegram_bot_token")
      .limit(1)
      .maybeSingle();
    const { data: recipients } = await supabaseAdmin
      .from("notification_recipients")
      .select("id, kind, value, label, is_primary")
      .order("created_at", { ascending: true });
    return {
      botTokenMasked: maskToken((settings?.telegram_bot_token as string | null) ?? null),
      botTokenSet: Boolean(settings?.telegram_bot_token),
      recipients: recipients ?? [],
    };
  });

/** Sends a 6-digit unlock code to the configured admin email IDs (Telegram fallback). */
export const requestUnlockCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmail, sendTelegram } = await import("@/lib/notify.server");

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabaseAdmin.from("notification_unlock_codes").insert({
      code_hash: hash(code),
      requested_by: (context as any).userId,
      expires_at: expiresAt,
    });

    const { data: settings } = await supabaseAdmin
      .from("notification_settings")
      .select("telegram_bot_token")
      .limit(1)
      .maybeSingle();
    const { data: admins } = await supabaseAdmin
      .from("notification_recipients")
      .select("value")
      .eq("kind", "admin_email");
    const { data: chats } = await supabaseAdmin
      .from("notification_recipients")
      .select("value")
      .eq("kind", "telegram")
      .eq("is_primary", true);

    const text = `TMA Fleet security code: ${code}\n\nUse it to unlock notification core credentials. Expires in 15 minutes.`;
    const emailResults: { to: string; detail: string; ok: boolean }[] = [];
    for (const a of admins ?? []) {
      const r = await sendEmail(a.value as string, "TMA Fleet — unlock code", text);
      emailResults.push({ to: a.value as string, ...r });
    }

    const emailDelivered = emailResults.some((r) => r.ok);
    let telegramFallback = false;
    if (!emailDelivered) {
      for (const c of chats ?? []) {
        const r = await sendTelegram(
          settings?.telegram_bot_token as string | null,
          c.value as string,
          text,
        );
        if (r.ok) telegramFallback = true;
      }
    }

    return {
      emailResults,
      emailDelivered,
      telegramFallback,
    };
  });

async function validCode(code: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("notification_unlock_codes")
    .select("id, expires_at, used_at")
    .eq("code_hash", hash(code))
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return data.id as string;
}

export const verifyUnlockCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().trim().length(6) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const id = await validCode(data.code);
    if (!id) throw new Error("Invalid or expired code");
    return { ok: true };
  });

export const saveCoreCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().trim().length(6),
        telegramBotToken: z.string().trim().max(300).nullable(),
        primaryTelegram: z.array(recipientSchema).max(50),
        primaryEmails: z.array(recipientSchema).max(50),
        adminEmails: z.array(recipientSchema).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const id = await validCode(data.code);
    if (!id) throw new Error("Invalid or expired code");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.telegramBotToken !== null) {
      const { data: row } = await supabaseAdmin
        .from("notification_settings")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (row) {
        await supabaseAdmin
          .from("notification_settings")
          .update({ telegram_bot_token: data.telegramBotToken || null })
          .eq("id", row.id as string);
      } else {
        await supabaseAdmin
          .from("notification_settings")
          .insert({ telegram_bot_token: data.telegramBotToken || null });
      }
    }

    const groups: { kind: "telegram" | "email" | "admin_email"; rows: typeof data.primaryTelegram }[] = [
      { kind: "telegram", rows: data.primaryTelegram },
      { kind: "email", rows: data.primaryEmails },
      { kind: "admin_email", rows: data.adminEmails },
    ];
    for (const { kind, rows } of groups) {
      await supabaseAdmin
        .from("notification_recipients")
        .delete()
        .eq("kind", kind)
        .eq("is_primary", true);
      if (rows.length) {
        await supabaseAdmin.from("notification_recipients").upsert(
          rows.map((r) => ({
            kind,
            value: r.value,
            label: r.label ?? null,
            is_primary: true,
          })),
          { onConflict: "kind,value" },
        );
      }
    }

    await supabaseAdmin
      .from("notification_unlock_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", id);

    return { ok: true };
  });

/** Sends the current compliance digest to Telegram + Email recipients. */
export const sendNotificationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmail, sendTelegram, buildAlertLines, formatDigest } = await import(
      "@/lib/notify.server"
    );

    const { data: vehicles } = await supabaseAdmin
      .from("vehicles")
      .select(
        "license_plate, insurance_expiry, fc_expiry, puc_expiry, road_tax_expiry, permit_expiry, rc_expiry",
      );
    const lines = buildAlertLines((vehicles ?? []) as any);
    if (lines.length === 0) {
      return { alerts: 0, telegram: [] as any[], email: [] as any[] };
    }
    const { subject, text } = formatDigest(lines);

    const { data: settings } = await supabaseAdmin
      .from("notification_settings")
      .select("telegram_bot_token")
      .limit(1)
      .maybeSingle();
    const { data: recipients } = await supabaseAdmin
      .from("notification_recipients")
      .select("kind, value, label");

    const telegram: { to: string; ok: boolean; detail: string }[] = [];
    const email: { to: string; ok: boolean; detail: string }[] = [];
    for (const r of recipients ?? []) {
      if (r.kind === "telegram") {
        const res = await sendTelegram(
          settings?.telegram_bot_token as string | null,
          r.value as string,
          text,
        );
        telegram.push({ to: (r.label as string) || (r.value as string), ...res });
      } else if (r.kind === "email") {
        const res = await sendEmail(r.value as string, subject, text);
        email.push({ to: r.value as string, ...res });
      }
    }
    return { alerts: lines.length, telegram, email };
  });

/** Removes an approved email and cascades to the matching user account. */
export const deleteApprovedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), email: z.string().trim().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("approved_emails").delete().eq("id", data.id);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();

    if (profile) {
      const uid = profile.id as string;
      if (uid === (context as any).userId) throw new Error("You cannot delete your own account.");
      await supabaseAdmin.from("push_tokens").delete().eq("user_id", uid);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("profiles").delete().eq("id", uid);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (error) throw new Error(error.message);
      return { removed: true, userDeleted: true };
    }
    return { removed: true, userDeleted: false };
  });
