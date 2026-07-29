-- Secure background publisher for Nexus Social. The random credential remains in
-- Supabase Vault and is validated server-side; it is never stored in frontend code.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'social_publisher_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'social_publisher_cron_secret',
      'Credential used only by pg_cron to invoke the Nexus Social due-post publisher.'
    );
  end if;
end;
$$;

create or replace function public.validate_social_publisher_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(
    p_secret = (select decrypted_secret from vault.decrypted_secrets
                where name = 'social_publisher_cron_secret' limit 1),
    false
  );
$$;

revoke all on function public.validate_social_publisher_cron_secret(text) from public, anon, authenticated;
grant execute on function public.validate_social_publisher_cron_secret(text) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'nexus-social-publisher' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule('nexus-social-publisher', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/social-media-integrations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'social_publisher_cron_secret' limit 1
      )
    ),
    body := '{"action":"process_due","limit":10}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
