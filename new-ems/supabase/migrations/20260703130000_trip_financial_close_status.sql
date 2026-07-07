-- Derive transport trip financial status from both settlement legs.
-- Closed is system-managed: client bill settled AND transporter statement settled.

alter table public.transport_trips drop constraint if exists chk_transport_trips_status;
alter table public.transport_trips
  add constraint chk_transport_trips_status
  check (status in (
    'draft','assigned','dispatched','loading','loaded','in_transit',
    'unloading','completed','financial_review','closed'
  ));

create or replace function public.recalculate_transport_trip_financial_status(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_client_settled boolean := false;
  v_transporter_settled boolean := false;
  v_next_status text;
begin
  select t.status into v_current_status
  from public.transport_trips t
  where t.id = p_trip_id and t.deleted_at is null;

  if v_current_status is null
     or v_current_status not in ('completed','financial_review','closed') then
    return v_current_status;
  end if;

  select exists (
    select 1
    from public.transport_client_bill_trips bt
    join public.transport_client_bills b on b.id = bt.bill_id
    where bt.trip_id = p_trip_id
      and bt.deleted_at is null
      and b.deleted_at is null
      and b.status = 'approved'
      and round((
        coalesce(
          case
            when coalesce(b.billing_type, 'NON_GST') = 'GST'
              then coalesce(b.invoice_total, b.net_receivable, 0)
            else coalesce(b.net_receivable, 0)
          end, 0
        )
        - coalesce((
            select sum(r.amount_received)
            from public.transport_client_receipts r
            where r.client_bill_id = b.id
              and r.deleted_at is null and r.status = 'confirmed'
          ), 0)
        - coalesce((
            select sum(n.credit_note_amount)
            from public.transport_client_credit_notes n
            where n.client_bill_id = b.id
              and n.deleted_at is null and n.status = 'approved'
          ), 0)
      )::numeric, 2) <= 0.01
  ) into v_client_settled;

  select exists (
    select 1
    from public.transport_transporter_statement_trips st
    join public.transport_transporter_statements s on s.id = st.statement_id
    where st.trip_id = p_trip_id
      and st.deleted_at is null
      and s.deleted_at is null
      and s.status = 'approved'
      and round((
        coalesce(s.net_payable_total, 0)
        - coalesce((
            select sum(p.amount_paid)
            from public.transport_transporter_payments p
            where p.transporter_statement_id = s.id
              and p.deleted_at is null and p.status = 'confirmed'
          ), 0)
      )::numeric, 2) <= 0.01
  ) into v_transporter_settled;

  v_next_status := case
    when v_client_settled and v_transporter_settled then 'closed'
    else 'financial_review'
  end;

  if v_next_status is distinct from v_current_status then
    update public.transport_trips
    set status = v_next_status, updated_at = now()
    where id = p_trip_id;
  end if;

  return v_next_status;
end;
$$;

revoke all on function public.recalculate_transport_trip_financial_status(uuid) from public, anon, authenticated;

create or replace function public.trigger_recalculate_transport_trip_financial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_trip_id uuid;
begin
  if tg_table_name = 'transport_client_bill_trips' then
    perform public.recalculate_transport_trip_financial_status(coalesce(new.trip_id, old.trip_id));
  elsif tg_table_name = 'transport_transporter_statement_trips' then
    perform public.recalculate_transport_trip_financial_status(coalesce(new.trip_id, old.trip_id));
  elsif tg_table_name in ('transport_client_receipts', 'transport_client_credit_notes') then
    v_parent_id := coalesce(new.client_bill_id, old.client_bill_id);
    for v_trip_id in
      select bt.trip_id from public.transport_client_bill_trips bt
      where bt.bill_id = v_parent_id
    loop perform public.recalculate_transport_trip_financial_status(v_trip_id); end loop;
  elsif tg_table_name = 'transport_transporter_payments' then
    v_parent_id := coalesce(new.transporter_statement_id, old.transporter_statement_id);
    for v_trip_id in
      select st.trip_id from public.transport_transporter_statement_trips st
      where st.statement_id = v_parent_id
    loop perform public.recalculate_transport_trip_financial_status(v_trip_id); end loop;
  elsif tg_table_name = 'transport_client_bills' then
    v_parent_id := coalesce(new.id, old.id);
    for v_trip_id in
      select bt.trip_id from public.transport_client_bill_trips bt
      where bt.bill_id = v_parent_id
    loop perform public.recalculate_transport_trip_financial_status(v_trip_id); end loop;
  elsif tg_table_name = 'transport_transporter_statements' then
    v_parent_id := coalesce(new.id, old.id);
    for v_trip_id in
      select st.trip_id from public.transport_transporter_statement_trips st
      where st.statement_id = v_parent_id
    loop perform public.recalculate_transport_trip_financial_status(v_trip_id); end loop;
  end if;
  return null;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'transport_client_receipts',
    'transport_client_credit_notes',
    'transport_transporter_payments',
    'transport_client_bills',
    'transport_transporter_statements',
    'transport_client_bill_trips',
    'transport_transporter_statement_trips'
  ] loop
    execute format('drop trigger if exists trg_financial_status_recalc on public.%I', v_table);
    execute format(
      'create trigger trg_financial_status_recalc after insert or update or delete on public.%I for each row execute function public.trigger_recalculate_transport_trip_financial_status()',
      v_table
    );
  end loop;
end;
$$;

-- Initial reconciliation for existing completed/financial-review/closed trips.
do $$
declare v_trip_id uuid;
begin
  for v_trip_id in
    select id from public.transport_trips
    where deleted_at is null and status in ('completed','financial_review','closed')
  loop
    perform public.recalculate_transport_trip_financial_status(v_trip_id);
  end loop;
end;
$$;

-- Agent commission becomes withdrawable only after full financial closure.
create or replace function public.transport_agent_completed_commission(p_transport_agent_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(mapping.commission_amount), 0)::numeric
  from public.transport_trips t
  join lateral (
    select case
      when m.commission_type = 'per_mt'
        then coalesce(m.commission_value, 0) * coalesce(t.quantity_mt, 0)
      when m.commission_type = 'percentage_margin'
        then coalesce(t.company_margin, 0) * coalesce(m.commission_value, 0) / 100
      else coalesce(m.commission_value, 0)
    end::numeric as commission_amount
    from public.transport_truck_agent_commission_mapping m
    where m.truck_id = t.truck_id
      and m.transport_agent_id = p_transport_agent_id
      and m.is_active and m.deleted_at is null
      and (m.effective_from is null or m.effective_from <= t.trip_date)
      and (m.effective_to is null or m.effective_to >= t.trip_date)
    order by m.effective_from desc nulls last, m.created_at desc
    limit 1
  ) mapping on true
  where t.deleted_at is null and t.status = 'closed';
$$;

revoke all on function public.transport_agent_completed_commission(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
