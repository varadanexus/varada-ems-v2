-- Premium Digital Marketing & Services vendor workspace.
-- Adds vendor-scoped invoicing/payment visibility, confidential query audiences,
-- and session-validated RPCs used by the external portal and Drive uploader.

alter table public.marketing_queries
  add column if not exists audience text not null default 'company',
  add column if not exists vendor_id uuid references public.marketing_vendors(id) on delete set null;

alter table public.marketing_queries
  drop constraint if exists marketing_queries_audience_check;
alter table public.marketing_queries
  add constraint marketing_queries_audience_check
  check (audience in ('company', 'client'));

create index if not exists idx_marketing_queries_vendor_id
  on public.marketing_queries(vendor_id, last_message_at desc);

create table if not exists public.marketing_vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.marketing_vendors(id) on delete restrict,
  project_id uuid not null references public.marketing_projects(id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  description text,
  taxable_amount numeric(14,2) not null default 0 check (taxable_amount >= 0),
  gst_rate numeric(6,3) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  gst_amount numeric(14,2) not null default 0 check (gst_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'submitted'
    check (status in ('submitted','under_review','approved','partially_paid','paid','rejected','cancelled')),
  review_note text,
  drive_document_id uuid references public.drive_documents(id) on delete set null,
  drive_file_id text,
  drive_folder_id text,
  web_view_link text,
  original_file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  submitted_by_portal_user_id uuid not null,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, invoice_number)
);

create index if not exists idx_marketing_vendor_invoices_vendor
  on public.marketing_vendor_invoices(vendor_id, invoice_date desc);
create index if not exists idx_marketing_vendor_invoices_project
  on public.marketing_vendor_invoices(project_id, status);

create table if not exists public.marketing_vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.marketing_vendors(id) on delete restrict,
  invoice_id uuid references public.marketing_vendor_invoices(id) on delete set null,
  project_id uuid references public.marketing_projects(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  notes text,
  recorded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_vendor_payments_vendor
  on public.marketing_vendor_payments(vendor_id, paid_at desc);

alter table public.ds_project_costs
  add column if not exists marketing_vendor_id uuid references public.marketing_vendors(id) on delete set null,
  add column if not exists marketing_vendor_invoice_id uuid references public.marketing_vendor_invoices(id) on delete set null;

create index if not exists idx_ds_project_costs_marketing_vendor
  on public.ds_project_costs(marketing_vendor_id, paid_at desc);
create unique index if not exists uq_ds_project_costs_marketing_invoice
  on public.ds_project_costs(marketing_vendor_invoice_id)
  where marketing_vendor_invoice_id is not null;

create or replace function public.marketing_touch_vendor_invoice_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.marketing_touch_vendor_invoice_updated_at() from public, anon, authenticated;

drop trigger if exists trg_marketing_vendor_invoices_updated_at on public.marketing_vendor_invoices;
create trigger trg_marketing_vendor_invoices_updated_at
before update on public.marketing_vendor_invoices
for each row execute function public.marketing_touch_vendor_invoice_updated_at();

alter table public.marketing_vendor_invoices enable row level security;
alter table public.marketing_vendor_payments enable row level security;

drop policy if exists marketing_vendor_invoices_staff_select on public.marketing_vendor_invoices;
create policy marketing_vendor_invoices_staff_select on public.marketing_vendor_invoices
for select to authenticated using (public.has_permission('marketing','view'));
drop policy if exists marketing_vendor_invoices_staff_update on public.marketing_vendor_invoices;
create policy marketing_vendor_invoices_staff_update on public.marketing_vendor_invoices
for update to authenticated using (public.has_permission('marketing','edit'))
with check (public.has_permission('marketing','edit'));

drop policy if exists marketing_vendor_payments_staff_select on public.marketing_vendor_payments;
create policy marketing_vendor_payments_staff_select on public.marketing_vendor_payments
for select to authenticated using (public.has_permission('marketing','view'));
drop policy if exists marketing_vendor_payments_staff_insert on public.marketing_vendor_payments;
create policy marketing_vendor_payments_staff_insert on public.marketing_vendor_payments
for insert to authenticated with check (public.has_permission('marketing','create'));
drop policy if exists marketing_vendor_payments_staff_update on public.marketing_vendor_payments;
create policy marketing_vendor_payments_staff_update on public.marketing_vendor_payments
for update to authenticated using (public.has_permission('marketing','edit'))
with check (public.has_permission('marketing','edit'));

grant select, update on public.marketing_vendor_invoices to authenticated;
grant select, insert, update on public.marketing_vendor_payments to authenticated;
grant select, insert, update, delete on public.marketing_vendor_invoices to service_role;
grant select, insert, update, delete on public.marketing_vendor_payments to service_role;

-- Centralized visibility predicate for a single conversation. Vendor-to-company
-- threads remain hidden from clients; vendor-to-client threads remain white-label.
create or replace function public.marketing_portal_can_access_query(
  p_actor_kind text,
  p_profile_id uuid,
  p_query_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketing_queries q
    where q.id = p_query_id
      and (
        (
          p_actor_kind = 'client'
          and (q.vendor_id is null or q.audience = 'client')
          and exists (
            select 1 from public.marketing_projects p
            where p.id = q.project_id and p.client_id = p_profile_id
          )
        )
        or
        (
          p_actor_kind = 'vendor'
          and (q.vendor_id is null or q.vendor_id = p_profile_id)
          and exists (
            select 1 from public.marketing_project_assignments a
            where a.project_id = q.project_id
              and a.vendor_id = p_profile_id
              and a.assignment_status <> 'cancelled'
          )
        )
      )
  );
$$;

revoke all on function public.marketing_portal_can_access_query(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.marketing_portal_read(
  p_session_token text,
  p_resource text,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.profile_id is null then
    raise exception 'No Digital Marketing & Services portal access is linked to this account';
  end if;

  if p_resource = 'identity' then
    if v_ctx.actor_kind = 'client' then
      select jsonb_build_object('kind', 'client', 'profile', to_jsonb(c), 'user', jsonb_build_object('id', v_ctx.portal_user_id))
      into v_result from public.marketing_clients c where c.id = v_ctx.profile_id;
    else
      select jsonb_build_object('kind', 'vendor', 'profile', to_jsonb(v), 'user', jsonb_build_object('id', v_ctx.portal_user_id))
      into v_result from public.marketing_vendors v where v.id = v_ctx.profile_id;
    end if;
  elsif p_resource = 'projects' then
    if v_ctx.actor_kind = 'client' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_result
      from (
        select p.*, jsonb_build_object('company_name', c.company_name, 'contact_name', c.contact_name, 'email', c.email) as marketing_clients
        from public.marketing_projects p
        join public.marketing_clients c on c.id = p.client_id
        where p.client_id = v_ctx.profile_id
      ) x;
    else
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_result
      from (
        select p.*, jsonb_build_object('company_name', c.company_name, 'contact_name', c.contact_name, 'email', c.email) as marketing_clients
        from public.marketing_projects p
        join public.marketing_clients c on c.id = p.client_id
        join public.marketing_project_assignments a on a.project_id = p.id
        where a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
      ) x;
    end if;
  elsif p_resource = 'assignments' then
    if v_ctx.actor_kind <> 'vendor' then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_at desc), '[]'::jsonb) into v_result
    from (
      select a.*,
        jsonb_build_object('vendor_code', v.vendor_code, 'legal_name', v.legal_name, 'internal_alias', v.internal_alias, 'contact_name', v.contact_name) as marketing_vendors,
        jsonb_build_object('project_code', p.project_code, 'title', p.title, 'ds_project_id', p.ds_project_id) as marketing_projects
      from public.marketing_project_assignments a
      join public.marketing_vendors v on v.id = a.vendor_id
      join public.marketing_projects p on p.id = a.project_id
      where a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
    ) x;
  elsif p_resource = 'deliverables' then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.due_date), '[]'::jsonb) into v_result
    from public.marketing_deliverables d
    where (p_id is null or d.project_id = p_id)
      and (v_ctx.actor_kind <> 'client' or d.client_visible)
      and (
        (v_ctx.actor_kind = 'client' and exists (select 1 from public.marketing_projects p where p.id = d.project_id and p.client_id = v_ctx.profile_id))
        or
        (v_ctx.actor_kind = 'vendor' and exists (select 1 from public.marketing_project_assignments a where a.project_id = d.project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'))
      );
  elsif p_resource = 'queries' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.last_message_at desc), '[]'::jsonb) into v_result
    from public.marketing_queries q
    where (p_id is null or q.project_id = p_id)
      and public.marketing_portal_can_access_query(v_ctx.actor_kind, v_ctx.profile_id, q.id);
  elsif p_resource = 'messages' then
    if p_id is null then raise exception 'Query ID is required'; end if;
    if not public.marketing_portal_can_access_query(v_ctx.actor_kind, v_ctx.profile_id, p_id) then
      raise exception 'Not authorized for this query';
    end if;
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) into v_result
    from public.marketing_query_messages m where m.query_id = p_id;
  else
    raise exception 'Unsupported portal resource';
  end if;

  return coalesce(v_result, case when p_resource = 'identity' then '{}'::jsonb else '[]'::jsonb end);
end;
$$;

revoke all on function public.marketing_portal_read(text, text, uuid) from public;
grant execute on function public.marketing_portal_read(text, text, uuid) to anon, authenticated;

create or replace function public.marketing_portal_write(
  p_session_token text,
  p_action text,
  p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_project_id uuid;
  v_audience text;
  v_row jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.profile_id is null then
    raise exception 'No Digital Marketing & Services portal access is linked to this account';
  end if;

  perform set_config('app.marketing_portal_kind', v_ctx.actor_kind, true);
  perform set_config('app.marketing_portal_profile_id', v_ctx.profile_id::text, true);
  perform set_config('app.marketing_portal_actor_id', v_ctx.portal_user_id::text, true);

  if p_action = 'create_query' then
    v_project_id := nullif(p_payload->>'projectId', '')::uuid;
    if not public.marketing_can_access_project(v_project_id) then raise exception 'Not authorized for this project'; end if;
    v_audience := case
      when v_ctx.actor_kind = 'vendor' and p_payload->>'audience' = 'client' then 'client'
      else 'company'
    end;
    insert into public.marketing_queries(query_number, project_id, subject, category, priority, audience, vendor_id)
    values (
      '', v_project_id, btrim(p_payload->>'subject'),
      coalesce(nullif(p_payload->>'category',''), 'general'),
      coalesce(nullif(p_payload->>'priority',''), 'normal'),
      v_audience,
      case when v_ctx.actor_kind = 'vendor' then v_ctx.profile_id else null end
    )
    returning to_jsonb(marketing_queries.*) into v_row;
  elsif p_action = 'add_message' then
    if p_id is null or not public.marketing_portal_can_access_query(v_ctx.actor_kind, v_ctx.profile_id, p_id) then
      raise exception 'Not authorized for this query';
    end if;
    insert into public.marketing_query_messages(query_id, body)
    values (p_id, btrim(p_payload->>'body'))
    returning to_jsonb(marketing_query_messages.*) into v_row;
  elsif p_action = 'resolve_query' then
    if p_id is null or not public.marketing_portal_can_access_query(v_ctx.actor_kind, v_ctx.profile_id, p_id) then
      raise exception 'Not authorized for this query';
    end if;
    update public.marketing_queries set status = 'resolved', resolved_at = now(), updated_at = now()
    where id = p_id returning to_jsonb(marketing_queries.*) into v_row;
  elsif p_action = 'update_assignment' then
    if v_ctx.actor_kind <> 'vendor' then raise exception 'Only delivery users may update assignments'; end if;
    update public.marketing_project_assignments
    set assignment_status = p_payload->>'assignment_status',
        accepted_at = case when p_payload->>'assignment_status' in ('accepted','in_progress') then coalesce(accepted_at, now()) else accepted_at end
    where id = p_id and vendor_id = v_ctx.profile_id
      and p_payload->>'assignment_status' in ('accepted','in_progress','completed')
    returning to_jsonb(marketing_project_assignments.*) into v_row;
  elsif p_action = 'update_deliverable' then
    if v_ctx.actor_kind <> 'vendor' then raise exception 'Only delivery users may update deliverables'; end if;
    update public.marketing_deliverables d
    set status = p_payload->>'status', updated_at = now()
    where d.id = p_id
      and p_payload->>'status' in ('todo','in_progress','vendor_review','client_review','revision','approved','done')
      and exists (
        select 1 from public.marketing_project_assignments a
        where a.project_id = d.project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
      )
    returning to_jsonb(d.*) into v_row;
  else
    raise exception 'Unsupported portal action';
  end if;

  if v_row is null then raise exception 'The requested portal record was not found or is not accessible'; end if;
  return v_row;
end;
$$;

revoke all on function public.marketing_portal_write(text, text, uuid, jsonb) from public;
grant execute on function public.marketing_portal_write(text, text, uuid, jsonb) to anon, authenticated;

create or replace function public.marketing_vendor_portal_finance(
  p_session_token text,
  p_resource text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_vendor public.marketing_vendors%rowtype;
  v_result jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.actor_kind <> 'vendor' or v_ctx.profile_id is null then
    raise exception 'Vendor portal access is required';
  end if;
  select * into v_vendor from public.marketing_vendors where id = v_ctx.profile_id;

  if p_resource = 'invoices' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.invoice_date desc, x.created_at desc), '[]'::jsonb)
    into v_result
    from (
      select i.*, jsonb_build_object('project_code', p.project_code, 'title', p.title) as project
      from public.marketing_vendor_invoices i
      join public.marketing_projects p on p.id = i.project_id
      where i.vendor_id = v_ctx.profile_id
    ) x;
  elsif p_resource = 'payments' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_at desc), '[]'::jsonb)
    into v_result
    from (
      select
        vp.id, vp.amount, vp.paid_at, vp.method, vp.reference, vp.notes,
        'portal_payment'::text as source,
        case when i.id is null then null else jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number) end as invoice,
        case when p.id is null then null else jsonb_build_object('id', p.id, 'project_code', p.project_code, 'title', p.title) end as project
      from public.marketing_vendor_payments vp
      left join public.marketing_vendor_invoices i on i.id = vp.invoice_id
      left join public.marketing_projects p on p.id = vp.project_id
      where vp.vendor_id = v_ctx.profile_id
      union all
      select
        s.id, s.amount, s.settlement_date::timestamptz as paid_at, 'accounts_payable'::text as method,
        c.vendor_ref as reference, c.notes, 'accounts_payable'::text as source,
        case when i.id is null then null else jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number) end as invoice,
        jsonb_build_object('id', mp.id, 'project_code', mp.project_code, 'title', mp.title) as project
      from public.ds_project_costs c
      join public.vendor_settlements s on s.purchase_bill_id = c.payable_bill_id and s.status = 'posted'
      join public.marketing_projects mp on mp.ds_project_id = c.project_id
      join public.marketing_project_assignments a on a.project_id = mp.id
        and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
      left join public.marketing_vendor_invoices i on i.id = c.marketing_vendor_invoice_id
      where (
          c.marketing_vendor_id = v_ctx.profile_id
          or (
            c.marketing_vendor_id is null
            and (
              (v_vendor.gstin is not null and upper(coalesce(c.vendor_gstin, '')) = upper(v_vendor.gstin))
              or lower(btrim(c.vendor_name)) = lower(btrim(v_vendor.legal_name))
            )
          )
        )
    ) x;
  else
    raise exception 'Unsupported vendor finance resource';
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.marketing_vendor_portal_finance(text, text) from public;
grant execute on function public.marketing_vendor_portal_finance(text, text) to anon, authenticated;

-- Narrow server-side context for the Drive Edge Function. The function never
-- returns another vendor's data and is executable only with the service role.
create or replace function public.marketing_vendor_upload_context(
  p_session_token text,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.actor_kind <> 'vendor' or v_ctx.profile_id is null then
    raise exception 'Vendor portal access is required';
  end if;
  if not exists (
    select 1 from public.marketing_project_assignments a
    where a.project_id = p_project_id and a.vendor_id = v_ctx.profile_id and a.assignment_status <> 'cancelled'
  ) then
    raise exception 'This project is not assigned to the vendor';
  end if;

  select jsonb_build_object(
    'portalUserId', v_ctx.portal_user_id,
    'vendorId', v.id,
    'vendorCode', v.vendor_code,
    'vendorName', v.legal_name,
    'vendorGstin', v.gstin,
    'projectId', p.id,
    'projectCode', p.project_code,
    'projectTitle', p.title,
    'dsProjectId', p.ds_project_id
  ) into v_result
  from public.marketing_vendors v
  join public.marketing_projects p on p.id = p_project_id
  where v.id = v_ctx.profile_id;

  return v_result;
end;
$$;

revoke all on function public.marketing_vendor_upload_context(text, uuid) from public, anon, authenticated;
grant execute on function public.marketing_vendor_upload_context(text, uuid) to service_role;

-- Staff review turns an approved portal invoice into the existing Digital
-- Services project-cost/payables workflow without allowing the vendor to post
-- directly into Accounts Payable.
create or replace function public.marketing_review_vendor_invoice(
  p_invoice_id uuid,
  p_status text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.marketing_vendor_invoices%rowtype;
  v_vendor public.marketing_vendors%rowtype;
  v_project public.marketing_projects%rowtype;
  v_actor uuid := public.current_app_user_id();
  v_result jsonb;
begin
  if not public.has_permission('marketing','edit') then
    raise exception 'Marketing edit permission is required';
  end if;
  if p_status not in ('under_review','approved','rejected') then
    raise exception 'Unsupported invoice review status';
  end if;
  select * into v_invoice from public.marketing_vendor_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Vendor invoice not found'; end if;
  select * into v_vendor from public.marketing_vendors where id = v_invoice.vendor_id;
  select * into v_project from public.marketing_projects where id = v_invoice.project_id;

  update public.marketing_vendor_invoices
  set status = p_status,
      review_note = nullif(btrim(p_review_note), ''),
      approved_by = case when p_status = 'approved' then v_actor else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end
  where id = p_invoice_id
  returning to_jsonb(marketing_vendor_invoices.*) into v_result;

  if p_status = 'approved' then
    insert into public.ds_project_costs (
      project_id, vendor_name, vendor_gstin, description, vendor_ref, bill_date,
      amount, gst_rate, gst_amount, total_amount, itc_eligible, status, notes,
      marketing_vendor_id, marketing_vendor_invoice_id
    ) values (
      v_project.ds_project_id, v_vendor.legal_name, v_vendor.gstin, v_invoice.description,
      v_invoice.invoice_number, v_invoice.invoice_date, v_invoice.taxable_amount,
      v_invoice.gst_rate, v_invoice.gst_amount, v_invoice.total_amount,
      v_vendor.gstin is not null, 'unpaid', v_invoice.web_view_link,
      v_vendor.id, v_invoice.id
    )
    on conflict (marketing_vendor_invoice_id) where marketing_vendor_invoice_id is not null
    do update set
      vendor_name = excluded.vendor_name,
      vendor_gstin = excluded.vendor_gstin,
      description = excluded.description,
      vendor_ref = excluded.vendor_ref,
      bill_date = excluded.bill_date,
      amount = excluded.amount,
      gst_rate = excluded.gst_rate,
      gst_amount = excluded.gst_amount,
      total_amount = excluded.total_amount,
      notes = excluded.notes,
      updated_at = now();
  end if;
  return v_result;
end;
$$;

revoke all on function public.marketing_review_vendor_invoice(uuid, text, text) from public, anon;
grant execute on function public.marketing_review_vendor_invoice(uuid, text, text) to authenticated;

-- Harden direct authenticated access to the newly confidential audience field.
drop policy if exists marketing_queries_participant_select on public.marketing_queries;
create policy marketing_queries_participant_select on public.marketing_queries
for select to authenticated
using (
  public.marketing_can_access_project(project_id)
  and (
    public.marketing_actor_kind() = 'staff'
    or (public.marketing_actor_kind() = 'client' and (vendor_id is null or audience = 'client'))
    or (
      public.marketing_actor_kind() = 'vendor'
      and (
        vendor_id is null
        or exists (
          select 1 from public.marketing_vendors v
          where v.id = vendor_id and v.auth_user_id = (select auth.uid())
        )
      )
    )
  )
);

drop policy if exists marketing_messages_participant_select on public.marketing_query_messages;
create policy marketing_messages_participant_select on public.marketing_query_messages
for select to authenticated
using (
  exists (
    select 1 from public.marketing_queries q
    where q.id = query_id
      and public.marketing_can_access_project(q.project_id)
      and (
        public.marketing_actor_kind() = 'staff'
        or (public.marketing_actor_kind() = 'client' and (q.vendor_id is null or q.audience = 'client'))
        or (
          public.marketing_actor_kind() = 'vendor'
          and (
            q.vendor_id is null
            or exists (
              select 1 from public.marketing_vendors v
              where v.id = q.vendor_id and v.auth_user_id = (select auth.uid())
            )
          )
        )
      )
  )
);
