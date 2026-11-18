create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('whatsapp-wallet-balance-alerts','*/5 * * * *',
  $job$select public.whatsapp_wallet_scheduled_alerts();$job$);
