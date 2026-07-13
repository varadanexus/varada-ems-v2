-- Sprint 17c: Automatic retainer invoicing via pg_cron
-- Runs the due-subscription biller once a day (03:00 UTC). Because
-- ds_generate_due_subscription_invoices() only bills subscriptions whose
-- next_invoice_date has arrived and then advances that date by the cycle, a
-- daily check bills each retainer on its own date at its own cadence
-- (monthly / quarterly / annual) without any manual clicks.

create extension if not exists pg_cron;

-- Re-schedule idempotently so re-running this migration never duplicates the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ds-daily-retainer-invoicing') then
    perform cron.unschedule('ds-daily-retainer-invoicing');
  end if;
end $$;

select cron.schedule(
  'ds-daily-retainer-invoicing',
  '0 3 * * *',
  $job$ select public.ds_generate_due_subscription_invoices(); $job$
);
