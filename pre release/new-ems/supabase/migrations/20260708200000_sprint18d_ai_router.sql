-- Sprint 18D: AI Provider Router — settings, cost tracking, and dashboard views.
-- Additive only. Safe to apply against any Sprint 18A/B/C state.

-- ---------------------------------------------------------------------------
-- 1) ai_router_settings (singleton row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_router_settings (
  id                            int primary key default 1 check (id = 1),

  -- Budget limits
  monthly_budget_usd            numeric(10,2)  not null default 15.00,
  daily_budget_usd              numeric(10,2),                        -- null = no daily cap
  max_cost_per_article_usd      numeric(10,4)  not null default 0.50, -- hard per-article ceiling

  -- Kill-switch
  ai_paused                     boolean        not null default false,

  -- Provider priority (index 0 = highest). Valid values:
  --   openrouter | gemini_direct | openai | anthropic
  provider_priority             text[]         not null
    default array['openrouter','gemini_direct','openai','anthropic'],

  -- Quality escalation: if quality_score < threshold AND tier < premium → escalate once
  quality_escalation_threshold  numeric(5,2)   not null default 90,

  -- Optional model overrides at each tier (applied across all providers).
  -- When set, these override the provider's built-in tier→model mapping.
  cheap_model                   text,
  medium_model                  text,
  premium_model                 text,

  -- Per-task model overrides (JSON map of task_type → model string)
  task_models                   jsonb          not null default '{}',

  updated_at                    timestamptz    not null default now()
);

insert into public.ai_router_settings (id) values (1) on conflict (id) do nothing;

comment on table  public.ai_router_settings is
  'Singleton (id=1) controlling the AI Provider Router: budget, provider order, escalation thresholds.';
comment on column public.ai_router_settings.provider_priority is
  'Ordered array of provider IDs tried in sequence: openrouter, gemini_direct, openai, anthropic.';
comment on column public.ai_router_settings.quality_escalation_threshold is
  'If quality_score < this value the router regenerates using the next-higher tier model (once only).';

-- ---------------------------------------------------------------------------
-- 2) ai_cost_logs — one row per AI API call
-- ---------------------------------------------------------------------------
create table if not exists public.ai_cost_logs (
  id                    uuid        primary key default gen_random_uuid(),

  -- Grouping
  run_id                text,                                          -- 8-char hex from the script run
  run_kind              text        check (run_kind in ('daily','backfill','weekly','manual')),
  post_id               uuid        references public.blog_posts(id) on delete set null,

  -- What was called
  provider              text        not null,                          -- openrouter | gemini_direct | openai | anthropic
  model                 text        not null,
  task_type             text        not null,                          -- article_writing | trend_detection | …
  tier                  text        check (tier in ('cheap','medium','premium')),

  -- Usage
  tokens_in             int,
  tokens_out            int,
  cost_usd              numeric(12,8) not null default 0,

  -- Performance
  duration_ms           int,
  attempt_count         int         not null default 1,

  -- Escalation / fallback
  escalated             boolean     not null default false,
  escalated_from_model  text,
  fallback_from_provider text,

  -- Quality
  quality_score         numeric(5,2),

  -- Error (null on success)
  error                 text,

  created_at            timestamptz not null default now()
);

create index if not exists ai_cost_logs_created_idx  on public.ai_cost_logs (created_at desc);
create index if not exists ai_cost_logs_provider_idx on public.ai_cost_logs (provider, created_at desc);
create index if not exists ai_cost_logs_run_idx      on public.ai_cost_logs (run_id);
create index if not exists ai_cost_logs_post_idx     on public.ai_cost_logs (post_id);

comment on table public.ai_cost_logs is
  'Per-API-call log written by ai-router.mjs. One row per attempt (escalations and fallbacks each get their own row).';

-- ---------------------------------------------------------------------------
-- 3) Aggregation views for the cost dashboard
-- ---------------------------------------------------------------------------

-- Monthly and daily spend totals (plus article count / avg cost)
create or replace view public.v_ai_cost_month as
select
  date_trunc('month', created_at) as month,
  count(*)                         as calls,
  sum(tokens_in)                   as tokens_in,
  sum(tokens_out)                  as tokens_out,
  sum(cost_usd)                    as cost_usd,
  avg(cost_usd) filter (where cost_usd > 0) as avg_cost_per_call,
  count(*) filter (where error is null)      as successes,
  count(*) filter (where error is not null)  as failures
from public.ai_cost_logs
group by 1
order by 1 desc;

-- Breakdown by provider for the current month
create or replace view public.v_ai_cost_by_provider as
select
  provider,
  count(*)           as calls,
  sum(tokens_in)     as tokens_in,
  sum(tokens_out)    as tokens_out,
  sum(cost_usd)      as cost_usd,
  round(avg(duration_ms)::numeric, 0) as avg_duration_ms,
  count(*) filter (where error is null)     as successes,
  count(*) filter (where error is not null) as failures
from public.ai_cost_logs
where date_trunc('month', created_at) = date_trunc('month', now())
group by 1
order by cost_usd desc;

-- Breakdown by model for the current month
create or replace view public.v_ai_cost_by_model as
select
  provider,
  model,
  tier,
  count(*)           as calls,
  sum(tokens_in)     as tokens_in,
  sum(tokens_out)    as tokens_out,
  sum(cost_usd)      as cost_usd,
  round(avg(quality_score)::numeric, 1) as avg_quality,
  count(*) filter (where escalated)         as escalations,
  count(*) filter (where error is not null) as failures
from public.ai_cost_logs
where date_trunc('month', created_at) = date_trunc('month', now())
group by 1, 2, 3
order by cost_usd desc;

-- Daily spend for the last 30 days (for sparkline / trend)
create or replace view public.v_ai_cost_daily as
select
  created_at::date as day,
  count(*)          as calls,
  sum(cost_usd)     as cost_usd
from public.ai_cost_logs
where created_at >= now() - interval '30 days'
group by 1
order by 1 desc;

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
alter table public.ai_router_settings enable row level security;
alter table public.ai_cost_logs       enable row level security;

-- Super-admin full control
create policy "ai_router_settings admin all" on public.ai_router_settings
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

create policy "ai_cost_logs admin all" on public.ai_cost_logs
  for all to authenticated
  using  (public.is_super_admin())
  with check (public.is_super_admin());

grant select, insert, update, delete
  on public.ai_router_settings, public.ai_cost_logs to authenticated;

grant select
  on public.v_ai_cost_month, public.v_ai_cost_by_provider,
     public.v_ai_cost_by_model, public.v_ai_cost_daily
  to authenticated;
