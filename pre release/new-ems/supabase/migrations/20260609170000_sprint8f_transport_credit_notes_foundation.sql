-- Sprint 8F: Transport client credit notes foundation

create table if not exists public.transport_client_credit_note_number_sequences (
  division_id uuid not null references public.divisions(id),
  financial_year_label text not null,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (division_id, financial_year_label)
);

create table if not exists public.transport_client_credit_notes (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  credit_note_no text not null,
  transport_client_id uuid not null references public.transport_clients(id),
  client_bill_id uuid not null references public.transport_client_bills(id),
  credit_note_date date not null,
  credit_note_amount numeric(14,2) not null,
  reason text,
  remarks text,
  status text not null default 'draft',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_transport_client_credit_notes_division_no_active
  on public.transport_client_credit_notes(division_id, credit_note_no)
  where deleted_at is null;

create index if not exists idx_transport_client_credit_notes_bill_active
  on public.transport_client_credit_notes(client_bill_id)
  where deleted_at is null;

do $$ begin
  alter table public.transport_client_credit_notes
    add constraint chk_transport_client_credit_notes_status
    check (status in ('draft', 'approved', 'cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.transport_client_credit_notes
    add constraint chk_transport_client_credit_notes_amount
    check (credit_note_amount > 0);
exception when duplicate_object then null; end $$;

create or replace function public.generate_transport_client_credit_note_no(p_division_id uuid, p_credit_note_date date)
returns text
language plpgsql
as $$
declare
  v_fy text;
  v_next integer;
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_credit_note_date is null then raise exception 'credit_note_date is required'; end if;

  v_fy := public.get_transport_financial_year_label(p_credit_note_date);

  insert into public.transport_client_credit_note_number_sequences (division_id, financial_year_label, last_number)
  values (p_division_id, v_fy, 1)
  on conflict (division_id, financial_year_label)
  do update set last_number = public.transport_client_credit_note_number_sequences.last_number + 1,
                updated_at = now()
  returning last_number into v_next;

  return 'CN/' || v_fy || '/' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.create_transport_client_credit_note(
  p_division_id uuid,
  p_transport_client_id uuid,
  p_client_bill_id uuid,
  p_credit_note_date date,
  p_credit_note_amount numeric,
  p_reason text default null,
  p_remarks text default null
)
returns table (
  credit_note_id uuid,
  credit_note_no text,
  credit_note_amount numeric,
  status text
)
language plpgsql
as $$
declare
  v_credit_note_no text;
  v_bill record;
  v_outstanding numeric(14,2);
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_transport_client_id is null then raise exception 'transport_client_id is required'; end if;
  if p_client_bill_id is null then raise exception 'client_bill_id is required'; end if;
  if p_credit_note_date is null then raise exception 'credit_note_date is required'; end if;
  if coalesce(p_credit_note_amount, 0) <= 0 then raise exception 'credit_note_amount must be greater than zero'; end if;

  select b.id,
         b.bill_no,
         b.status,
         b.transport_client_id,
         case
           when coalesce(b.billing_type, 'NON_GST') = 'GST' then coalesce(b.invoice_total, b.net_receivable, 0)
           else coalesce(b.net_receivable, 0)
         end as bill_total
  into v_bill
  from public.transport_client_bills b
  where b.id = p_client_bill_id
    and b.division_id = p_division_id
    and b.transport_client_id = p_transport_client_id
    and b.deleted_at is null;

  if v_bill.id is null then raise exception 'Approved client bill not found for selected client'; end if;
  if v_bill.status <> 'approved' then raise exception 'Credit note can only be created against approved client bill'; end if;

  select o.outstanding_amount
  into v_outstanding
  from public.get_transport_client_receipt_outstanding(p_division_id, p_transport_client_id, p_client_bill_id) o;

  if coalesce(v_outstanding, 0) <= 0 then
    raise exception 'No outstanding amount available for selected bill';
  end if;

  if round(coalesce(p_credit_note_amount, 0)::numeric, 2) > round(coalesce(v_outstanding, 0)::numeric, 2) then
    raise exception 'Credit note amount cannot exceed current outstanding';
  end if;

  v_credit_note_no := public.generate_transport_client_credit_note_no(p_division_id, p_credit_note_date);

  return query
  insert into public.transport_client_credit_notes (
    division_id,
    credit_note_no,
    transport_client_id,
    client_bill_id,
    credit_note_date,
    credit_note_amount,
    reason,
    remarks,
    status,
    created_at,
    updated_at
  )
  values (
    p_division_id,
    v_credit_note_no,
    p_transport_client_id,
    p_client_bill_id,
    p_credit_note_date,
    round(p_credit_note_amount::numeric, 2),
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_remarks, '')), ''),
    'draft',
    now(),
    now()
  )
  returning id as credit_note_id,
            credit_note_no,
            credit_note_amount,
            status;
end;
$$;

create or replace function public.approve_transport_client_credit_note(p_credit_note_id uuid)
returns table (
  id uuid,
  credit_note_no text,
  status text,
  approved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
declare
  v_note record;
  v_outstanding numeric(14,2);
begin
  if p_credit_note_id is null then raise exception 'credit_note_id is required'; end if;

  select n.id,
         n.division_id,
         n.transport_client_id,
         n.client_bill_id,
         n.credit_note_no,
         n.credit_note_amount,
         n.status
  into v_note
  from public.transport_client_credit_notes n
  where n.id = p_credit_note_id
    and n.deleted_at is null;

  if v_note.id is null then raise exception 'Credit note not found'; end if;
  if v_note.status = 'cancelled' then raise exception 'Cancelled credit note cannot be approved'; end if;
  if v_note.status = 'approved' then raise exception 'Credit note is already approved'; end if;

  select o.outstanding_amount
  into v_outstanding
  from public.get_transport_client_receipt_outstanding(v_note.division_id, v_note.transport_client_id, v_note.client_bill_id) o;

  if round(coalesce(v_note.credit_note_amount, 0)::numeric, 2) > round(coalesce(v_outstanding, 0)::numeric, 2) then
    raise exception 'Credit note amount exceeds current outstanding';
  end if;

  return query
  update public.transport_client_credit_notes n
  set status = 'approved',
      approved_at = now(),
      updated_at = now()
  where n.id = p_credit_note_id
    and n.status = 'draft'
    and n.deleted_at is null
  returning n.id,
            n.credit_note_no,
            n.status,
            n.approved_at,
            n.updated_at;

  if not found then raise exception 'Only draft credit notes can be approved'; end if;
end;
$$;

create or replace function public.cancel_transport_client_credit_note(p_credit_note_id uuid)
returns table (
  id uuid,
  credit_note_no text,
  status text,
  updated_at timestamptz
)
language plpgsql
as $$
begin
  if p_credit_note_id is null then raise exception 'credit_note_id is required'; end if;

  return query
  update public.transport_client_credit_notes n
  set status = 'cancelled',
      updated_at = now()
  where n.id = p_credit_note_id
    and n.status = 'draft'
    and n.deleted_at is null
  returning n.id,
            n.credit_note_no,
            n.status,
            n.updated_at;
end;
$$;

create or replace function public.list_transport_client_receipt_bill_options(p_division_id uuid, p_transport_client_id uuid)
returns table (client_bill_id uuid, bill_no text, outstanding_amount numeric)
language sql
as $$
  with confirmed_receipts as (
    select r.client_bill_id,
           round(sum(coalesce(r.amount_received, 0))::numeric, 2) as confirmed_amount
    from public.transport_client_receipts r
    where r.deleted_at is null
      and r.status = 'confirmed'
      and r.client_bill_id is not null
    group by r.client_bill_id
  ), approved_credit_notes as (
    select n.client_bill_id,
           round(sum(coalesce(n.credit_note_amount, 0))::numeric, 2) as approved_amount
    from public.transport_client_credit_notes n
    where n.deleted_at is null
      and n.status = 'approved'
      and n.client_bill_id is not null
    group by n.client_bill_id
  )
  select b.id as client_bill_id,
         b.bill_no as bill_no,
         round((
           coalesce(
             case
               when coalesce(b.billing_type, 'NON_GST') = 'GST' then coalesce(b.invoice_total, b.net_receivable, 0)
               else coalesce(b.net_receivable, 0)
             end,
             0
           )
           - coalesce(cr.confirmed_amount, 0)
           - coalesce(cn.approved_amount, 0)
         )::numeric, 2) as outstanding_amount
  from public.transport_client_bills b
  left join confirmed_receipts cr on cr.client_bill_id = b.id
  left join approved_credit_notes cn on cn.client_bill_id = b.id
  where b.deleted_at is null
    and b.division_id = p_division_id
    and b.transport_client_id = p_transport_client_id
    and b.status = 'approved'
    and round((
      coalesce(
        case
          when coalesce(b.billing_type, 'NON_GST') = 'GST' then coalesce(b.invoice_total, b.net_receivable, 0)
          else coalesce(b.net_receivable, 0)
        end,
        0
      )
      - coalesce(cr.confirmed_amount, 0)
      - coalesce(cn.approved_amount, 0)
    )::numeric, 2) > 0
  order by b.bill_date asc, b.bill_no asc;
$$;

create or replace function public.get_transport_client_receipt_outstanding(p_division_id uuid, p_transport_client_id uuid, p_client_bill_id uuid default null)
returns table (target_label text, outstanding_amount numeric)
language plpgsql
as $$
begin
  if p_client_bill_id is not null then
    return query
    with options as (
      select * from public.list_transport_client_receipt_bill_options(p_division_id, p_transport_client_id)
    )
    select coalesce(o.bill_no, 'Selected Bill') as target_label,
           coalesce(o.outstanding_amount, 0)::numeric(14,2) as outstanding_amount
    from options o
    where o.client_bill_id = p_client_bill_id;

    if not found then
      return query select 'Selected Bill' as target_label, 0::numeric(14,2) as outstanding_amount;
    end if;
  else
    return query
    with options as (
      select * from public.list_transport_client_receipt_bill_options(p_division_id, p_transport_client_id)
    )
    select 'All Approved Bills' as target_label,
           round(coalesce(sum(o.outstanding_amount), 0)::numeric, 2) as outstanding_amount
    from options o;
  end if;
end;
$$;

create or replace function public.list_transport_pending_ledger_events(p_division_id uuid, p_source_type text)
returns table (
  source_type text,
  source_id uuid,
  source_no text,
  event_date date,
  party_name text,
  amount numeric,
  status text
)
language plpgsql
as $$
begin
  if p_source_type = 'CLIENT_BILL' then
    return query
    select 'CLIENT_BILL'::text as source_type,
           b.id as source_id,
           b.bill_no as source_no,
           b.bill_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           b.net_receivable as amount,
           b.status as status
    from public.transport_client_bills b
    join public.transport_clients c on c.id = b.transport_client_id
    where b.division_id = p_division_id and b.deleted_at is null and b.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'CLIENT_BILL' and le.source_id = b.id and le.deleted_at is null
      )
    order by b.bill_date desc, b.bill_no desc;
  elsif p_source_type = 'GST_INVOICE' then
    return query
    select 'GST_INVOICE'::text as source_type,
           i.id as source_id,
           i.invoice_no as source_no,
           i.invoice_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           i.gst_amount as amount,
           i.status as status
    from public.transport_gst_invoices i
    join public.transport_clients c on c.id = i.transport_client_id
    where i.division_id = p_division_id and i.deleted_at is null and i.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'GST_INVOICE' and le.source_id = i.id and le.deleted_at is null
      )
    order by i.invoice_date desc, i.invoice_no desc;
  elsif p_source_type = 'CLIENT_RECEIPT' then
    return query
    select 'CLIENT_RECEIPT'::text as source_type,
           r.id as source_id,
           r.receipt_no as source_no,
           r.receipt_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           r.amount_received as amount,
           r.status as status
    from public.transport_client_receipts r
    join public.transport_clients c on c.id = r.transport_client_id
    where r.division_id = p_division_id and r.deleted_at is null and r.status = 'confirmed'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'CLIENT_RECEIPT' and le.source_id = r.id and le.deleted_at is null
      )
    order by r.receipt_date desc, r.receipt_no desc;
  elsif p_source_type = 'CREDIT_NOTE' then
    return query
    select 'CREDIT_NOTE'::text as source_type,
           n.id as source_id,
           n.credit_note_no as source_no,
           n.credit_note_date as event_date,
           coalesce(c.company_name, c.name) as party_name,
           n.credit_note_amount as amount,
           n.status as status
    from public.transport_client_credit_notes n
    join public.transport_clients c on c.id = n.transport_client_id
    where n.division_id = p_division_id and n.deleted_at is null and n.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'CREDIT_NOTE' and le.source_id = n.id and le.deleted_at is null
      )
    order by n.credit_note_date desc, n.credit_note_no desc;
  elsif p_source_type = 'TRANSPORTER_STATEMENT' then
    return query
    select 'TRANSPORTER_STATEMENT'::text as source_type,
           s.id as source_id,
           s.statement_no as source_no,
           s.statement_date as event_date,
           t.name as party_name,
           s.net_payable_total as amount,
           s.status as status
    from public.transport_transporter_statements s
    join public.transport_transporters t on t.id = s.transport_transporter_id
    where s.division_id = p_division_id and s.deleted_at is null and s.status = 'approved'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'TRANSPORTER_STATEMENT' and le.source_id = s.id and le.deleted_at is null
      )
    order by s.statement_date desc, s.statement_no desc;
  elsif p_source_type = 'TRANSPORTER_PAYMENT' then
    return query
    select 'TRANSPORTER_PAYMENT'::text as source_type,
           p.id as source_id,
           p.payment_no as source_no,
           p.payment_date as event_date,
           t.name as party_name,
           p.amount_paid as amount,
           p.status as status
    from public.transport_transporter_payments p
    join public.transport_transporters t on t.id = p.transport_transporter_id
    where p.division_id = p_division_id and p.deleted_at is null and p.status = 'confirmed'
      and not exists (
        select 1 from public.transport_ledger_entries le
        where le.division_id = p_division_id and le.source_type = 'TRANSPORTER_PAYMENT' and le.source_id = p.id and le.deleted_at is null
      )
    order by p.payment_date desc, p.payment_no desc;
  else
    return;
  end if;
end;
$$;

create or replace function public.post_transport_ledger_source(p_division_id uuid, p_source_type text, p_source_id uuid)
returns table (
  entry_no text,
  posted_rows integer,
  total_debit numeric,
  total_credit numeric
)
language plpgsql
as $$
declare
  v_event_date date;
  v_amount numeric(14,2);
  v_debit_account text;
  v_credit_account text;
  v_entry_no text;
  v_rows integer;
  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);
begin
  if p_division_id is null then raise exception 'division_id is required'; end if;
  if p_source_type is null or p_source_id is null then raise exception 'source_type and source_id are required'; end if;
  if exists (
    select 1 from public.transport_ledger_entries le
    where le.division_id = p_division_id and le.source_type = p_source_type and le.source_id = p_source_id and le.deleted_at is null
  ) then raise exception 'Ledger already posted for source % / %', p_source_type, p_source_id; end if;

  if p_source_type = 'CLIENT_BILL' then
    select b.bill_date, b.net_receivable into v_event_date, v_amount
    from public.transport_client_bills b
    where b.id = p_source_id and b.division_id = p_division_id and b.deleted_at is null and b.status = 'approved';
    v_debit_account := 'CLIENT_RECEIVABLE';
    v_credit_account := 'TRANSPORT_REVENUE';
  elsif p_source_type = 'GST_INVOICE' then
    select i.invoice_date, i.gst_amount into v_event_date, v_amount
    from public.transport_gst_invoices i
    where i.id = p_source_id and i.division_id = p_division_id and i.deleted_at is null and i.status = 'approved';
    v_debit_account := 'CLIENT_RECEIVABLE';
    v_credit_account := 'GST_OUTPUT';
  elsif p_source_type = 'CLIENT_RECEIPT' then
    select r.receipt_date, r.amount_received into v_event_date, v_amount
    from public.transport_client_receipts r
    where r.id = p_source_id and r.division_id = p_division_id and r.deleted_at is null and r.status = 'confirmed';
    v_debit_account := 'CLIENT_RECEIPTS';
    v_credit_account := 'CLIENT_RECEIVABLE';
  elsif p_source_type = 'CREDIT_NOTE' then
    select n.credit_note_date, n.credit_note_amount into v_event_date, v_amount
    from public.transport_client_credit_notes n
    where n.id = p_source_id and n.division_id = p_division_id and n.deleted_at is null and n.status = 'approved';
    v_debit_account := 'TRANSPORT_REVENUE';
    v_credit_account := 'CLIENT_RECEIVABLE';
  elsif p_source_type = 'TRANSPORTER_STATEMENT' then
    select s.statement_date, s.net_payable_total into v_event_date, v_amount
    from public.transport_transporter_statements s
    where s.id = p_source_id and s.division_id = p_division_id and s.deleted_at is null and s.status = 'approved';
    v_debit_account := 'TRANSPORT_COST';
    v_credit_account := 'TRANSPORTER_PAYABLE';
  elsif p_source_type = 'TRANSPORTER_PAYMENT' then
    select p.payment_date, p.amount_paid into v_event_date, v_amount
    from public.transport_transporter_payments p
    where p.id = p_source_id and p.division_id = p_division_id and p.deleted_at is null and p.status = 'confirmed';
    v_debit_account := 'TRANSPORTER_PAYABLE';
    v_credit_account := 'TRANSPORTER_PAYMENTS';
  else
    raise exception 'Unsupported source_type: %', p_source_type;
  end if;

  if v_event_date is null then raise exception 'Eligible source record not found for posting'; end if;
  if coalesce(v_amount, 0) <= 0 then raise exception 'Posting amount must be greater than zero'; end if;

  v_entry_no := public.generate_transport_ledger_entry_no(p_division_id, v_event_date);

  insert into public.transport_ledger_entries (division_id, entry_no, entry_date, source_type, source_id, account_code, debit_amount, credit_amount, remarks)
  values
    (p_division_id, v_entry_no, v_event_date, p_source_type, p_source_id, v_debit_account, v_amount, 0, p_source_type || ' debit'),
    (p_division_id, v_entry_no, v_event_date, p_source_type, p_source_id, v_credit_account, 0, v_amount, p_source_type || ' credit');

  select count(*)::integer,
         round(coalesce(sum(le.debit_amount),0)::numeric,2),
         round(coalesce(sum(le.credit_amount),0)::numeric,2)
  into v_rows, v_total_debit, v_total_credit
  from public.transport_ledger_entries le
  where le.division_id = p_division_id and le.entry_no = v_entry_no and le.deleted_at is null;

  if coalesce(v_total_debit,0) <> coalesce(v_total_credit,0) then
    raise exception 'Debit/Credit mismatch for ledger entry %', v_entry_no;
  end if;

  return query
  select v_entry_no as entry_no,
         v_rows as posted_rows,
         v_total_debit as total_debit,
         v_total_credit as total_credit;
end;
$$;

alter table public.transport_client_credit_note_number_sequences enable row level security;
alter table public.transport_client_credit_notes enable row level security;

do $$ begin create policy transport_client_credit_note_number_sequences_auth_rw on public.transport_client_credit_note_number_sequences for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy transport_client_credit_notes_auth_rw on public.transport_client_credit_notes for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;

with seed_modules(module_code) as (
  values ('transport-client-credit-notes')
),
seed_actions(action_code) as (
  values ('view'), ('edit')
)
insert into public.permissions (module_code, action_code, label, is_active)
select m.module_code,
       a.action_code,
       'Transport Client Credit Notes ' || initcap(a.action_code),
       true
from seed_modules m
cross join seed_actions a
where not exists (
  select 1 from public.permissions p
  where p.module_code = m.module_code
    and p.action_code = a.action_code
);

insert into public.role_permissions (role_id, permission_id, allow)
select r.id, p.id, true
from public.roles r
join public.permissions p
  on p.module_code = 'transport-client-credit-notes'
 and p.action_code in ('view', 'edit')
where r.code = 'super_admin'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );