-- Nexus Intelligence → EMS workflow handoff: captured commercial/trade leads.
--
-- REVIEW BEFORE APPLYING. This migration is authored per the canonical workflow in
-- CLAUDE.md and must be deployed only with: npm run check:migrations → npm run db:dry-run
-- → npm run db:push (when the production change is authorized). It is NOT auto-applied.
--
-- Assumptions to confirm during db:dry-run (they match the patterns already used by the
-- intelligence-feeds Edge Function and the world-monitor migration):
--   * public.current_app_user_id() returns the caller's app_users id from the JWT.
--   * public.has_permission(module_code text, action_code text) authorizes the caller.
--   * public.permissions / public.roles / public.role_permissions exist as used below.

begin;

-- 1) New capability: capturing a Nexus lead into the EMS workflow.
insert into public.permissions (module_code, action_code, label, is_active)
select 'world-monitor', 'lead', 'Nexus Intelligence - Capture lead', true
where not exists (
  select 1 from public.permissions
  where module_code = 'world-monitor' and action_code = 'lead'
);

with internal_roles(role_code) as (
  values
    ('chairman_managing_director'), ('super_admin'), ('admin'), ('coo'),
    ('cfo'), ('manager'), ('operator'), ('accounts'), ('accounts_manager'),
    ('accounts_executive'), ('ca'), ('auditor'), ('advocate'), ('agent')
)
insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from internal_roles ir
join public.roles r on r.code = ir.role_code
join public.permissions p on p.module_code = 'world-monitor' and p.action_code = 'lead'
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = r.id and rp.permission_id = p.id
);

-- 2) Lead store.
create table if not exists public.nexus_leads (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null,
  title         text not null,
  country       text,
  trade_category text,
  commercial_type text,
  source_url    text,
  lead_score    integer check (lead_score between 0 and 100),
  india_relevance integer check (india_relevance between 0 and 100),
  opportunity_score integer check (opportunity_score between 0 and 100),
  evidence_level text,
  status        text not null default 'new'
                  check (status in ('new', 'reviewing', 'pursuing', 'won', 'lost', 'archived')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists nexus_leads_owner_idx on public.nexus_leads (app_user_id, created_at desc);
create index if not exists nexus_leads_status_idx on public.nexus_leads (status);

alter table public.nexus_leads enable row level security;

-- 3) RLS: a caller sees/updates their own captured leads, and may capture only with the
--    world-monitor:lead permission. Mirrors the Edge Function's authorization model.
drop policy if exists nexus_leads_select on public.nexus_leads;
create policy nexus_leads_select on public.nexus_leads
  for select to authenticated using (
    app_user_id = public.current_app_user_id()
    and public.has_permission('world-monitor', 'view')
  );

drop policy if exists nexus_leads_insert on public.nexus_leads;
create policy nexus_leads_insert on public.nexus_leads
  for insert to authenticated with check (
    app_user_id = public.current_app_user_id()
    and public.has_permission('world-monitor', 'lead')
  );

drop policy if exists nexus_leads_update on public.nexus_leads;
create policy nexus_leads_update on public.nexus_leads
  for update to authenticated using (
    app_user_id = public.current_app_user_id()
    and public.has_permission('world-monitor', 'lead')
  ) with check (
    app_user_id = public.current_app_user_id()
    and public.has_permission('world-monitor', 'lead')
  );

-- 4) Auth-gated capture RPC (SECURITY DEFINER) so the client never writes rows directly.
create or replace function public.capture_nexus_lead(lead jsonb)
returns public.nexus_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_app_user_id();
  inserted public.nexus_leads;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_permission('world-monitor', 'lead') then
    raise exception 'Nexus Intelligence lead-capture permission is required';
  end if;

  insert into public.nexus_leads (
    app_user_id, title, country, trade_category, commercial_type, source_url,
    lead_score, india_relevance, opportunity_score, evidence_level, payload
  )
  values (
    caller,
    coalesce(nullif(lead->>'title', ''), 'Untitled lead'),
    nullif(lead->>'country', ''),
    nullif(lead->>'tradeCategory', ''),
    nullif(lead->>'commercialType', ''),
    nullif(lead->>'url', ''),
    nullif(lead->>'leadScore', '')::integer,
    nullif(lead->>'indiaRelevance', '')::integer,
    nullif(lead->>'opportunityScore', '')::integer,
    nullif(lead->>'evidenceLevel', ''),
    coalesce(lead->'payload', '{}'::jsonb)
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.capture_nexus_lead(jsonb) from public;
grant execute on function public.capture_nexus_lead(jsonb) to authenticated;

revoke all on table public.nexus_leads from anon;
grant select, insert, update on table public.nexus_leads to authenticated;

commit;
