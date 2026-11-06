-- Owner explicitly requested file deletion/removal. Drive files are moved to trash by Edge.
-- This service-only function removes the matching trip metadata after that operation succeeds.
create function public.goa_server_forget_file(p_session text,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_s goa_private.sessions;v_role text;v_count integer;
begin
 select * into v_s from goa_private.sessions where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again';end if;
 select role into v_role from public.goa_members where trip_id=v_s.trip_id and user_id=v_s.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip';end if;
 delete from goa_private.files where id=p_id and trip_id=v_s.trip_id and (uploaded_by=v_s.account_id or v_role='admin');
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Only the uploader or admin can remove this file';end if;
end $$;
revoke execute on function public.goa_server_forget_file(text,uuid) from public,anon,authenticated;
grant execute on function public.goa_server_forget_file(text,uuid) to service_role;
