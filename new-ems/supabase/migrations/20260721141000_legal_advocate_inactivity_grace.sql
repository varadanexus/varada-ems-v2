-- Give the browser's 30-second activity-confirmation modal enough time to
-- refresh an idle advocate session. The UI warns at 30 minutes; the database
-- refuses portal access after the grace window.
create or replace function public.legal_advocate_portal_resolve(p_session_token text)
returns table(portal_user_id uuid,advocate_id uuid)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user record;
  v_session public.external_portal_sessions%rowtype;
begin
  select s.* into v_session
  from public.external_portal_sessions s
  where s.session_token=p_session_token and s.revoked_at is null and s.expires_at>clock_timestamp()
  for update;
  if v_session.id is null then raise exception 'Advocate portal session is not valid'; end if;
  if v_session.last_activity_at < clock_timestamp() - interval '30 minutes 30 seconds' then
    raise exception 'Portal session expired after 30 minutes of inactivity';
  end if;
  update public.external_portal_sessions set last_activity_at=clock_timestamp() where id=v_session.id;

  select * into v_user from public.external_portal_validate_session(p_session_token) limit 1;
  if v_user.portal_user_id is null then raise exception 'Advocate portal session is not valid'; end if;
  return query select v_user.portal_user_id,a.record_id from public.external_portal_access a
  join public.legal_advocates v on v.id=a.record_id
  where a.portal_user_id=v_user.portal_user_id and a.source_module='legal' and a.access_scope='legal_advocate_portal'
    and a.record_type='legal_advocates' and a.is_active and (a.expires_at is null or a.expires_at>now()) and v.status='active'
  order by a.granted_at desc limit 1;
end $$;

revoke all on function public.legal_advocate_portal_resolve(text) from public;
notify pgrst, 'reload schema';
