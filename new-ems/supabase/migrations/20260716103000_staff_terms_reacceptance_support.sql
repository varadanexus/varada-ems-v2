-- Extend the audited reacceptance and secure mobile-camera handoff workflows
-- to internal EMS staff. The core Terms actor resolver already identifies
-- staff through auth.uid(), including locally authenticated staff JWTs.

alter table public.legal_terms_reacceptance_requests
  drop constraint if exists legal_terms_reacceptance_requests_actor_type_check;
alter table public.legal_terms_reacceptance_requests
  add constraint legal_terms_reacceptance_requests_actor_type_check
  check (actor_type in ('staff','transport_portal','interiors_portal','external_portal'));

alter table public.legal_terms_mobile_handoffs
  drop constraint if exists legal_terms_mobile_handoffs_actor_type_check;
alter table public.legal_terms_mobile_handoffs
  add constraint legal_terms_mobile_handoffs_actor_type_check
  check (actor_type in ('staff','transport_portal','interiors_portal','external_portal'));

create or replace function public.complete_portal_terms_reacceptance_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_type in ('staff','transport_portal','interiors_portal','external_portal')
     and coalesce(new.acceptance_metadata->>'method','') <> 'admin_recorded_individual_consent' then
    update public.legal_terms_reacceptance_requests
    set status = 'completed', completed_at = new.accepted_at
    where actor_type = new.actor_type
      and actor_id = new.actor_id
      and terms_version = new.terms_version
      and status = 'pending'
      and requested_at <= new.accepted_at;
  end if;
  return new;
end;
$$;

revoke all on function public.complete_portal_terms_reacceptance_request() from public, anon, authenticated;
grant execute on function public.complete_portal_terms_reacceptance_request() to service_role;

notify pgrst, 'reload schema';
