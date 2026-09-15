-- Uses the existing database scheduler, with no new external hosting service.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('whatsapp-wallet-billing-event-retry','* * * * *',
  $job$select public.whatsapp_wallet_scheduled_retry();$job$);
