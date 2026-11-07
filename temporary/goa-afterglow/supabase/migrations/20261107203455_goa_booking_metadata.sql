-- Goa-only booking metadata. No EMS tables are touched.
begin;

alter table goa_private.files
 add column if not exists booking_type text,
 add column if not exists start_date date,
 add column if not exists end_date date;

alter table goa_private.files
 drop constraint if exists files_booking_type_check,
 add constraint files_booking_type_check check (
  booking_type is null or booking_type in ('ticket','stay','transport','activity','other')
 ),
 drop constraint if exists files_booking_dates_check,
 add constraint files_booking_dates_check check (
  end_date is null or start_date is null or end_date>=start_date
 );

create table if not exists goa_private.file_members(
 file_id uuid not null references goa_private.files(id) on delete cascade,
 user_id uuid not null references goa_private.accounts(id) on delete cascade,
 primary key(file_id,user_id)
);
alter table goa_private.file_members enable row level security;
revoke all on goa_private.file_members from public,anon,authenticated;
grant all on goa_private.file_members to service_role;
create index if not exists file_members_user_id_idx on goa_private.file_members(user_id,file_id);

create or replace function public.goa_server_bookings(
 p_action text,
 p_session text,
 p_data jsonb default '{}'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_s goa_private.sessions;
 v_m public.goa_members;
 v_id uuid;
 v_type text;
 v_category text;
 v_start date;
 v_end date;
 v_requested integer;
 v_valid integer;
begin
 select * into v_s from goa_private.sessions
 where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again'; end if;

 select * into v_m from public.goa_members
 where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if not found then raise exception 'You no longer have access to this trip'; end if;
 if v_m.role<>'admin' and not (
  v_m.agreement_version='goa-crew-v1' and
  v_m.agreement_accepted_at is not null and
  v_m.essential_storage_accepted
 ) then raise exception 'Accept the crew agreement before entering the trip'; end if;

 if p_action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object(
   'id',f.id,'name',f.name,'category',f.category,'booking_type',f.booking_type,
   'start_date',f.start_date,'end_date',f.end_date,'mime_type',f.mime_type,
   'size_bytes',f.size_bytes,'uploaded_by',f.uploaded_by,'created_at',f.created_at,
   'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name) order by m.display_name)
    from goa_private.file_members fm join public.goa_members m on m.trip_id=f.trip_id and m.user_id=fm.user_id
    where fm.file_id=f.id),'[]'::jsonb)
  ) order by coalesce(f.start_date,f.created_at::date),f.created_at desc)
  from goa_private.files f where f.trip_id=v_s.trip_id and (
   v_m.role='admin' or f.uploaded_by=v_s.account_id or
   exists(select 1 from goa_private.file_members fm where fm.file_id=f.id and fm.user_id=v_s.account_id)
  )),'[]'::jsonb);
 end if;

 if p_action='file' then
  return (select to_jsonb(f) from goa_private.files f
   where f.id=(p_data->>'id')::uuid and f.trip_id=v_s.trip_id and (
    v_m.role='admin' or f.uploaded_by=v_s.account_id or
    exists(select 1 from goa_private.file_members fm where fm.file_id=f.id and fm.user_id=v_s.account_id)
   ));
 end if;

 if p_action='record' then
  v_type:=p_data->>'booking_type';
  v_category:=case v_type
   when 'ticket' then 'travel/tickets'
   when 'stay' then 'stay/confirmations'
   when 'transport' then 'travel/transfers'
   when 'activity' then 'itinerary/places'
   when 'other' then 'documents/general'
   else null end;
  if v_category is null then raise exception 'Choose a booking category'; end if;
  if coalesce(p_data->>'start_date','')<>'' then v_start:=(p_data->>'start_date')::date; end if;
  if coalesce(p_data->>'end_date','')<>'' then v_end:=(p_data->>'end_date')::date; end if;
  if v_type in ('ticket','transport','activity') and v_start is null then raise exception 'Choose the booking date'; end if;
  if v_type='stay' and (v_start is null or v_end is null) then raise exception 'Choose both check-in and check-out dates'; end if;
  if v_end is not null and v_start is not null and v_end<v_start then raise exception 'The end date must be after the start date'; end if;
  if jsonb_typeof(p_data->'member_ids')<>'array' or jsonb_array_length(p_data->'member_ids')<1 then raise exception 'Select at least one crew member'; end if;
  select count(distinct value) into v_requested from jsonb_array_elements_text(p_data->'member_ids');
  select count(*) into v_valid from public.goa_members m
   where m.trip_id=v_s.trip_id and m.user_id in (select value::uuid from jsonb_array_elements_text(p_data->'member_ids'));
  if v_requested<>v_valid then raise exception 'One or more selected crew members are unavailable'; end if;
  if v_m.role<>'admin' and not exists(select 1 from jsonb_array_elements_text(p_data->'member_ids') x(value) where value::uuid=v_s.account_id) then raise exception 'Include yourself in this booking'; end if;
  insert into goa_private.files(
   trip_id,drive_id,name,category,booking_type,start_date,end_date,mime_type,size_bytes,uploaded_by
  ) values(
   v_s.trip_id,p_data->>'drive_id',left(p_data->>'name',180),v_category,v_type,v_start,v_end,
   p_data->>'mime_type',(p_data->>'size_bytes')::bigint,v_s.account_id
  ) returning id into v_id;
  insert into goa_private.file_members(file_id,user_id)
   select v_id,value::uuid from jsonb_array_elements_text(p_data->'member_ids') group by value;
  return jsonb_build_object('id',v_id);
 end if;

 raise exception 'Unknown booking action';
end $$;

revoke execute on function public.goa_server_bookings(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_bookings(text,text,jsonb) to service_role;

commit;

