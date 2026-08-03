import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];

        console.log("[WhatsApp] Verification attempt", {
          mode,
          tokenMatches: token === expected,
          hasChallenge: !!challenge,
          expectedLength: expected?.length,
        });

        if (mode === "subscribe" && token === expected && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
          });
        }

        return new Response("Verification failed", {
          status: 403,
          headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
        });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          console.log("[WhatsApp] Incoming webhook:", JSON.stringify(body));
          return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch (e) {
          console.error("[WhatsApp] Failed to parse webhook body", e);
          return new Response("Bad request", {
            status: 400,
            headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
          });
        }
      },
    },
  },
});
