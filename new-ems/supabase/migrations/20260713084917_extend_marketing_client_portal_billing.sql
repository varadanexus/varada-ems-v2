-- Give centrally authenticated Digital Marketing & Services clients a
-- read-only billing view. The custom portal session is validated on every
-- request and every row is restricted to the linked ds_client_id.

create or replace function public.marketing_client_portal_billing(
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
  v_ds_client_id uuid;
  v_result jsonb;
begin
  select * into v_ctx from public.marketing_portal_resolve(p_session_token);
  if v_ctx.profile_id is null or v_ctx.actor_kind <> 'client' then
    raise exception 'A valid client portal session is required';
  end if;

  select c.ds_client_id into v_ds_client_id
  from public.marketing_clients c
  where c.id = v_ctx.profile_id;

  if v_ds_client_id is null then
    raise exception 'The client portal is not linked to a billing account';
  end if;

  if p_resource = 'invoices' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.issue_date desc, x.created_at desc), '[]'::jsonb)
    into v_result
    from (
      select
        i.id, i.invoice_number, i.project_id, i.invoice_type, i.issue_date,
        i.due_date, i.currency, i.subtotal, i.tax_amount, i.total_amount,
        i.amount_paid, coalesce(i.amount_credited, 0) as amount_credited,
        greatest(i.total_amount - i.amount_paid - coalesce(i.amount_credited, 0), 0) as amount_due,
        i.status, i.notes, i.created_at,
        case when p.id is null then null else jsonb_build_object('id', p.id, 'code', p.code, 'title', p.title) end as project
      from public.ds_invoices i
      left join public.ds_projects p on p.id = i.project_id
      where i.client_id = v_ds_client_id
    ) x;
  elsif p_resource = 'payments' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_at desc, x.created_at desc), '[]'::jsonb)
    into v_result
    from (
      select
        pay.id, pay.invoice_id, pay.amount, pay.method, pay.reference,
        pay.paid_at, pay.notes, pay.created_at,
        jsonb_build_object(
          'invoice_number', inv.invoice_number,
          'currency', inv.currency,
          'total_amount', inv.total_amount,
          'status', inv.status
        ) as invoice
      from public.ds_payments pay
      join public.ds_invoices inv on inv.id = pay.invoice_id
      where inv.client_id = v_ds_client_id
    ) x;
  else
    raise exception 'Unsupported client billing resource';
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.marketing_client_portal_billing(text, text) from public;
grant execute on function public.marketing_client_portal_billing(text, text) to anon, authenticated;
