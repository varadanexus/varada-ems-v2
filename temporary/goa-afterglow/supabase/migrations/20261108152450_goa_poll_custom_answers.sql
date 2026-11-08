-- Goa-only poll custom answers. No EMS tables or functions are touched.
begin;

create or replace function public.goa_server_poll_custom_vote(
 p_session text,
 p_entry uuid,
 p_answer text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_session goa_private.sessions;
 v_role text;
 v_entry public.goa_entries;
 v_answer text;
 v_options jsonb;
 v_index integer;
begin
 select * into v_session
 from goa_private.sessions
 where token_hash=p_session and revoked_at is null and expires_at>now();
 if not found then raise exception 'Please sign in again'; end if;

 select role into v_role
 from public.goa_members
 where trip_id=v_session.trip_id and user_id=v_session.account_id;
 if v_role is null then raise exception 'You no longer have access to this trip'; end if;

 v_answer:=regexp_replace(trim(coalesce(p_answer,'')),'[[:space:]]+',' ','g');
 if length(v_answer) not between 1 and 100 then
  raise exception 'Enter an answer using 1 to 100 characters';
 end if;

 select * into v_entry
 from public.goa_entries
 where id=p_entry and trip_id=v_session.trip_id and kind='poll'
 for update;
 if not found then raise exception 'Poll not found'; end if;
 if coalesce(v_entry.data->>'allow_other','false')<>'true' then
  raise exception 'This poll does not accept new answers';
 end if;

 v_options:=v_entry.data->'options';
 if jsonb_typeof(v_options)<>'array' then raise exception 'Poll options are unavailable'; end if;

 select item.position-1 into v_index
 from jsonb_array_elements_text(v_options) with ordinality as item(value,position)
 where lower(item.value)=lower(v_answer)
 limit 1;

 if v_index is null then
  if jsonb_array_length(v_options)>=20 then raise exception 'This poll already has the maximum number of answers'; end if;
  v_index:=jsonb_array_length(v_options);
  v_options:=v_options||to_jsonb(v_answer);
  update public.goa_entries
  set data=jsonb_set(data,'{options}',v_options,false)
  where id=v_entry.id;
 end if;

 insert into public.goa_votes(trip_id,entry_id,user_id,option_index)
 values(v_session.trip_id,v_entry.id,v_session.account_id,v_index)
 on conflict(entry_id,user_id)
 do update set option_index=excluded.option_index;

 return jsonb_build_object('option_index',v_index,'options',v_options);
end
$$;

revoke all on function public.goa_server_poll_custom_vote(text,uuid,text) from public,anon,authenticated;
grant execute on function public.goa_server_poll_custom_vote(text,uuid,text) to service_role;

commit;

