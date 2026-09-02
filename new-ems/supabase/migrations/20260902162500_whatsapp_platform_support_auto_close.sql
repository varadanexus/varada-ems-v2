-- Customer-support inactivity deadline and secure scheduler.
alter table public.whatsapp_platform_support_tickets
  add column if not exists auto_close_at timestamptz;

create index if not exists idx_wp_support_auto_close_due
  on public.whatsapp_platform_support_tickets(auto_close_at)
  where status = 'waiting_on_customer' and auto_close_at is not null;

alter table public.whatsapp_platform_support_email_deliveries
  drop constraint if exists whatsapp_platform_support_email_deliveries_event_kind_check;
alter table public.whatsapp_platform_support_email_deliveries
  add constraint whatsapp_platform_support_email_deliveries_event_kind_check
  check (event_kind in ('ticket_created','support_replied','ticket_resolved','ticket_closed'));

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'whatsapp_platform_support_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'whatsapp_platform_support_cron_secret', 'Credential used only to close inactive customer-support tickets.');
  end if;
end $$;

create or replace function public.whatsapp_platform_validate_support_cron_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public, vault as $$
  select coalesce(p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_platform_support_cron_secret' limit 1), false);
$$;
revoke all on function public.whatsapp_platform_validate_support_cron_secret(text) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_validate_support_cron_secret(text) to service_role;

do $$ declare existing_job bigint; begin
  select jobid into existing_job from cron.job where jobname = 'whatsapp-platform-support-auto-close' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule('whatsapp-platform-support-auto-close', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/whatsapp-platform-support',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-support-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_platform_support_cron_secret' limit 1)),
    body := '{"action":"system_close_stale"}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

notify pgrst, 'reload schema';
