-- Tenant-scoped billing command audit and concurrency-safe abuse protection.
-- Request bodies, session tokens, payment data and secrets are never retained.

create table public.whatsapp_platform_billing_action_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  user_id uuid references public.whatsapp_platform_users(id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_]{1,79}$'),
  outcome text not null default 'requested' check (outcome in ('requested','succeeded','failed','rate_limited')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index whatsapp_platform_billing_action_audit_tenant_idx
  on public.whatsapp_platform_billing_action_audit(tenant_id, created_at desc);
create index whatsapp_platform_billing_action_audit_action_idx
  on public.whatsapp_platform_billing_action_audit(action, created_at desc);

alter table public.whatsapp_platform_billing_action_audit enable row level security;
revoke all on public.whatsapp_platform_billing_action_audit from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_platform_billing_action_audit to service_role;

create or replace function public.whatsapp_platform_begin_billing_action(
  p_tenant_id uuid,
  p_user_id uuid,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Billing action audit is server-only' using errcode = '42501'; end if;
  if p_action !~ '^[a-z][a-z0-9_]{1,79}$' or p_max_requests not between 1 and 1000 or p_window_seconds not between 1 and 3600 then
    raise exception 'Billing action rate-limit parameters are invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_action, 0));
  select count(*) into v_count
  from public.whatsapp_platform_billing_action_audit
  where tenant_id = p_tenant_id and action = p_action
    and created_at >= now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max_requests then
    insert into public.whatsapp_platform_billing_action_audit(tenant_id, user_id, action, outcome, completed_at)
    values(p_tenant_id, p_user_id, p_action, 'rate_limited', now())
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'allowed', false);
  end if;
  insert into public.whatsapp_platform_billing_action_audit(tenant_id, user_id, action)
  values(p_tenant_id, p_user_id, p_action)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'allowed', true);
end;
$$;

revoke all on function public.whatsapp_platform_begin_billing_action(uuid,uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_begin_billing_action(uuid,uuid,text,integer,integer) to service_role;

comment on table public.whatsapp_platform_billing_action_audit is
  'Minimal server-only billing command audit and rate-limit evidence; no credentials, tokens or payment instrument data.';

do $$
declare
  v_tenant_id uuid := gen_random_uuid();
  v_first jsonb;
  v_second jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.whatsapp_platform_tenants(id, name, slug, owner_email, status, plan_code)
  values(v_tenant_id, 'Billing rate QA', 'billing-rate-qa-' || replace(v_tenant_id::text, '-', ''), 'billing-rate-qa@example.invalid', 'active', 'launch');
  v_first := public.whatsapp_platform_begin_billing_action(v_tenant_id, null, 'qa_rate_limit', 1, 60);
  v_second := public.whatsapp_platform_begin_billing_action(v_tenant_id, null, 'qa_rate_limit', 1, 60);
  if coalesce((v_first->>'allowed')::boolean, false) is not true
     or coalesce((v_second->>'allowed')::boolean, true) is not false then
    raise exception 'Billing rate-limit QA failed.';
  end if;
  delete from public.whatsapp_platform_billing_action_audit where tenant_id = v_tenant_id;
  delete from public.whatsapp_platform_tenants where id = v_tenant_id;
end;
$$;
