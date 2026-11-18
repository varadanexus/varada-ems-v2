alter table public.whatsapp_platform_api_keys add column connection_id uuid references public.whatsapp_platform_connections(id) on delete restrict;
create function public.whatsapp_platform_api_key_number_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.connection_id is not null and not exists(select 1 from public.whatsapp_platform_connections where id=new.connection_id and tenant_id=new.tenant_id) then
    raise exception 'API key number does not belong to workspace';
  end if;
  return new;
end; $$;
create trigger whatsapp_platform_api_key_number_guard before insert or update on public.whatsapp_platform_api_keys
  for each row execute function public.whatsapp_platform_api_key_number_guard();
revoke all on function public.whatsapp_platform_api_key_number_guard() from public,anon,authenticated;
comment on column public.whatsapp_platform_api_keys.connection_id is 'Optional number restriction. Null retains legacy workspace scope; enforced by protected API endpoints.';
notify pgrst,'reload schema';
