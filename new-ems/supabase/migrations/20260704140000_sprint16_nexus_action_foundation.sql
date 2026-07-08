-- Sprint 16: Nexus action foundation — security lockdown, server-side capability
-- registry, pending actions with single-use confirmations, audit log, rate
-- limiting, knowledge registry, and registry-driven workflows.
--
-- Design notes:
-- * Nexus stays rule-based inside Postgres (no external AI keys anywhere).
-- * The Roles & Permissions matrix is the only permission source: staff checks go
--   through has_permission()/is_super_admin(); portal actors may use an action
--   only when their actor type is explicitly allow-listed on the registry row.
-- * Every actionable capability is defined server-side; the browser never decides
--   what is allowed.
-- NOTE: after applying, run `notify pgrst, 'reload schema';`

-- ============================================================================
-- 1) SECURITY LOCKDOWN — internal helpers were executable by anon/authenticated
--    with caller-supplied actor identities (privilege escalation). Only the
--    SECURITY DEFINER chat RPCs may call them from now on.
-- ============================================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.chat_ai_answer(text, uuid, text)',
    'public.chat_ai_access_answer(text, uuid, text)',
    'public.chat_ai_operator_answer(text, uuid, text)',
    'public.chat_ai_status_answer(text, uuid, text)',
    'public.chat_actor_label(text, uuid)',
    'public.chat_conversation_has_actor(uuid, text, uuid)',
    'public.chat_can_access_conversation(uuid, text, uuid)',
    'public.chat_can_send_in_conversation(uuid, text, uuid)',
    'public.chat_is_super_admin_staff(uuid)'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    exception when undefined_function then
      null; -- tolerate environments where a layer was not created
    end;
  end loop;
end $$;

-- ============================================================================
-- 2) CAPABILITY / ACTION REGISTRY
-- ============================================================================
create table if not exists public.nexus_action_registry (
  action_code text primary key,
  module_code text not null,
  required_action text not null default 'view',
  allowed_actor_types text[] not null default array['staff'],
  title text not null,
  description text,
  input_schema jsonb not null default '{}'::jsonb,
  handler_kind text not null default 'navigate' check (handler_kind in ('navigate','rpc')),
  handler_target text not null,          -- route for navigate, function name for rpc
  confirm_required boolean not null default false,
  audit_category text not null default 'navigation',
  keywords text not null default '',     -- lowercase matching hints for suggestions
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.nexus_action_registry enable row level security;
-- no policies: only SECURITY DEFINER RPCs read this table.

insert into public.nexus_action_registry
  (action_code, module_code, required_action, title, description, handler_kind, handler_target, confirm_required, audit_category, keywords, sort_order)
values
  ('transport.trip.create',      'transport-create-trip',            'create', 'Create Trip',                 'Open the trip creation workspace with masters, rates, and validations.', 'navigate', '/new-ems/modules/transport-create-trip/index.html',            false, 'navigation', 'trip create add new dispatch vehicle truck', 10),
  ('transport.trips.open',       'transport-trips',                  'view',   'Open Trips',                  'Trip register with status timeline, documents, and expenses.',           'navigate', '/new-ems/modules/transport-trips/index.html',                   false, 'navigation', 'trip trips dispatch transit delivery status', 20),
  ('transport.expense.create',   'transport-trip-expenses',          'create', 'Add Trip Expense',            'Record diesel, toll, or support expenses against a trip.',               'navigate', '/new-ems/modules/transport-trip-expenses/index.html',           false, 'navigation', 'expense diesel toll advance support deduction', 30),
  ('transport.bill.create',      'transport-client-billing',         'create', 'Create Client Bill',          'Group completed trips into a client bill with GST treatment.',           'navigate', '/new-ems/modules/transport-client-billing/index.html',          false, 'navigation', 'bill invoice billing client generate receivable', 40),
  ('transport.receipt.create',   'transport-client-receipts',        'create', 'Record Client Receipt',       'Record money received against an approved client bill.',                 'navigate', '/new-ems/modules/transport-client-receipts/index.html',         false, 'navigation', 'receipt collection received money', 50),
  ('transport.statement.create', 'transport-transporter-statements', 'create', 'Create Transporter Statement','Generate a payable statement from completed trips.',                     'navigate', '/new-ems/modules/transport-transporter-statements/index.html',  false, 'navigation', 'statement transporter payable settlement', 60),
  ('transport.payment.create',   'transport-transporter-payments',   'create', 'Record Transporter Payment',  'Record a payment against an approved transporter statement.',            'navigate', '/new-ems/modules/transport-transporter-payments/index.html',    false, 'navigation', 'payment paid transporter pay', 70),
  ('accounts.gst.open',          'central-accounts-gst-compliance',  'view',   'Open GST Compliance',         'GST reconciliation, filing periods, and export packs.',                  'navigate', '/new-ems/modules/central-accounts-gst-compliance/index.html',   false, 'navigation', 'gst gstr tax return filing compliance', 80),
  ('accounts.journals.open',     'central-accounts-journals',        'view',   'Open Journals',               'Posted journals and ledger drill-down.',                                 'navigate', '/new-ems/modules/central-accounts-journals/index.html',         false, 'navigation', 'journal ledger posting entries', 90),
  ('interiors.projects.open',    'interiors-projects',               'view',   'Open Interiors Projects',     'Interiors project register and workspaces.',                             'navigate', '/new-ems/modules/interiors-projects/index.html',                false, 'navigation', 'interior interiors project site design', 100),
  ('interiors.approvals.open',   'interiors-approvals',              'view',   'Open Approvals',              'Pending internal and client approvals.',                                 'navigate', '/new-ems/modules/interiors-approvals/index.html',               false, 'navigation', 'approval approve reject pending revision', 110),
  ('admin.roles.open',           'roles',                            'view',   'Open Roles & Permissions',    'Role matrix controlling page and action grants.',                        'navigate', '/new-ems/modules/roles/index.html',                             false, 'navigation', 'role permission access matrix grant', 120),
  ('admin.portal-access.open',   'portal-access',                    'view',   'Open Portal Access',          'Provision client, transporter, agent, and vendor portal logins.',        'navigate', '/new-ems/modules/portal-access/index.html',                     false, 'navigation', 'portal access client login transporter agent vendor', 130)
on conflict (action_code) do update set
  module_code = excluded.module_code,
  required_action = excluded.required_action,
  title = excluded.title,
  description = excluded.description,
  handler_kind = excluded.handler_kind,
  handler_target = excluded.handler_target,
  confirm_required = excluded.confirm_required,
  audit_category = excluded.audit_category,
  keywords = excluded.keywords,
  sort_order = excluded.sort_order,
  is_active = true;

-- ============================================================================
-- 3) PENDING ACTIONS + AUDIT LOG
-- ============================================================================
create table if not exists public.nexus_pending_actions (
  id uuid primary key default gen_random_uuid(),
  action_code text not null references public.nexus_action_registry(action_code),
  requested_by_type text not null,
  requested_by_id uuid not null,
  conversation_id uuid,
  payload jsonb not null default '{}'::jsonb,
  preview text not null,
  status text not null default 'pending' check (status in ('pending','executed','failed','expired','cancelled')),
  confirm_token uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  result jsonb,
  error text
);
create unique index if not exists uq_nexus_pending_idempotency
  on public.nexus_pending_actions (requested_by_type, requested_by_id, idempotency_key);
alter table public.nexus_pending_actions enable row level security;

create table if not exists public.nexus_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id uuid not null,
  category text not null,
  action_code text,
  conversation_id uuid,
  pending_action_id uuid,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_nexus_audit_actor_time on public.nexus_audit_log (actor_type, actor_id, created_at desc);
alter table public.nexus_audit_log enable row level security;
drop policy if exists nexus_audit_admin_select on public.nexus_audit_log;
create policy nexus_audit_admin_select on public.nexus_audit_log
  for select to authenticated using (public.is_super_admin());

create or replace function public.nexus_audit(
  p_actor_type text, p_actor_id uuid, p_category text, p_action_code text,
  p_conversation_id uuid, p_pending_action_id uuid, p_event text, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.nexus_audit_log(actor_type, actor_id, category, action_code, conversation_id, pending_action_id, event, details)
  values (p_actor_type, p_actor_id, p_category, p_action_code, p_conversation_id, p_pending_action_id, p_event, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.nexus_audit(text, uuid, text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ============================================================================
-- 4) RATE LIMITING (event-count based; also used by chat_send_message)
-- ============================================================================
create or replace function public.nexus_rate_limit_exceeded(
  p_actor_type text, p_actor_id uuid, p_event text, p_limit int, p_window interval
) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= p_limit
  from public.nexus_audit_log
  where actor_type = p_actor_type and actor_id = p_actor_id
    and event = p_event and created_at > now() - p_window;
$$;
revoke execute on function public.nexus_rate_limit_exceeded(text, uuid, text, int, interval) from public, anon, authenticated;

-- ============================================================================
-- 5) PERMISSION RESOLUTION for a chat actor against a registry row
--    Staff: matrix via has_permission()/is_super_admin() (auth context = caller).
--    Portal: actor type must be allow-listed on the row (none are today).
-- ============================================================================
create or replace function public.nexus_actor_allowed(
  p_actor_type text, p_module_code text, p_required_action text, p_allowed_actor_types text[]
) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not (coalesce(p_allowed_actor_types, array['staff']) @> array[p_actor_type]) then
    return false;
  end if;
  if p_actor_type = 'staff' then
    return public.is_super_admin() or public.has_permission(p_module_code, p_required_action);
  end if;
  -- Portal actors: allow-list only; they never inherit staff permissions.
  return true;
end;
$$;
revoke execute on function public.nexus_actor_allowed(text, text, text, text[]) from public, anon, authenticated;

-- ============================================================================
-- 6) PUBLIC RPC SURFACE
-- ============================================================================
create or replace function public.nexus_list_capabilities(
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(action_code text, module_code text, required_action text, title text, description text, handler_kind text, handler_target text, confirm_required boolean, input_schema jsonb)
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  r public.nexus_action_registry;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  for r in select * from public.nexus_action_registry where is_active order by sort_order loop
    if public.nexus_actor_allowed(v_actor.actor_type, r.module_code, r.required_action, r.allowed_actor_types) then
      action_code := r.action_code; module_code := r.module_code; required_action := r.required_action;
      title := r.title; description := r.description; handler_kind := r.handler_kind;
      handler_target := r.handler_target; confirm_required := r.confirm_required; input_schema := r.input_schema;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.nexus_suggest_actions(
  p_prompt text,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(action_code text, title text, handler_kind text, handler_target text, confirm_required boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  v_words text[];
  r record;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  v_words := regexp_split_to_array(lower(coalesce(p_prompt, '')), '[^a-z]+');

  for r in
    select reg.*,
           (select count(*) from unnest(v_words) w
             where length(w) >= 3 and position(w in reg.keywords) > 0) as score
    from public.nexus_action_registry reg
    where reg.is_active
    order by score desc, reg.sort_order
    limit 8
  loop
    exit when r.score = 0;
    if public.nexus_actor_allowed(v_actor.actor_type, r.module_code, r.required_action, r.allowed_actor_types) then
      action_code := r.action_code; title := r.title; handler_kind := r.handler_kind;
      handler_target := r.handler_target; confirm_required := r.confirm_required;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.nexus_request_action(
  p_action_code text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_conversation_id uuid default null,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(pending_id uuid, confirm_token uuid, preview text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  v_reg public.nexus_action_registry;
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), gen_random_uuid()::text);
  v_row public.nexus_pending_actions;
  v_preview text;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  if public.nexus_rate_limit_exceeded(v_actor.actor_type, v_actor.actor_id, 'requested', 10, interval '1 minute') then
    perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, 'action', p_action_code, p_conversation_id, null, 'rate_limited', '{}'::jsonb);
    raise exception 'Too many action requests. Wait a minute and try again.';
  end if;

  select * into v_reg from public.nexus_action_registry where action_code = p_action_code and is_active;
  if v_reg.action_code is null then
    raise exception 'Unknown Nexus action';
  end if;
  if not public.nexus_actor_allowed(v_actor.actor_type, v_reg.module_code, v_reg.required_action, v_reg.allowed_actor_types) then
    perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, v_reg.audit_category, p_action_code, p_conversation_id, null, 'denied',
      jsonb_build_object('reason', 'permission', 'module', v_reg.module_code, 'required', v_reg.required_action));
    raise exception 'You do not have % permission for %', v_reg.required_action, v_reg.module_code;
  end if;

  -- idempotency: an identical in-flight request returns the same pending action
  select * into v_row from public.nexus_pending_actions
  where requested_by_type = v_actor.actor_type and requested_by_id = v_actor.actor_id and idempotency_key = v_key;
  if v_row.id is not null then
    return query select v_row.id, case when v_row.status = 'pending' then v_row.confirm_token end,
                        v_row.preview, v_row.expires_at, v_row.status;
    return;
  end if;

  v_preview := format('%s — %s', v_reg.title, coalesce(v_reg.description, ''));
  if v_reg.handler_kind = 'navigate' then
    v_preview := v_preview || E'\nNexus will open this workspace; nothing is saved until you complete the form there.';
  end if;

  insert into public.nexus_pending_actions
    (action_code, requested_by_type, requested_by_id, conversation_id, payload, preview, idempotency_key)
  values (p_action_code, v_actor.actor_type, v_actor.actor_id, p_conversation_id, coalesce(p_payload, '{}'::jsonb), v_preview, v_key)
  returning * into v_row;

  perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, v_reg.audit_category, p_action_code, p_conversation_id, v_row.id, 'requested',
    jsonb_build_object('payload', coalesce(p_payload, '{}'::jsonb)));

  return query select v_row.id, v_row.confirm_token, v_row.preview, v_row.expires_at, v_row.status;
end;
$$;

create or replace function public.nexus_confirm_action(
  p_pending_id uuid,
  p_confirm_token uuid,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns table(status text, handler_kind text, handler_target text, result jsonb, error text)
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  v_row public.nexus_pending_actions;
  v_reg public.nexus_action_registry;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);

  -- single-use claim: only the requesting actor, only while pending + unexpired
  update public.nexus_pending_actions a
     set status = 'executed', executed_at = now()
   where a.id = p_pending_id
     and a.confirm_token = p_confirm_token
     and a.status = 'pending'
     and a.expires_at > now()
     and a.requested_by_type = v_actor.actor_type
     and a.requested_by_id = v_actor.actor_id
  returning * into v_row;

  if v_row.id is null then
    -- expire stale rows opportunistically and report an honest failure reason
    update public.nexus_pending_actions set status = 'expired'
    where id = p_pending_id and status = 'pending' and expires_at <= now();
    perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, 'action', null, null, p_pending_id, 'denied',
      jsonb_build_object('reason', 'invalid_expired_or_replayed_confirmation'));
    return query select 'rejected'::text, null::text, null::text, null::jsonb,
      'Confirmation is invalid, expired, or was already used.'::text;
    return;
  end if;

  select * into v_reg from public.nexus_action_registry where action_code = v_row.action_code;

  -- revalidate permission at execution time (grants may have changed mid-flight)
  if not public.nexus_actor_allowed(v_actor.actor_type, v_reg.module_code, v_reg.required_action, v_reg.allowed_actor_types) then
    update public.nexus_pending_actions set status = 'failed', error = 'permission revoked before execution' where id = v_row.id;
    perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, v_reg.audit_category, v_row.action_code, v_row.conversation_id, v_row.id, 'denied',
      jsonb_build_object('reason', 'permission_revoked_at_execution'));
    return query select 'rejected'::text, null::text, null::text, null::jsonb,
      'Your permission for this action changed before execution.'::text;
    return;
  end if;

  if v_reg.handler_kind = 'navigate' then
    update public.nexus_pending_actions
       set result = jsonb_build_object('navigate_to', v_reg.handler_target)
     where id = v_row.id;
    perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, v_reg.audit_category, v_row.action_code, v_row.conversation_id, v_row.id, 'executed',
      jsonb_build_object('navigate_to', v_reg.handler_target));
    return query select 'executed'::text, v_reg.handler_kind, v_reg.handler_target,
                        jsonb_build_object('navigate_to', v_reg.handler_target), null::text;
    return;
  end if;

  -- 'rpc' handlers: none registered yet. Fail closed rather than guessing.
  update public.nexus_pending_actions set status = 'failed', error = 'no executable handler registered' where id = v_row.id;
  perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, v_reg.audit_category, v_row.action_code, v_row.conversation_id, v_row.id, 'failed',
    jsonb_build_object('reason', 'no_rpc_handler'));
  return query select 'failed'::text, v_reg.handler_kind, null::text, null::jsonb,
    'This action has no server-side executor yet; Nexus opened the workspace path instead.'::text;
end;
$$;

create or replace function public.nexus_cancel_action(
  p_pending_id uuid,
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  v_row public.nexus_pending_actions;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  update public.nexus_pending_actions
     set status = 'cancelled'
   where id = p_pending_id and status = 'pending'
     and requested_by_type = v_actor.actor_type and requested_by_id = v_actor.actor_id
  returning * into v_row;
  if v_row.id is null then return false; end if;
  perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, 'action', v_row.action_code, v_row.conversation_id, v_row.id, 'cancelled', '{}'::jsonb);
  return true;
end;
$$;

grant execute on function public.nexus_list_capabilities(text, text) to anon, authenticated;
grant execute on function public.nexus_suggest_actions(text, text, text) to anon, authenticated;
grant execute on function public.nexus_request_action(text, jsonb, text, uuid, text, text) to anon, authenticated;
grant execute on function public.nexus_confirm_action(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.nexus_cancel_action(uuid, text, text) to anon, authenticated;

-- ============================================================================
-- 7) KNOWLEDGE / WORKFLOW REGISTRY + CORRECTIONS
-- ============================================================================
create table if not exists public.nexus_module_workflows (
  id uuid primary key default gen_random_uuid(),
  module_code text not null unique,
  title text not null,
  keywords text not null,
  content text not null,
  actor_scope text not null default 'staff' check (actor_scope in ('staff','portal','all')),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.nexus_module_workflows enable row level security;

insert into public.nexus_module_workflows (module_code, title, keywords, content) values
  ('transportation', 'Transportation workflow', 'transport transportation trip logistics workflow process module',
   E'Transportation workflow:\n1. Masters — create clients, transporters, commodities, routes, trucks, drivers, agents, mappings, and rates.\n2. Trip planning — create a draft trip; select parties, vehicle, route, commodity, quantity, and effective rates.\n3. Operations — assign and dispatch, update the status timeline, attach challans/weight bills, add trip expenses, and complete delivery.\n4. Client commercial — group eligible completed trips into a client bill, apply GST when required, approve the invoice, issue credit notes when needed, and record receipts.\n5. Transporter settlement — generate statements from completed trips, apply deductions/penalties and GST input, approve the statement, and record payments.\n6. Agent settlement — calculate mapped truck commission; authorised staff process withdrawals and penalties.\n7. Finance control — approvals, ledger entries, outstanding balances, and posting into Central Accounts.\n8. Reporting — trip status, billing, collections, payables, margin, documents, and audit history.\n\nEach step is limited by your View/Create/Edit/Delete/Approve/Post grants.'),
  ('central-accounts', 'Central Accounts workflow', 'central accounts accounting finance gst tax workflow process module journal posting',
   E'Central Accounts workflow:\n1. Consolidate approved bills, invoices, credit notes, receipts, statements, payments, and expenses from every division.\n2. Validate documents in the posting queue and resolve exceptions.\n3. Approve and post balanced entries into journals and ledgers.\n4. Reconcile receivables, payables, bank/treasury, GST, TDS, and inter-division balances.\n5. Manage vouchers, fixed assets, budgets, close controls, and period locks.\n6. Prepare GST returns, annual-tax workpapers, audit evidence, and management reports.\n7. Record filing acknowledgements and preserve the audit trail.\n\nPosting, approval, filing, and payment actions always require explicit confirmation.'),
  ('interiors', 'Interiors workflow', 'interior interiors project design boq estimate quotation workflow process module',
   E'Interiors workflow:\n1. Capture the lead and create the client/project.\n2. Define spaces, design packages, finish schedules, and material specifications.\n3. Build the BOQ, estimate, and client quotation.\n4. Obtain internal and client approvals; manage revision and variation requests.\n5. Plan workforce/materials, record site progress and photos, and issue approved change orders.\n6. Create milestone bills and send approved accounting events to Central Accounts.\n7. Complete snagging, handover, warranty records, client sign-off, and project closure.\n\nPortal clients only see their assigned project information and may decide existing approvals when approve access is granted.'),
  ('administration', 'Administration workflow', 'admin administration role permission user portal access workflow process module',
   E'Administration workflow:\n1. Create staff identities and assign divisions.\n2. Configure roles and page-level View/Create/Edit/Delete/Approve/Post/Export grants.\n3. Provision client, transporter, agent, vendor, or interiors portal access linked only to the permitted business entity.\n4. Configure company, tax, document, and integration settings.\n5. Review sessions, audit events, access changes, and security exceptions.\n\nPortal identities remain business-record read-only except for decisions on specifically assigned approvals.')
on conflict (module_code) do update set
  title = excluded.title, keywords = excluded.keywords, content = excluded.content, is_active = true, updated_at = now();

create table if not exists public.nexus_knowledge (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','user')),
  owner_actor_type text,
  owner_actor_id uuid,
  module_code text,
  title text not null,
  keywords text not null default '',
  content text not null,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  created_by_type text not null,
  created_by_id uuid not null,
  approved_by uuid,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.nexus_knowledge enable row level security;

create or replace function public.nexus_submit_correction(
  p_title text,
  p_content text,
  p_keywords text default '',
  p_module_code text default null,
  p_scope text default 'user',
  p_transport_session_token text default null,
  p_external_session_token text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  v_id uuid;
  v_scope text := case when p_scope = 'global' then 'global' else 'user' end;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  if v_actor.actor_type <> 'staff' then
    raise exception 'Only staff can submit Nexus corrections';
  end if;
  if public.nexus_rate_limit_exceeded(v_actor.actor_type, v_actor.actor_id, 'knowledge_submitted', 5, interval '10 minutes') then
    raise exception 'Too many submissions; try later.';
  end if;
  insert into public.nexus_knowledge
    (scope, owner_actor_type, owner_actor_id, module_code, title, keywords, content,
     status, created_by_type, created_by_id)
  values
    (v_scope,
     case when v_scope = 'user' then v_actor.actor_type end,
     case when v_scope = 'user' then v_actor.actor_id end,
     p_module_code, trim(p_title), lower(coalesce(p_keywords, '')), trim(p_content),
     case when v_scope = 'user' then 'approved' else 'proposed' end, -- private notes need no admin review
     v_actor.actor_type, v_actor.actor_id)
  returning id into v_id;
  perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, 'knowledge', null, null, null, 'knowledge_submitted',
    jsonb_build_object('id', v_id, 'scope', v_scope));
  return v_id;
end;
$$;

create or replace function public.nexus_review_knowledge(p_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only administrators may review global Nexus knowledge';
  end if;
  update public.nexus_knowledge
     set status = case when p_approve then 'approved' else 'rejected' end,
         approved_by = public.current_app_user_id(),
         reviewed_at = now()
   where id = p_id and scope = 'global' and status = 'proposed';
  if not found then raise exception 'Knowledge entry not found or not reviewable'; end if;
end;
$$;

grant execute on function public.nexus_submit_correction(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.nexus_review_knowledge(uuid, boolean) to authenticated;

-- ============================================================================
-- 8) ANSWER CHAIN: knowledge + registry-driven workflows, then existing layers
--    chain: chat_ai_answer -> chat_ai_access_answer (portal guard)
--           -> chat_ai_operator_answer (guidance) -> chat_ai_status_answer (live data)
-- ============================================================================
create or replace function public.chat_ai_answer(p_actor_type text, p_actor_id uuid, p_body text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_body text := lower(trim(coalesce(p_body, '')));
  v_words text[] := regexp_split_to_array(lower(coalesce(p_body, '')), '[^a-z0-9/]+');
  v_hit record;
begin
  -- 8a. approved knowledge (global, plus the asker''s own private notes)
  select k.title, k.content into v_hit
  from public.nexus_knowledge k
  where k.status = 'approved'
    and (k.scope = 'global' or (k.scope = 'user' and k.owner_actor_type = p_actor_type and k.owner_actor_id = p_actor_id))
    and (select count(*) from unnest(v_words) w where length(w) >= 4 and position(w in k.keywords) > 0) >= 2
  order by k.created_at desc
  limit 1;
  if v_hit.title is not null then
    return v_hit.content || E'\n\n(Source: approved Nexus knowledge — ' || v_hit.title || ')';
  end if;

  -- 8b. registry-driven module workflows (staff only; portals get the access guard)
  if p_actor_type = 'staff' and v_body ~ '(work[[:space:]]*flow|process|how.*work|module)' then
    select w.title, w.content into v_hit
    from public.nexus_module_workflows w
    where w.is_active and w.actor_scope in ('staff','all')
      and (select count(*) from unnest(v_words) x where length(x) >= 4 and position(x in w.keywords) > 0) >= 1
    order by (select count(*) from unnest(v_words) x where length(x) >= 4 and position(x in w.keywords) > 0) desc
    limit 1;
    if v_hit.title is not null then
      return v_hit.content;
    end if;
  end if;

  return public.chat_ai_access_answer(p_actor_type, p_actor_id, p_body);
end;
$$;
revoke execute on function public.chat_ai_answer(text, uuid, text) from public, anon, authenticated;

-- ============================================================================
-- 9) CHAT SEND RATE LIMIT (30 messages per actor per minute), preserving the
--    deterministic prompt/reply ordering from sprint 15e.
-- ============================================================================
create or replace function public.chat_send_message(
  p_conversation_id uuid,
  p_body text,
  p_make_ping boolean default false,
  p_transport_session_token text default null,
  p_external_session_token text default null,
  p_send_as_department_code text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
  v_message_id uuid;
  v_bot_message_id uuid;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_recipient record;
  v_sender_type text;
  v_sender_id uuid;
  v_sender_name text;
  v_department record;
  v_ai_bot record;
  v_ai_reply text;
  v_prompt_created_at timestamptz;
  v_recent bigint;
begin
  select * into v_actor from public.chat_current_actor(p_transport_session_token, p_external_session_token);
  if not public.chat_can_send_in_conversation(p_conversation_id, v_actor.actor_type, v_actor.actor_id) then
    raise exception 'Not a participant';
  end if;
  if v_body is null then raise exception 'Message cannot be empty'; end if;
  if length(v_body) > 4000 then raise exception 'Message is too long'; end if;

  select count(*) into v_recent
  from public.chat_messages m
  where m.sender_type = v_actor.actor_type and m.sender_id = v_actor.actor_id
    and m.created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    perform public.nexus_audit(v_actor.actor_type, v_actor.actor_id, 'chat', null, p_conversation_id, null, 'rate_limited',
      jsonb_build_object('recent_messages', v_recent));
    raise exception 'You are sending messages too quickly. Please wait a moment.';
  end if;

  v_sender_type := v_actor.actor_type;
  v_sender_id := v_actor.actor_id;
  v_sender_name := v_actor.display_name;

  if nullif(trim(coalesce(p_send_as_department_code, '')), '') is not null then
    if v_actor.actor_type <> 'staff' or not public.chat_is_super_admin_staff(v_actor.actor_id) then
      raise exception 'Only admin staff can reply as a department';
    end if;
    select * into v_department from public.chat_departments
    where code = lower(trim(p_send_as_department_code)) and is_active limit 1;
    if v_department.id is null then raise exception 'Invalid department'; end if;
    if not public.chat_conversation_has_actor(p_conversation_id, 'department', v_department.id) then
      raise exception 'This conversation is not assigned to that department';
    end if;
    v_sender_type := 'department';
    v_sender_id := v_department.id;
    v_sender_name := v_department.name;
  end if;

  v_prompt_created_at := clock_timestamp();
  insert into public.chat_messages(conversation_id, sender_type, sender_id, body, message_kind, metadata, created_at)
  values (
    p_conversation_id, v_sender_type, v_sender_id, v_body,
    case when p_make_ping then 'ping' else 'text' end,
    jsonb_build_object('actual_sender_type', v_actor.actor_type, 'actual_sender_id', v_actor.actor_id),
    v_prompt_created_at
  ) returning id into v_message_id;

  update public.chat_conversations set last_message_at = v_prompt_created_at, updated_at = clock_timestamp() where id = p_conversation_id;
  update public.chat_participants set last_read_at = clock_timestamp(), display_name = v_actor.display_name
  where conversation_id = p_conversation_id and actor_type = v_actor.actor_type and actor_id = v_actor.actor_id;

  if p_make_ping then
    for v_recipient in
      select actor_type, actor_id from public.chat_participants
      where conversation_id = p_conversation_id and left_at is null
        and actor_type not in ('department','ai_bot')
        and not (actor_type = v_actor.actor_type and actor_id = v_actor.actor_id)
    loop
      insert into public.chat_pings(conversation_id, message_id, sender_type, sender_id, recipient_type, recipient_id, title, body)
      values (p_conversation_id, v_message_id, v_sender_type, v_sender_id, v_recipient.actor_type, v_recipient.actor_id, 'Ping from ' || v_sender_name, v_body);
    end loop;
  end if;

  select b.* into v_ai_bot from public.chat_ai_bots b
  where b.is_active and public.chat_conversation_has_actor(p_conversation_id, 'ai_bot', b.id)
  limit 1;

  if v_ai_bot.id is not null and v_sender_type <> 'ai_bot' then
    v_ai_reply := public.chat_ai_answer(v_actor.actor_type, v_actor.actor_id, v_body);
    insert into public.chat_messages(conversation_id, sender_type, sender_id, body, message_kind, metadata, created_at)
    values (
      p_conversation_id, 'ai_bot', v_ai_bot.id, v_ai_reply, 'system',
      jsonb_build_object('ai_mode', 'nexus_v3_registry', 'reply_to_message_id', v_message_id),
      greatest(clock_timestamp(), v_prompt_created_at + interval '1 millisecond')
    )
    returning id into v_bot_message_id;
    update public.chat_conversations
      set last_message_at = greatest(clock_timestamp(), v_prompt_created_at + interval '1 millisecond'),
          updated_at = clock_timestamp()
    where id = p_conversation_id;
  end if;

  return v_message_id;
end;
$$;
grant execute on function public.chat_send_message(uuid, text, boolean, text, text, text) to anon, authenticated;
