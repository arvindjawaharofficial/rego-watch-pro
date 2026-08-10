import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface EmailRequest {
  to: string;
  subject: string;
  text: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { to, subject, text }: EmailRequest = await req.json();

    // Validate input
    if (!to || !subject || !text) {
      return new Response(
        JSON.stringify({ ok: false, detail: "Missing required fields: to, subject, text" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ ok: false, detail: "Invalid email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Send email using Supabase's native email service
    // This will send via the same SMTP as your sign-up verification
    const { error } = await supabase.auth.admin.sendRawEmail({
      to,
      subject,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div>`,
    });

    if (error) {
      console.error("Supabase email error:", error);
      return new Response(
        JSON.stringify({ ok: false, detail: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Email sent successfully to ${to}`);
    return new Response(
      JSON.stringify({ ok: true, detail: "sent" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Email function error:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        detail: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
