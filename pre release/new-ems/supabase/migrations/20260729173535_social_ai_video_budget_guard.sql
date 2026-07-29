begin;

alter table public.social_ai_generations
  drop constraint if exists social_ai_generations_generation_type_check;

alter table public.social_ai_generations
  add constraint social_ai_generations_generation_type_check
  check (generation_type in ('text', 'image', 'video'));

alter table public.social_ai_generations
  add column if not exists estimated_cost_usd numeric(12, 6) not null default 0,
  add column if not exists external_operation_id text;

create table if not exists public.social_ai_budget_controls (
  brand_id uuid primary key references public.social_brands(id) on delete cascade,
  cloud_project_id text not null,
  credit_currency text not null default 'INR' check (credit_currency = 'INR'),
  credit_remaining_at_setup_inr numeric(12, 2) not null check (credit_remaining_at_setup_inr >= 0),
  max_automation_spend_inr numeric(12, 2) not null check (max_automation_spend_inr >= 0),
  estimated_spend_inr numeric(12, 2) not null default 0 check (estimated_spend_inr >= 0),
  usd_to_inr_rate numeric(10, 4) not null default 84,
  hard_stop_enabled boolean not null default true,
  credit_expires_at timestamptz,
  last_verified_at timestamptz,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_automation_spend_inr <= credit_remaining_at_setup_inr)
);

create table if not exists public.social_ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  content_id uuid references public.social_content_items(id) on delete set null,
  requested_by uuid references public.app_users(id) on delete set null,
  provider text not null default 'vertex',
  model text not null,
  media_type text not null check (media_type = 'video'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed', 'blocked')),
  prompt text not null,
  aspect_ratio text not null default '9:16' check (aspect_ratio in ('9:16', '16:9')),
  duration_seconds integer not null default 4 check (duration_seconds in (4, 6, 8)),
  operation_name text,
  estimated_cost_usd numeric(12, 6) not null default 0,
  estimated_cost_inr numeric(12, 2) not null default 0,
  storage_path text,
  public_url text,
  error_message text,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists social_ai_media_jobs_status_idx
  on public.social_ai_media_jobs(status, created_at desc);

create or replace function public.reserve_social_ai_budget(
  p_brand_id uuid,
  p_estimated_cost_inr numeric,
  p_actor_id uuid
)
returns public.social_ai_budget_controls
language plpgsql
security definer
set search_path = public
as $$
declare
  budget public.social_ai_budget_controls;
begin
  if p_estimated_cost_inr <= 0 then
    raise exception 'Estimated AI cost must be positive';
  end if;

  select * into budget
  from public.social_ai_budget_controls
  where brand_id = p_brand_id
  for update;

  if not found then
    raise exception 'AI credit budget is not configured';
  end if;
  if budget.credit_expires_at is not null and budget.credit_expires_at <= now() then
    raise exception 'Google Cloud AI credit has expired';
  end if;
  if budget.hard_stop_enabled
     and budget.estimated_spend_inr + p_estimated_cost_inr > budget.max_automation_spend_inr then
    raise exception 'AI credit guard stopped this request before paid usage';
  end if;

  update public.social_ai_budget_controls
  set estimated_spend_inr = estimated_spend_inr + p_estimated_cost_inr,
      updated_by = p_actor_id,
      updated_at = now()
  where brand_id = p_brand_id
  returning * into budget;

  return budget;
end;
$$;

revoke all on function public.reserve_social_ai_budget(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.reserve_social_ai_budget(uuid, numeric, uuid) to service_role;

alter table public.social_ai_budget_controls enable row level security;
alter table public.social_ai_media_jobs enable row level security;

drop policy if exists "social ai budgets view" on public.social_ai_budget_controls;
create policy "social ai budgets view" on public.social_ai_budget_controls
for select using (public.has_permission('social-media-manager', 'view'));

drop policy if exists "social ai budgets manage" on public.social_ai_budget_controls;
create policy "social ai budgets manage" on public.social_ai_budget_controls
for all using (public.has_permission('social-media-manager', 'admin'))
with check (public.has_permission('social-media-manager', 'admin'));

drop policy if exists "social ai media jobs view" on public.social_ai_media_jobs;
create policy "social ai media jobs view" on public.social_ai_media_jobs
for select using (public.has_permission('social-media-manager', 'view'));

revoke all on table public.social_ai_budget_controls from anon;
revoke all on table public.social_ai_media_jobs from anon;
grant select on table public.social_ai_budget_controls to authenticated;
grant select on table public.social_ai_media_jobs to authenticated;

insert into public.social_ai_budget_controls (
  brand_id,
  cloud_project_id,
  credit_remaining_at_setup_inr,
  max_automation_spend_inr,
  usd_to_inr_rate,
  hard_stop_enabled,
  credit_expires_at,
  last_verified_at
)
select
  id,
  'project-8f368954-94fc-4e2d-887',
  26530.28,
  25734.37,
  84,
  true,
  '2026-10-26 23:59:59+05:30'::timestamptz,
  now()
from public.social_brands
where slug = 'varada-nexus'
on conflict (brand_id) do update set
  cloud_project_id = excluded.cloud_project_id,
  credit_remaining_at_setup_inr = excluded.credit_remaining_at_setup_inr,
  max_automation_spend_inr = excluded.max_automation_spend_inr,
  usd_to_inr_rate = excluded.usd_to_inr_rate,
  hard_stop_enabled = true,
  credit_expires_at = excluded.credit_expires_at,
  last_verified_at = excluded.last_verified_at,
  updated_at = now();

commit;
