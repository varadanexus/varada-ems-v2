-- Sprint 17b: Digital Services retainer / subscription auto-invoicing
-- Generates draft invoices for every active subscription whose next invoice is
-- due (next_invoice_date <= today), then advances the next date by the cycle.
-- Idempotent per run: only bills subscriptions that are actually due.

create or replace function public.ds_generate_due_subscription_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_num text;
  v_inv uuid;
  v_due date;
  v_tax numeric(14,2);
begin
  for r in
    select * from public.ds_subscriptions
    where status = 'active'
      and coalesce(next_invoice_date, start_date) <= current_date
  loop
    v_due := coalesce(r.next_invoice_date, r.start_date, current_date);
    v_num := public.ds_next_invoice_number();
    v_tax := round(coalesce(r.amount, 0) * coalesce(r.tax_rate, 0) / 100.0, 2);

    insert into public.ds_invoices (
      invoice_number, client_id, project_id, subscription_id, invoice_type,
      issue_date, due_date, currency, subtotal, tax_amount, total_amount, status, notes
    ) values (
      v_num, r.client_id, r.project_id, r.id, 'retainer',
      v_due, (v_due + interval '7 days')::date, 'INR',
      coalesce(r.amount, 0), v_tax, coalesce(r.amount, 0) + v_tax, 'draft',
      r.plan_name
    ) returning id into v_inv;

    insert into public.ds_invoice_items (invoice_id, description, quantity, unit_price, tax_rate, line_total, sort_order)
    values (
      v_inv,
      coalesce(r.plan_name, 'Retainer') || ' — ' || to_char(v_due, 'Mon YYYY'),
      1, coalesce(r.amount, 0), coalesce(r.tax_rate, 0), coalesce(r.amount, 0) + v_tax, 0
    );

    update public.ds_subscriptions
    set next_invoice_date = case r.billing_cycle
          when 'quarterly' then (v_due + interval '3 months')::date
          when 'annual' then (v_due + interval '1 year')::date
          else (v_due + interval '1 month')::date
        end,
        updated_at = now()
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.ds_generate_due_subscription_invoices() to authenticated;
