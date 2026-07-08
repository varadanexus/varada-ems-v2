-- Sprint 17i: Link credit notes to invoice settlement
-- A credit note issued against an invoice reduces its outstanding balance. When
-- payments + credits cover the total, the invoice is marked paid.

alter table public.ds_invoices
  add column if not exists amount_credited numeric(14,2) not null default 0;

-- Adjust an invoice's applied credit by p_delta and recompute its status
-- (settled = amount_paid + amount_credited).
create or replace function public.ds_apply_invoice_credit(p_invoice_id uuid, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record; v_settled numeric;
begin
  if p_invoice_id is null then return; end if;
  update public.ds_invoices
    set amount_credited = greatest(coalesce(amount_credited, 0) + p_delta, 0), updated_at = now()
    where id = p_invoice_id;
  select total_amount, amount_paid, amount_credited, status into v from public.ds_invoices where id = p_invoice_id;
  if not found or v.status = 'void' or v.status = 'draft' then return; end if;
  v_settled := coalesce(v.amount_paid, 0) + coalesce(v.amount_credited, 0);
  update public.ds_invoices
    set status = case
      when v.total_amount > 0 and v_settled >= v.total_amount then 'paid'
      when v_settled > 0 then 'partially_paid'
      else 'sent' end,
      updated_at = now()
    where id = p_invoice_id;
end;
$$;
grant execute on function public.ds_apply_invoice_credit(uuid, numeric) to authenticated;

-- Deleting a credit note reverses the credit it applied to the linked invoice.
create or replace function public.ds_delete_credit_note(p_credit_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  if v_cn.invoice_id is not null then
    perform public.ds_apply_invoice_credit(v_cn.invoice_id, -coalesce(v_cn.total_amount, 0));
  end if;
  if v_fy is not null and v_seq is not null then
    update public.central_credit_note_sequences set last_number = greatest(last_number - 1, 0), updated_at = now()
    where financial_year_label = v_fy and last_number = v_seq;
  end if;
end;
$$;
grant execute on function public.ds_delete_credit_note(uuid) to authenticated;
