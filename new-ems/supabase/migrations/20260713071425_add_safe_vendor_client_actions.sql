-- Transactional lead conversion prevents duplicate clients from repeated UI
-- actions. SECURITY INVOKER preserves the caller's existing RLS permissions.
create or replace function public.ds_convert_lead_to_client(p_lead_id uuid)
returns public.ds_clients
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead public.ds_leads%rowtype;
  v_client public.ds_clients%rowtype;
begin
  select * into v_lead
  from public.ds_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found.';
  end if;

  if v_lead.converted_client_id is not null then
    select * into v_client from public.ds_clients where id = v_lead.converted_client_id;
    if found then return v_client; end if;
  end if;

  insert into public.ds_clients (
    name, company_name, email, phone, whatsapp, status, notes
  ) values (
    v_lead.name,
    v_lead.company_name,
    v_lead.email,
    v_lead.phone,
    v_lead.phone,
    'active',
    'Converted from lead' || case when v_lead.source is not null then ' (' || v_lead.source || ')' else '' end
  )
  returning * into v_client;

  update public.ds_leads
  set stage = 'won', converted_client_id = v_client.id, updated_at = now()
  where id = v_lead.id;

  return v_client;
end;
$$;

-- Client deletion is intentionally non-cascading at the application boundary.
-- Historical project and billing records must be closed/removed explicitly.
create or replace function public.ds_delete_client(p_client_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.ds_projects where client_id = p_client_id)
     or exists (select 1 from public.ds_subscriptions where client_id = p_client_id)
     or exists (select 1 from public.ds_invoices where client_id = p_client_id)
     or exists (select 1 from public.ds_credit_notes where client_id = p_client_id) then
    raise exception 'Client cannot be deleted because projects, subscriptions, invoices, or credit notes are linked to it.';
  end if;

  delete from public.ds_clients where id = p_client_id;
  if not found then raise exception 'Client not found.'; end if;
end;
$$;

create or replace function public.marketing_delete_vendor(p_vendor_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.marketing_project_assignments where vendor_id = p_vendor_id) then
    raise exception 'Vendor cannot be deleted because project assignments are linked to it.';
  end if;

  delete from public.marketing_vendors where id = p_vendor_id;
  if not found then raise exception 'Vendor not found or deletion is not permitted.'; end if;
end;
$$;

revoke all on function public.ds_convert_lead_to_client(uuid) from public, anon;
revoke all on function public.ds_delete_client(uuid) from public, anon;
revoke all on function public.marketing_delete_vendor(uuid) from public, anon;
grant execute on function public.ds_convert_lead_to_client(uuid) to authenticated;
grant execute on function public.ds_delete_client(uuid) to authenticated;
grant execute on function public.marketing_delete_vendor(uuid) to authenticated;
