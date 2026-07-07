-- Keep external portal authentication consistent with unified_login_lookup and
-- the unified login form, both of which accept username, email, or phone.

create or replace function public.external_portal_login(p_username text, p_password text)
returns table(session_token text, portal_user_id uuid, display_name text, user_type text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_token text;
  v_identifier text := trim(coalesce(p_username, ''));
begin
  if v_identifier = '' or p_password is null then
    raise exception 'Identifier and password are required';
  end if;

  select *
  into v_user
  from public.external_portal_users
  where lower(username) = lower(v_identifier)
     or (email is not null and lower(email) = lower(v_identifier))
     or (phone is not null and trim(phone) = v_identifier)
  order by
    case
      when lower(username) = lower(v_identifier) then 0
      when email is not null and lower(email) = lower(v_identifier) then 1
      else 2
    end,
    created_at
  limit 1;

  if v_user.id is null then
    perform public.log_external_portal_audit_event(
      null,
      'login_failed',
      jsonb_build_object('identifier', v_identifier, 'reason', 'not_found')
    );
    raise exception 'Invalid identifier or password';
  end if;

  if v_user.status <> 'active' or v_user.is_locked then
    perform public.log_external_portal_audit_event(
      v_user.id,
      'login_failed',
      jsonb_build_object('reason', 'locked_or_disabled')
    );
    raise exception 'This account is locked or disabled. Contact your administrator.';
  end if;

  if v_user.password_hash is null
     or crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    update public.external_portal_users
    set failed_login_attempts = failed_login_attempts + 1,
        is_locked = (failed_login_attempts + 1 >= 5)
    where id = v_user.id;

    perform public.log_external_portal_audit_event(
      v_user.id,
      'login_failed',
      jsonb_build_object('reason', 'bad_password')
    );
    raise exception 'Invalid identifier or password';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.external_portal_sessions (portal_user_id, session_token, expires_at)
  values (v_user.id, v_token, now() + interval '12 hours');

  update public.external_portal_users
  set failed_login_attempts = 0,
      last_login_at = now()
  where id = v_user.id;

  perform public.log_external_portal_audit_event(
    v_user.id,
    'login_success',
    jsonb_build_object('identifier_type',
      case
        when lower(v_user.username) = lower(v_identifier) then 'username'
        when v_user.email is not null and lower(v_user.email) = lower(v_identifier) then 'email'
        else 'phone'
      end
    )
  );

  return query
  select v_token, v_user.id, v_user.display_name, v_user.user_type;
end;
$$;

grant execute on function public.external_portal_login(text, text) to anon, authenticated;
