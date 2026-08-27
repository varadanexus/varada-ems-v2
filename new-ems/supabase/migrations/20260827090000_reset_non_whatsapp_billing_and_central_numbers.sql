-- Authorized production cleanup of non-WhatsApp test billing data.
-- WhatsApp Platform billing, payments, subscriptions, invoices, credit notes,
-- refunds, coupons, quotes and audit records are deliberately out of scope.

do $$
declare
  v_tables text[] := array[
    -- Central Accounts transactional records (child/parent order is resolved below).
    'posting_queue','document_postings','journal_lines','journal_entries',
    'payable_allocations','payable_open_items','receivable_allocations','receivable_open_items',
    'financial_documents','accounting_voucher_lines','accounting_vouchers','accounting_voucher_sequences',
    'purchase_bills','vendor_advances','vendor_settlements',
    'bank_reconciliation_certificates','bank_statement_lines','bank_statement_imports',
    'gst_document_classifications','gst_2b_items','gst_2b_import_batches','gst_return_periods','gst_payments',
    'tds_deductions','statutory_filing_records','annual_tax_workpapers',
    'fixed_asset_depreciation_runs','fixed_asset_movements',
    'accounting_budget_lines','accounting_budgets','accounting_control_evidence',
    'accounting_close_tasks','accounting_close_checklists',

    -- Digital Services and Marketing billing.
    'ds_credit_note_items','ds_credit_notes','ds_payments','ds_invoice_items','ds_invoices','ds_subscriptions',
    'marketing_vendor_payments','marketing_vendor_invoices','marketing_project_finance',

    -- Interiors client billing.
    'interior_billing_lines','interior_billing_headers',

    -- Hospital client/vendor billing. Operational projects, quotations and procurement remain.
    'hospital_invoice_lines','hospital_credit_notes','hospital_invoices','hospital_vendor_bills',

    -- Transportation billing, settlements, ledgers and their module-local registers.
    'transport_client_bill_trips','transport_client_bills','transport_gst_invoices',
    'transport_client_credit_notes','transport_client_receipts',
    'transport_transporter_statement_trips','transport_transporter_statements','transport_transporter_payments',
    'transport_ledger_entries','transport_trip_expenses','transport_agent_penalties',
    'transport_agent_withdrawal_requests',
    'transport_client_bill_number_sequences','transport_gst_invoice_number_sequences',
    'transport_client_credit_note_number_sequences','transport_client_receipt_number_sequences',
    'transport_transporter_statement_number_sequences','transport_transporter_payment_number_sequences',
    'transport_ledger_entry_number_sequences','transport_trip_expense_sequences',

    -- Legacy EMS billing tables retained in the remote schema.
    'invoice_trip_breakdown_gst','invoice_trip_breakdown','client_invoices_gst','client_payments','client_invoices',
    'gst_credit_notes','transporter_payments','transporter_invoices','transporter_ledger',
    'ledger_entries','company_ledger','expenses','project_expenses'
  ];
  v_pending text[] := v_tables;
  v_next_pending text[];
  v_table text;
  v_progress boolean;
  v_remaining bigint;
  v_wa_invoices bigint;
  v_wa_credit_notes bigint;
  v_wa_payments bigint;
  v_wa_subscriptions bigint;
begin
  if exists (select 1 from unnest(v_tables) as t(name) where name like 'whatsapp_platform%') then
    raise exception 'Cleanup target list must never include a WhatsApp Platform table';
  end if;

  select count(*) into v_wa_invoices from public.whatsapp_platform_billing_invoices;
  select count(*) into v_wa_credit_notes from public.whatsapp_platform_billing_credit_notes;
  select count(*) into v_wa_payments from public.whatsapp_platform_billing_payments;
  select count(*) into v_wa_subscriptions from public.whatsapp_platform_billing_subscriptions;

  -- Remove only non-WhatsApp billing-document registry pointers. The physical
  -- Drive files remain as a recoverable historical backup outside the live EMS.
  if to_regclass('public.drive_documents') is not null then
    delete from public.drive_documents
    where coalesce(entity_type, '') = any(array[
      'ds_invoices','ds_credit_notes','marketing_vendor_invoices',
      'interior_billing_headers','hospital_invoices','hospital_credit_notes','hospital_vendor_bills',
      'transport_client_bills','transport_gst_invoices','transport_client_credit_notes',
      'transport_client_receipts','transport_transporter_statements','transport_transporter_payments',
      'client_invoices','gst_credit_notes','transporter_invoices'
    ]);
  end if;

  -- Delete children before parents without using CASCADE. Any unlisted table
  -- that still references billing data makes the migration stop and roll back.
  while cardinality(v_pending) > 0 loop
    v_progress := false;
    v_next_pending := array[]::text[];
    foreach v_table in array v_pending loop
      if to_regclass(format('public.%I', v_table)) is null then
        continue;
      end if;
      begin
        execute format('delete from public.%I', v_table);
        v_progress := true;
      exception when foreign_key_violation then
        v_next_pending := array_append(v_next_pending, v_table);
      end;
    end loop;
    if cardinality(v_next_pending) > 0 and not v_progress then
      raise exception 'Non-WhatsApp billing cleanup stopped by an unlisted dependency: %', array_to_string(v_next_pending, ', ');
    end if;
    v_pending := v_next_pending;
  end loop;

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then continue; end if;
    execute format('select count(*) from public.%I', v_table) into v_remaining;
    if v_remaining <> 0 then
      raise exception 'Billing cleanup verification failed for %. Remaining rows: %', v_table, v_remaining;
    end if;
  end loop;

  if (select count(*) from public.whatsapp_platform_billing_invoices) <> v_wa_invoices
     or (select count(*) from public.whatsapp_platform_billing_credit_notes) <> v_wa_credit_notes
     or (select count(*) from public.whatsapp_platform_billing_payments) <> v_wa_payments
     or (select count(*) from public.whatsapp_platform_billing_subscriptions) <> v_wa_subscriptions then
    raise exception 'WhatsApp Platform billing preservation check failed';
  end if;
end;
$$;

-- Hospital's old module-local invoice/CN counters are no longer used, but
-- remove their test values while retaining project/query counters.
delete from public.hospital_document_sequences
where document_type in ('INVOICE','CREDIT_NOTE');

-- The earlier EMS already consumed invoice 001 and 002 for FY 26-27.
-- Consequently, the next company invoice is INVGB/26-27/003.
delete from public.central_invoice_number_sequences;
insert into public.central_invoice_number_sequences(financial_year_label,last_number,updated_at)
values ('26-27',2,now());

-- CN/001 belongs to the earlier EMS. Credit-note numbering is now a single
-- company-wide lifetime register, so the next credit note is CN/002.
delete from public.central_credit_note_sequences;
insert into public.central_credit_note_sequences(financial_year_label,last_number,updated_at)
values ('GLOBAL',1,now());

create or replace function public.next_central_invoice_number(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_fy text; v_n integer;
begin
  v_fy:=public.get_transport_financial_year_label(coalesce(p_date,current_date));
  insert into public.central_invoice_number_sequences(financial_year_label,last_number)
  values(v_fy,1)
  on conflict(financial_year_label)
  do update set last_number=public.central_invoice_number_sequences.last_number+1,updated_at=now()
  returning last_number into v_n;
  return 'INVGB/'||v_fy||'/'||lpad(v_n::text,3,'0');
end;
$$;

create or replace function public.next_central_credit_note_number(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_n integer;
begin
  insert into public.central_credit_note_sequences(financial_year_label,last_number)
  values('GLOBAL',1)
  on conflict(financial_year_label)
  do update set last_number=public.central_credit_note_sequences.last_number+1,updated_at=now()
  returning last_number into v_n;
  return 'CN/'||lpad(v_n::text,3,'0');
end;
$$;

-- Preserve already-issued legacy WhatsApp numbers exactly as stored while
-- allowing every future WhatsApp document to use the new central formats.
create or replace function public.whatsapp_platform_enforce_central_document_number()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_table_name='whatsapp_platform_billing_invoices' then
    if new.invoice_number is null or new.invoice_number !~ '^(INV/GB|INVGB)/[0-9]{2}-[0-9]{2}/[0-9]{3,}$' then
      new.invoice_number:=public.next_central_document_number('invoice',coalesce(new.invoice_date,current_date));
    end if;
  elsif tg_table_name='whatsapp_platform_billing_credit_notes' then
    if new.credit_note_number is null or new.credit_note_number !~ '^(CR/[0-9]{2}-[0-9]{2}/[0-9]{3,}|CN/[0-9]{3,})$' then
      new.credit_note_number:=public.next_central_document_number('credit_note',coalesce(new.credit_note_date,current_date));
    end if;
  else
    raise exception 'Unsupported WhatsApp billing document table: %',tg_table_name;
  end if;
  return new;
end;
$$;

-- Keep admin hard-delete number reclamation compatible with the new formats.
create or replace function public.ds_delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_inv record; v_fy text; v_seq integer;
begin
  if not public.ds_is_hard_delete_allowed() then raise exception 'Only the admin@varadanexus.com account can hard-delete invoices'; end if;
  select * into v_inv from public.ds_invoices where id=p_invoice_id;
  if not found then return; end if;
  if v_inv.invoice_number like 'INVGB/%' then
    v_fy:=split_part(v_inv.invoice_number,'/',2);
    v_seq:=nullif(regexp_replace(split_part(v_inv.invoice_number,'/',3),'\D','','g'),'')::integer;
  else
    v_fy:=split_part(v_inv.invoice_number,'/',3);
    v_seq:=nullif(regexp_replace(split_part(v_inv.invoice_number,'/',4),'\D','','g'),'')::integer;
  end if;
  if v_inv.ca_financial_document_id is not null then
    delete from public.posting_queue where financial_document_id=v_inv.ca_financial_document_id;
    delete from public.financial_documents where id=v_inv.ca_financial_document_id and status<>'posted';
  end if;
  delete from public.ds_invoices where id=p_invoice_id;
  if v_fy is not null and v_seq is not null then
    update public.central_invoice_number_sequences set last_number=greatest(last_number-1,0),updated_at=now()
    where financial_year_label=v_fy and last_number=v_seq;
  end if;
end;
$$;

create or replace function public.ds_delete_credit_note(p_credit_note_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_cn record; v_seq integer;
begin
  if not public.ds_is_hard_delete_allowed() then raise exception 'Only the admin@varadanexus.com account can hard-delete credit notes'; end if;
  select * into v_cn from public.ds_credit_notes where id=p_credit_note_id;
  if not found then return; end if;
  v_seq:=nullif(regexp_replace(split_part(v_cn.credit_note_number,'/',case when v_cn.credit_note_number like 'CN/%' then 2 else 3 end),'\D','','g'),'')::integer;
  if v_cn.ca_financial_document_id is not null then
    delete from public.posting_queue where financial_document_id=v_cn.ca_financial_document_id;
    delete from public.financial_documents where id=v_cn.ca_financial_document_id and status<>'posted';
  end if;
  delete from public.ds_credit_notes where id=p_credit_note_id;
  if v_cn.invoice_id is not null then perform public.ds_apply_invoice_credit(v_cn.invoice_id,-coalesce(v_cn.total_amount,0)); end if;
  if v_seq is not null then
    update public.central_credit_note_sequences set last_number=greatest(last_number-1,0),updated_at=now()
    where financial_year_label='GLOBAL' and last_number=v_seq;
  end if;
end;
$$;

revoke all on function public.next_central_invoice_number(date) from public,anon;
revoke all on function public.next_central_credit_note_number(date) from public,anon;
grant execute on function public.next_central_invoice_number(date) to authenticated,service_role;
grant execute on function public.next_central_credit_note_number(date) to authenticated,service_role;
grant execute on function public.ds_delete_invoice(uuid) to authenticated;
grant execute on function public.ds_delete_credit_note(uuid) to authenticated;

comment on function public.next_central_invoice_number(date) is
  'Company-wide FY invoice register. FY 26-27 reserves 001 and 002 for the previous EMS; new numbering begins at INVGB/26-27/003.';
comment on function public.next_central_credit_note_number(date) is
  'Company-wide lifetime credit-note register using CN/NNN. CN/001 belongs to the previous EMS; new numbering begins at CN/002.';

notify pgrst,'reload schema';
