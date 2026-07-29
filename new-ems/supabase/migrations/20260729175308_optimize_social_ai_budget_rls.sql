begin;

drop policy if exists "social ai budgets manage" on public.social_ai_budget_controls;

alter table public.social_ai_media_jobs
  drop constraint if exists social_ai_media_jobs_duration_seconds_check;

alter table public.social_ai_media_jobs
  add constraint social_ai_media_jobs_duration_seconds_check
  check (duration_seconds between 4 and 64);

commit;
