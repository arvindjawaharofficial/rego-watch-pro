import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];

        if (mode === "subscribe" && token === expected && challenge) {
          console.log("[WhatsApp] Webhook verified");
          return new Response(challenge, { status: 200 });
        }

        console.warn("[WhatsApp] Webhook verification failed", { mode, token });
        return new Response("Verification failed", { status: 403 });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          console.log("[WhatsApp] Incoming webhook:", JSON.stringify(body));
          // Acknowledge immediately to avoid retries
          return Response.json({ status: "ok" });
        } catch (e) {
          console.error("[WhatsApp] Failed to parse webhook body", e);
          return new Response("Bad request", { status: 400 });
        }
      },
    },
  },
});
