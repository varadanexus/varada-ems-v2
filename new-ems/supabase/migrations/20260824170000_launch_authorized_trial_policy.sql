-- Launch is the only self-service entry plan with a new-customer trial.
-- Existing subscriptions retain their immutable trial snapshot; this applies to
-- subscriptions created after the Package Master update.
update public.whatsapp_platform_package_master
set trial_days = 15,
    updated_at = now()
where code = 'launch'
  and trial_days is distinct from 15;

do $$
begin
  if not exists (
    select 1
    from public.whatsapp_platform_package_master
    where code = 'launch'
      and status = 'active'
      and billing_model = 'subscription'
      and trial_days = 15
  ) then
    raise exception 'Launch authorized-trial policy was not applied';
  end if;
end;
$$;

notify pgrst, 'reload schema';
