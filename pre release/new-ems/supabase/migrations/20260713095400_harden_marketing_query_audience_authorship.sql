-- Prevent legacy Supabase-auth portal identities from choosing another
-- vendor's identity or exposing a company-only conversation to the client.
create or replace function public.marketing_prepare_query()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.marketing_actor_kind();
  v_next bigint;
  v_vendor_id uuid;
begin
  if v_kind is null or not public.marketing_can_access_project(new.project_id) then
    raise exception 'Not authorized for this Marketing project';
  end if;

  if v_kind = 'vendor' then
    v_vendor_id := coalesce(
      nullif(current_setting('app.marketing_portal_profile_id', true), '')::uuid,
      (select v.id from public.marketing_vendors v where v.auth_user_id = (select auth.uid()) limit 1)
    );
    if v_vendor_id is null then raise exception 'Vendor identity could not be verified'; end if;
    new.vendor_id := v_vendor_id;
    new.audience := case when new.audience = 'client' then 'client' else 'company' end;
  elsif v_kind = 'client' then
    new.vendor_id := null;
    new.audience := 'company';
  else
    new.audience := case when new.audience = 'client' then 'client' else 'company' end;
  end if;

  if new.query_number is null or btrim(new.query_number) = '' then
    perform pg_advisory_xact_lock(hashtext('marketing-query-number'));
    select coalesce(max(nullif(regexp_replace(query_number, '\\D', '', 'g'), '')::bigint), 0) + 1
      into v_next from public.marketing_queries;
    new.query_number := 'MQ-' || lpad(v_next::text, 5, '0');
  end if;
  new.raised_by_label := case v_kind
    when 'client' then 'Client'
    when 'vendor' then 'Varada Nexus Delivery Team'
    else 'Varada Nexus'
  end;
  return new;
end;
$$;

revoke all on function public.marketing_prepare_query() from public, anon, authenticated;
