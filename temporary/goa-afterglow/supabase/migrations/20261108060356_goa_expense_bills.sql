begin;

create table goa_private.expense_bills(
 entry_id uuid primary key references public.goa_entries(id) on delete cascade,
 trip_id uuid not null references public.goa_trips(id) on delete cascade,
 drive_id text not null unique,
 name text not null check(length(name) between 1 and 180),
 mime_type text not null,
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null references goa_private.accounts(id),
 created_at timestamptz not null default now()
);
create index expense_bills_trip_created_idx on goa_private.expense_bills(trip_id,created_at desc);
alter table goa_private.expense_bills enable row level security;
revoke all on goa_private.expense_bills from public,anon,authenticated;
grant all on goa_private.expense_bills to service_role;

create or replace function public.goa_server_expense_bills(p_action text,p_session text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_s goa_private.sessions;
 v_role text;
 v_entry public.goa_entries;
 v_bill goa_private.expense_bills;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 select role into v_role from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip';end if;

 if p_action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object(
   'entry_id',b.entry_id,'name',b.name,'mime_type',b.mime_type,'size_bytes',b.size_bytes,
   'uploaded_by',b.uploaded_by,'created_at',b.created_at
  ) order by b.created_at desc) from goa_private.expense_bills b where b.trip_id=v_s.trip_id),'[]'::jsonb);
 end if;

 select * into v_entry from public.goa_entries
 where id=(p_data->>'entry_id')::uuid and trip_id=v_s.trip_id and kind='expense';
 if not found then raise exception 'Expense not found';end if;

 if p_action='record' then
  if v_entry.author_id<>v_s.account_id then raise exception 'Only the expense creator can attach this bill';end if;
  insert into goa_private.expense_bills(entry_id,trip_id,drive_id,name,mime_type,size_bytes,uploaded_by)
  values(v_entry.id,v_s.trip_id,p_data->>'drive_id',p_data->>'name',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,v_s.account_id)
  returning * into v_bill;
  return jsonb_build_object('entry_id',v_bill.entry_id,'name',v_bill.name,'mime_type',v_bill.mime_type,'size_bytes',v_bill.size_bytes,'uploaded_by',v_bill.uploaded_by,'created_at',v_bill.created_at);
 end if;

 select * into v_bill from goa_private.expense_bills where entry_id=v_entry.id and trip_id=v_s.trip_id;
 if not found then return null;end if;
 if p_action='file' then
  return jsonb_build_object('drive_id',v_bill.drive_id,'name',v_bill.name,'mime_type',v_bill.mime_type,'size_bytes',v_bill.size_bytes);
 end if;
 if p_action='removeInfo' then
  if v_role<>'admin' and v_entry.author_id<>v_s.account_id then raise exception 'You cannot remove this expense';end if;
  return jsonb_build_object('drive_id',v_bill.drive_id,'name',v_bill.name);
 end if;
 raise exception 'Unknown bill action';
end $$;

revoke execute on function public.goa_server_expense_bills(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.goa_server_expense_bills(text,text,jsonb) to service_role;

commit;

