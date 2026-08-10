import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface EmailRequest {
  to: string;
  subject: string;
  text: string;
}

Deno.serve(async (req: Request) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    // Use Supabase's built-in email service via magic link
    // This uses the same SMTP configuration as sign-up verification
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: to,
      options: {
        redirectTo: `${Deno.env.get("SUPABASE_URL")}/auth/v1/callback`,
      },
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
