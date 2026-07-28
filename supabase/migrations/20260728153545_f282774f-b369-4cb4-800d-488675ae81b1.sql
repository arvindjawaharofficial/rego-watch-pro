CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('daily-rto-expiry-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-rto-expiry-check');

SELECT cron.schedule(
  'daily-rto-expiry-check',
  '30 2 * * *',
  $$ SELECT net.http_post(
      url := 'https://zbvflxhdubqrikkbfbdb.supabase.co/functions/v1/check-expiries',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpidmZseGhkdWJxcmlra2JmYmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2OTk3OTgsImV4cCI6MjEwMDI3NTc5OH0.AnRYDx5W7bmShSCH30D99TGZGKKr3V0YtgaXeDpbZ38"}'::jsonb,
      body := '{}'::jsonb
  ); $$
);