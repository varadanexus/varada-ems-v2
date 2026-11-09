-- Keep Goa payment groups valid when an admin removes trip access.
create or replace function goa_private.guard_payment_group_member_removal() returns trigger
language plpgsql
set search_path=''
as $$
begin
 if exists(
  select 1 from goa_private.payment_groups
  where trip_id=old.trip_id and head_account_id=old.user_id
 ) then
  raise exception 'Change this person''s payment group head before removing them from the trip';
 end if;
 delete from goa_private.payment_group_members
 where trip_id=old.trip_id and account_id=old.user_id;
 return old;
end
$$;

drop trigger if exists goa_payment_group_member_removal_guard on public.goa_members;
create trigger goa_payment_group_member_removal_guard
before delete on public.goa_members
for each row execute function goa_private.guard_payment_group_member_removal();

revoke all on function goa_private.guard_payment_group_member_removal() from public,anon,authenticated;
grant execute on function goa_private.guard_payment_group_member_removal() to service_role;

