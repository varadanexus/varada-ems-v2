-- Sprint 17g: Credit Notes with a unified central register (CR/<FY>/<NNN>)
-- Shared continuous credit-note numbering across modules (Transport + Digital
-- Services), mirroring the invoice register.

create table if not exists public.central_credit_note_sequences (
  financial_year_label text primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.central_credit_note_sequences enable row level security;
drop policy if exists central_credit_note_seq_rw on public.central_credit_note_sequences;
create policy central_credit_note_seq_rw on public.central_credit_note_sequences
  for all to authenticated using (true) with check (true);

create or replace function public.next_central_credit_note_number(p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text; v_n integer;
begin
  v_fy := public.get_transport_financial_year_label(coalesce(p_date, current_date));
  insert into public.central_credit_note_sequences (financial_year_label, last_number)
  values (v_fy, 1)
  on conflict (financial_year_label)
  do update set last_number = public.central_credit_note_sequences.last_number + 1, updated_at = now()
  returning last_number into v_n;
  return 'CR/' || v_fy || '/' || lpad(v_n::text, 3, '0');
end; $$;
grant execute on function public.next_central_credit_note_number(date) to authenticated;

create or replace function public.ds_next_credit_note_number()
returns text language plpgsql security definer set search_path = public as $$
begin return public.next_central_credit_note_number(current_date); end; $$;
grant execute on function public.ds_next_credit_note_number() to authenticated;

-- Transport credit notes now share the same central register.
create or replace function public.generate_transport_client_credit_note_no(p_division_id uuid, p_credit_note_date date)
returns text language plpgsql as $$
begin
  if p_credit_note_date is null then raise exception 'credit_note_date is required'; end if;
  return public.next_central_credit_note_number(p_credit_note_date);
end; $$;

-- Digital Services credit notes
create table if not exists public.ds_credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_note_number text not null unique,
  invoice_id uuid references public.ds_invoices(id) on delete set null,
  client_id uuid not null references public.ds_clients(id) on delete restrict,
  project_id uuid references public.ds_projects(id) on delete set null,
  issue_date date not null default current_date,
  reason text,
  currency text not null default 'INR',
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'issued' check (status in ('draft','issued','void')),
  notes text,
  posted_to_ca boolean not null default false,
  ca_financial_document_id uuid,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ds_credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references public.ds_credit_notes(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(6,2) not null default 18,
  line_total numeric(14,2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists idx_ds_credit_notes_client on public.ds_credit_notes(client_id, issue_date desc);
create index if not exists idx_ds_credit_note_items_cn on public.ds_credit_note_items(credit_note_id);

do $$
declare t text;
begin
  foreach t in array array['ds_credit_notes','ds_credit_note_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format($p$create policy %I_all on public.%I for all to authenticated
      using (public.current_user_has_any_role(array['super_admin','admin','manager','operator','coo','cfo','accounts','accounts_manager','accounts_executive']))
      with check (public.current_user_has_any_role(array['super_admin','admin','manager','operator','coo','cfo','accounts','accounts_manager','accounts_executive']))$p$, t, t);
  end loop;
end $$;

-- Central Accounts bridge for DS credit notes.
create or replace function public.bridge_ds_credit_note_to_central_accounts(p_credit_note_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cn record; v_division_id uuid; v_counterparty_dim uuid; v_project_dim uuid; v_profit_center_dim uuid;
  v_fd uuid; v_actor uuid := public.current_app_user_id();
begin
  if p_credit_note_id is null then raise exception 'credit note id is required'; end if;
  select cn.*, coalesce(c.company_name, c.name) as client_name, p.code as project_code, p.title as project_title
  into v_cn
  from public.ds_credit_notes cn
  join public.ds_clients c on c.id = cn.client_id
  left join public.ds_projects p on p.id = cn.project_id
  where cn.id = p_credit_note_id;
  if v_cn.id is null then raise exception 'Credit note % not found', p_credit_note_id; end if;
  if v_cn.status = 'void' then return null; end if;

  select id into v_division_id from public.divisions where code = 'DIGITAL_SERVICES' limit 1;
  v_counterparty_dim := public.ensure_reporting_dimension('counterparty', 'DS_CLIENT:' || coalesce(v_cn.client_id::text, 'UNASSIGNED'), coalesce(v_cn.client_name, 'Digital Services Client'));
  v_project_dim := public.ensure_reporting_dimension('project', coalesce(nullif(v_cn.project_code, ''), 'DS_CN:' || v_cn.id::text), coalesce(v_cn.project_title, v_cn.credit_note_number, 'Digital Services'));
  v_profit_center_dim := public.ensure_reporting_dimension('profit_center', 'DIGITAL_SERVICES_CORE', 'Digital Services Core');

  insert into public.financial_documents (
    document_family, source_module, source_table, source_document_id, source_document_no,
    division_id, counterparty_dimension_id, project_dimension_id, profit_center_dimension_id,
    status, document_date, effective_date, gross_amount, taxable_amount, tax_amount, net_amount,
    finance_approved_by, finance_approved_at
  ) values (
    'DIGITAL_SERVICES_CREDIT_NOTE', 'digital-services', 'ds_credit_notes', v_cn.id, v_cn.credit_note_number,
    v_division_id, v_counterparty_dim, v_project_dim, v_profit_center_dim,
    'ready_for_posting', v_cn.issue_date, v_cn.issue_date,
    coalesce(v_cn.total_amount, 0), coalesce(v_cn.subtotal, 0), coalesce(v_cn.tax_amount, 0), coalesce(v_cn.total_amount, 0),
    coalesce(v_cn.created_by, v_actor), now()
  )
  on conflict (source_module, source_table, source_document_id, document_family)
  do update set source_document_no = excluded.source_document_no, gross_amount = excluded.gross_amount,
    taxable_amount = excluded.taxable_amount, tax_amount = excluded.tax_amount, net_amount = excluded.net_amount,
    status = case when public.financial_documents.status = 'posted' then public.financial_documents.status else 'ready_for_posting' end,
    updated_at = now()
  returning id into v_fd;

  insert into public.posting_queue (financial_document_id, queue_status, requested_by)
  values (v_fd, 'ready_to_post', coalesce(v_actor, v_cn.created_by))
  on conflict (financial_document_id)
  do update set queue_status = case when public.posting_queue.queue_status = 'posted' then public.posting_queue.queue_status else 'ready_to_post' end,
    requested_by = excluded.requested_by, last_error = null, updated_at = now();

  update public.ds_credit_notes set posted_to_ca = true, ca_financial_document_id = v_fd, updated_at = now() where id = v_cn.id;
  return v_fd;
end; $$;
grant execute on function public.bridge_ds_credit_note_to_central_accounts(uuid) to authenticated;

-- Admin-gated hard delete with CR number reclaim.
create or replace function public.ds_delete_credit_note(p_credit_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cn record; v_fy text; v_seq integer;
begin
  if not public.ds_is_hard_delete_allowed() then
    raise exception 'Only the admin@varadanexus.com account can hard-delete credit notes';
  end if;
  select * into v_cn from public.ds_credit_notes where id = p_credit_note_id;
  if not found then return; end if;
  v_fy := split_part(v_cn.credit_note_number, '/', 2);
  v_seq := nullif(regexp_replace(split_part(v_cn.credit_note_number, '/', 3), '\D', '', 'g'), '')::integer;
  if v_cn.ca_financial_document_id is not null then
    delete from public.posting_queue where financial_document_id = v_cn.ca_financial_document_id;
    delete from public.financial_documents where id = v_cn.ca_financial_document_id and status <> 'posted';
  end if;
  delete from public.ds_credit_notes where id = p_credit_note_id;
  if v_fy is not null and v_seq is not null then
    update public.central_credit_note_sequences set last_number = greatest(last_number - 1, 0), updated_at = now()
    where financial_year_label = v_fy and last_number = v_seq;
  end if;
end; $$;
grant execute on function public.ds_delete_credit_note(uuid) to authenticated;
