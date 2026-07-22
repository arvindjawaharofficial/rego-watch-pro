import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fleet RTO · Indian Vehicle Compliance Tracker" },
      { name: "description", content: "Track Insurance, FC, PUC, Road Tax, Permit and RC expiries for your fleet." },
      { property: "og:title", content: "Fleet RTO · Indian Vehicle Compliance Tracker" },
      { property: "og:description", content: "Track Insurance, FC, PUC, Road Tax, Permit and RC expiries for your fleet." },
    ],
  }),
  component: Index,
  ssr: false,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      navigate({ to: data.user ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
      Loading…
    </div>
  );
}
