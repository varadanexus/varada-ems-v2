-- Reserve ownership using a trusted connected-account email. No public first-visitor claim.
create table public.goa_owner_reservations (
 trip_id uuid primary key references public.goa_trips on delete cascade,
 email text not null,
 claimed_by uuid references auth.users,
 claimed_at timestamptz
);
alter table public.goa_owner_reservations enable row level security;
revoke all on public.goa_owner_reservations from anon,authenticated;
create function public.goa_claim_admin(p_trip uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_r public.goa_owner_reservations;v_email text;v_confirmed boolean;
begin
 if auth.uid() is null then return false; end if;
 select email,email_confirmed_at is not null into v_email,v_confirmed from auth.users where id=auth.uid();
 select * into v_r from public.goa_owner_reservations where trip_id=p_trip for update;
 if not found or lower(v_email)<>v_r.email then return false; end if;
 if not v_confirmed then raise exception 'Confirm your email before activating the admin account'; end if;
 if v_r.claimed_by is not null and v_r.claimed_by<>auth.uid() then return false; end if;
 insert into public.goa_members(trip_id,user_id,role,display_name) values(p_trip,auth.uid(),'admin','Trip admin') on conflict do nothing;
 update public.goa_owner_reservations set claimed_by=auth.uid(),claimed_at=coalesce(claimed_at,now()) where trip_id=p_trip;
 return true;
end;
$$;
revoke execute on function public.goa_claim_admin(uuid) from public,anon;
grant execute on function public.goa_claim_admin(uuid) to authenticated;
