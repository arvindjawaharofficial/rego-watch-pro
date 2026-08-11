create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('tma-digest-0800ist') where exists (select 1 from cron.job where jobname='tma-digest-0800ist');
select cron.unschedule('tma-digest-1300ist') where exists (select 1 from cron.job where jobname='tma-digest-1300ist');
select cron.unschedule('tma-digest-1800ist') where exists (select 1 from cron.job where jobname='tma-digest-1800ist');

select cron.schedule('tma-digest-0800ist','30 2 * * *', $$select net.http_post(url:='https://rego-watch-pro.lovable.app/api/public/notifications/run', headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpidmZseGhkdWJxcmlra2JmYmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2OTk3OTgsImV4cCI6MjEwMDI3NTc5OH0.AnRYDx5W7bmShSCH30D99TGZGKKr3V0YtgaXeDpbZ38"}'::jsonb, body:='{}'::jsonb)$$);
select cron.schedule('tma-digest-1300ist','30 7 * * *', $$select net.http_post(url:='https://rego-watch-pro.lovable.app/api/public/notifications/run', headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpidmZseGhkdWJxcmlra2JmYmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2OTk3OTgsImV4cCI6MjEwMDI3NTc5OH0.AnRYDx5W7bmShSCH30D99TGZGKKr3V0YtgaXeDpbZ38"}'::jsonb, body:='{}'::jsonb)$$);
select cron.schedule('tma-digest-1800ist','30 12 * * *', $$select net.http_post(url:='https://rego-watch-pro.lovable.app/api/public/notifications/run', headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInră5cCI6IkpXVCJ9"}'::jsonb, body:='{}'::jsonb)$$);