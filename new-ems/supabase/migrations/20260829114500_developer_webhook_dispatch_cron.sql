-- Secure one-minute retry runner for developer webhook delivery jobs.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'whatsapp_platform_webhook_dispatch_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'whatsapp_platform_webhook_dispatch_secret',
      'Credential used only by pg_cron to run durable customer webhook retries.'
    );
  end if;
end;
$$;

create or replace function public.whatsapp_platform_validate_webhook_dispatch_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(
    p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_platform_webhook_dispatch_secret' limit 1),
    false
  );
$$;
revoke all on function public.whatsapp_platform_validate_webhook_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_validate_webhook_dispatch_secret(text) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'whatsapp-platform-developer-webhook-dispatcher' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end;
$$;

select cron.schedule('whatsapp-platform-developer-webhook-dispatcher', '* * * * *', $job$
  select net.http_post(
    url := 'https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/whatsapp-platform-webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'whatsapp_platform_webhook_dispatch_secret' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
