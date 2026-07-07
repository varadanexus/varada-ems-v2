-- Sprint 17f: Hard delete (admin@varadanexus.com only) + invoice-number reclaim
-- Deleting the most recent invoice releases its number back to the central
-- register, so the next invoice continues from the previous number rather than
-- skipping the deleted one.

create or replace function public.ds_is_hard_delete_allowed()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where id = public.current_app_user_id()
      and lower(email) = 'admin@varadanexus.com'
  );
$$;

grant execute on function public.ds_is_hard_delete_allowed() to authenticated;

create or replace function public.ds_delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_fy text;
  v_seq integer;
begin
  if not public.ds_is_hard_delete_allowed() then
    raise exception 'Only the admin@varadanexus.com account can hard-delete invoices';
  end if;

  select * into v_inv from public.ds_invoices where id = p_invoice_id;
  if not found then return; end if;

  v_fy := split_part(v_inv.invoice_number, '/', 3);
  v_seq := nullif(regexp_replace(split_part(v_inv.invoice_number, '/', 4), '\D', '', 'g'), '')::integer;

  -- Remove not-yet-posted Central Accounts staging for this invoice.
  if v_inv.ca_financial_document_id is not null then
    delete from public.posting_queue where financial_document_id = v_inv.ca_financial_document_id;
    delete from public.financial_documents where id = v_inv.ca_financial_document_id and status <> 'posted';
  end if;

  -- Cascades to ds_invoice_items and ds_payments.
  delete from public.ds_invoices where id = p_invoice_id;

  -- Reclaim the number only if this was the latest issued number for the year.
  if v_fy is not null and v_seq is not null then
    update public.central_invoice_number_sequences
    set last_number = greatest(last_number - 1, 0), updated_at = now()
    where financial_year_label = v_fy and last_number = v_seq;
  end if;
end;
$$;

grant execute on function public.ds_delete_invoice(uuid) to authenticated;

create or replace function public.ds_delete_subscription(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ds_is_hard_delete_allowed() then
    raise exception 'Only the admin@varadanexus.com account can hard-delete retainers';
  end if;
  delete from public.ds_subscriptions where id = p_subscription_id;
end;
$$;

grant execute on function public.ds_delete_subscription(uuid) to authenticated;
