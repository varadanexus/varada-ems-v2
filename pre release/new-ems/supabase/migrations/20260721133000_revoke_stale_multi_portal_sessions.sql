-- Force accounts with more than one distinct active external portal to pass
-- through the new selector on their next authenticated login. Existing access
-- grants are unchanged; only pre-selector sessions are revoked.

update public.external_portal_sessions s
set revoked_at=now()
where s.revoked_at is null
  and s.portal_user_id in (
    select a.portal_user_id
    from public.external_portal_access a
    where a.is_active and (a.expires_at is null or a.expires_at>now())
    group by a.portal_user_id
    having count(distinct (a.source_module||':'||a.access_scope))>1
  );
