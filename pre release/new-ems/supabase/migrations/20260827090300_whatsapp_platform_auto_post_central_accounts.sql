-- Automatically post verified WhatsApp Platform billing events into Central
-- Accounts. The billing tables remain the source of truth; this migration
-- creates idempotent accounting events, balanced journals and GST registers.

insert into public.divisions(code,name,is_active)
values ('WHATSAPP_PLATFORM','WhatsApp Platform',true)
on conflict(code) do update set name=excluded.name,is_active=true;

insert into public.coa_accounts(code,name,account_class,account_group,hierarchy_level,is_posting_allowed,is_control_account,is_active)
values
  ('1120','Razorpay Clearing','ASSET','BANK',4,true,false,true),
  ('1320','WhatsApp Platform Receivable Control','ASSET','RECEIVABLE_CONTROL',4,true,true,true),
  ('1420','Input GST Recoverable - Razorpay Fees','ASSET','INPUT_TAX',4,true,false,true),
  ('2210','Output CGST - WhatsApp Platform','LIABILITY','TAX_CONTROL',4,true,false,true),
  ('2220','Output SGST - WhatsApp Platform','LIABILITY','TAX_CONTROL',4,true,false,true),
  ('2230','Output IGST - WhatsApp Platform','LIABILITY','TAX_CONTROL',4,true,false,true),
  ('2240','Output GST Pending Classification - WhatsApp Platform','LIABILITY','TAX_CONTROL',4,true,false,true),
  ('2250','WhatsApp Customer Refunds Payable','LIABILITY','REFUND_CONTROL',4,true,true,true),
  ('4120','WhatsApp Platform Subscription Revenue','INCOME','DIGITAL_REVENUE',4,true,false,true),
  ('4130','Payment Gateway Fee Recovery','INCOME','FEE_RECOVERY',4,true,false,true),
  ('5210','Razorpay Payment Gateway Charges','EXPENSE','PAYMENT_GATEWAY_COST',4,true,false,true)
on conflict(code) do update set
  name=excluded.name,account_class=excluded.account_class,account_group=excluded.account_group,
  is_posting_allowed=true,is_control_account=excluded.is_control_account,is_active=true,updated_at=now();

select public.ensure_reporting_dimension('division','WHATSAPP_PLATFORM','WhatsApp Platform');
select public.ensure_reporting_dimension('project','WHATSAPP_BILLING','WhatsApp Platform Billing');
select public.ensure_reporting_dimension('profit_center','WHATSAPP_PLATFORM_CORE','WhatsApp Platform Core');

create unique index if not exists uq_document_postings_posted_financial_document
  on public.document_postings(financial_document_id) where posting_status='posted';
create unique index if not exists uq_journal_entries_posted_financial_document
  on public.journal_entries(financial_document_id) where status='posted' and financial_document_id is not null;
create unique index if not exists uq_receivable_allocations_item_document
  on public.receivable_allocations(receivable_item_id,applied_document_id) where applied_document_id is not null;

create table if not exists public.whatsapp_platform_central_accounting_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check(event_type in ('invoice_issued','payment_captured','credit_note_issued','refund_processed')),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  source_table text not null,
  source_document_id uuid not null,
  source_document_no text,
  document_environment text not null check(document_environment in ('live','test')),
  status text not null default 'pending' check(status in ('pending','processing','posted','failed','ignored')),
  attempt_count integer not null default 0 check(attempt_count>=0),
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  amount_paise bigint not null check(amount_paise>=0),
  occurred_at timestamptz not null,
  posted_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_ca_events_retry
  on public.whatsapp_platform_central_accounting_events(status,last_attempt_at,occurred_at)
  where status in ('pending','failed');
create index if not exists idx_whatsapp_ca_events_tenant
  on public.whatsapp_platform_central_accounting_events(tenant_id,occurred_at desc);
alter table public.whatsapp_platform_central_accounting_events enable row level security;
revoke all on public.whatsapp_platform_central_accounting_events from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_platform_central_accounting_events to service_role;

create or replace function public.whatsapp_platform_ensure_accounting_period(p_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_period uuid;v_existing record;v_fy_start date;v_fy_end date;v_fy_id uuid;v_period_start date;
  v_fy_code text;v_period_index integer;
begin
  if p_date is null then raise exception 'Accounting date is required';end if;
  select * into v_existing from public.accounting_periods where p_date between start_date and end_date order by start_date desc limit 1;
  if v_existing.id is not null then
    if v_existing.status not in ('open','reopened') then raise exception 'Accounting period % is %',v_existing.period_code,v_existing.status;end if;
    return v_existing.id;
  end if;
  v_fy_start:=make_date(case when extract(month from p_date)>=4 then extract(year from p_date)::int else extract(year from p_date)::int-1 end,4,1);
  v_fy_end:=(v_fy_start+interval '1 year'-interval '1 day')::date;
  v_fy_code:=to_char(v_fy_start,'YYYY')||'-'||to_char(v_fy_end,'YYYY');
  insert into public.fiscal_years(code,start_date,end_date,status,is_year_end_locked)
  values(v_fy_code,v_fy_start,v_fy_end,'open',false)
  on conflict(code) do update set updated_at=now()
  returning id into v_fy_id;
  select id into v_fy_id from public.fiscal_years where code=v_fy_code;
  if exists(select 1 from public.fiscal_years where id=v_fy_id and status not in ('open')) then raise exception 'Fiscal year % is not open',v_fy_code;end if;
  v_period_start:=date_trunc('month',p_date)::date;
  v_period_index:=((extract(year from v_period_start)::int-extract(year from v_fy_start)::int)*12+extract(month from v_period_start)::int-extract(month from v_fy_start)::int)+1;
  insert into public.accounting_periods(fiscal_year_id,period_code,period_name,period_index,start_date,end_date,status)
  values(v_fy_id,to_char(v_period_start,'YYYYMM'),to_char(v_period_start,'Mon YYYY'),v_period_index,v_period_start,(v_period_start+interval '1 month'-interval '1 day')::date,'open')
  on conflict(fiscal_year_id,period_code) do nothing;
  select id into v_period from public.accounting_periods where fiscal_year_id=v_fy_id and period_code=to_char(v_period_start,'YYYYMM');
  return v_period;
end;$$;

create or replace function public.whatsapp_platform_post_central_journal(
  p_document_family text,p_source_table text,p_source_id uuid,p_source_no text,p_tenant_id uuid,
  p_document_date date,p_gross numeric,p_taxable numeric,p_tax numeric,p_net numeric,
  p_event_type text,p_lines jsonb,p_evidence jsonb default '{}'::jsonb
) returns table(financial_document_id uuid,journal_entry_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_division uuid;v_counterparty uuid;v_project uuid;v_profit_center uuid;v_period uuid;v_fy uuid;
  v_fd uuid;v_journal uuid;v_posting text;v_journal_no text;v_line jsonb;v_account uuid;v_line_no integer:=0;
  v_debit numeric(14,2);v_credit numeric(14,2);v_existing_journal uuid;v_tenant_name text;
begin
  if p_source_id is null or p_tenant_id is null or p_document_date is null then raise exception 'Accounting source, tenant and date are required';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_document_family||':'||p_source_id::text,0));
  select name into v_tenant_name from public.whatsapp_platform_tenants where id=p_tenant_id;
  select id into v_division from public.divisions where code='WHATSAPP_PLATFORM';
  v_counterparty:=public.ensure_reporting_dimension('counterparty','WA_TENANT:'||p_tenant_id::text,coalesce(v_tenant_name,'WhatsApp Customer'));
  v_project:=public.ensure_reporting_dimension('project','WHATSAPP_BILLING','WhatsApp Platform Billing');
  v_profit_center:=public.ensure_reporting_dimension('profit_center','WHATSAPP_PLATFORM_CORE','WhatsApp Platform Core');
  select round(coalesce(sum(coalesce((x->>'debit')::numeric,0)),0),2),round(coalesce(sum(coalesce((x->>'credit')::numeric,0)),0),2)
  into v_debit,v_credit from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) x;
  if v_debit<=0 or v_credit<=0 or abs(v_debit-v_credit)>0.005 then raise exception 'Unbalanced WhatsApp journal: debit %, credit %',v_debit,v_credit;end if;
  insert into public.financial_documents(document_family,source_module,source_table,source_document_id,source_document_no,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,status,document_date,effective_date,gross_amount,taxable_amount,tax_amount,net_amount)
  values(p_document_family,'whatsapp-platform',p_source_table,p_source_id,p_source_no,v_division,v_counterparty,v_project,v_profit_center,'ready_for_posting',p_document_date,p_document_date,round(p_gross,2),round(p_taxable,2),round(p_tax,2),round(p_net,2))
  on conflict(source_module,source_table,source_document_id,document_family) do update set
    source_document_no=excluded.source_document_no,division_id=excluded.division_id,counterparty_dimension_id=excluded.counterparty_dimension_id,
    project_dimension_id=excluded.project_dimension_id,profit_center_dimension_id=excluded.profit_center_dimension_id,
    document_date=excluded.document_date,effective_date=excluded.effective_date,gross_amount=excluded.gross_amount,
    taxable_amount=excluded.taxable_amount,tax_amount=excluded.tax_amount,net_amount=excluded.net_amount,
    status=case when public.financial_documents.status='posted' then 'posted' else 'ready_for_posting' end,updated_at=now()
  returning id into v_fd;
  select je.id into v_existing_journal from public.journal_entries je where je.financial_document_id=v_fd and je.status='posted' limit 1;
  if v_existing_journal is not null then return query select v_fd,v_existing_journal;return;end if;
  v_period:=public.whatsapp_platform_ensure_accounting_period(p_document_date);
  select fiscal_year_id into v_fy from public.accounting_periods where id=v_period;
  v_posting:=public.generate_central_accounts_posting_sequence(p_document_date);
  v_journal_no:='WA-'||replace(v_posting,'POST-','');
  insert into public.journal_entries(journal_no,posting_sequence,accounting_period_id,fiscal_year_id,financial_document_id,entry_date,source_module,source_document_id,source_document_family,division_id,status,posted_at)
  values(v_journal_no,v_posting,v_period,v_fy,v_fd,p_document_date,'whatsapp-platform',p_source_id,p_document_family,v_division,'posted',now()) returning id into v_journal;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if round(coalesce((v_line->>'debit')::numeric,0),2)=0 and round(coalesce((v_line->>'credit')::numeric,0),2)=0 then continue;end if;
    select id into v_account from public.coa_accounts where code=v_line->>'accountCode' and is_active=true and is_posting_allowed=true;
    if v_account is null then raise exception 'WhatsApp accounting ledger % is unavailable',v_line->>'accountCode';end if;
    v_line_no:=v_line_no+1;
    insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo)
    values(v_journal,v_line_no,v_account,v_division,v_counterparty,v_project,v_profit_center,round(coalesce((v_line->>'debit')::numeric,0),2),round(coalesce((v_line->>'credit')::numeric,0),2),left(coalesce(v_line->>'memo',p_source_no,p_document_family),500));
  end loop;
  insert into public.document_postings(financial_document_id,posting_sequence,posting_status,accounting_period_id,journal_entry_id,posted_at)
  values(v_fd,v_posting,'posted',v_period,v_journal,now());
  update public.financial_documents set status='posted',posted_at=now(),updated_at=now() where id=v_fd;
  perform public.log_central_accounts_audit_event('whatsapp_auto_posted',p_event_type,p_source_id::text,v_fd,v_journal,null,v_period,null,
    coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('source_module','whatsapp-platform','source_table',p_source_table,'source_no',p_source_no,'posting_sequence',v_posting,'approval_required',false,'debit_total',v_debit,'credit_total',v_credit));
  return query select v_fd,v_journal;
end;$$;

create or replace function public.whatsapp_platform_post_invoice_event(p_invoice_id uuid)
returns table(financial_document_id uuid,journal_entry_id uuid) language plpgsql security definer set search_path=public as $$
declare
  i public.whatsapp_platform_billing_invoices;v_supplier text;v_place text;v_nature text;v_cgst bigint:=0;v_sgst bigint:=0;v_igst bigint:=0;v_unclassified bigint:=0;v_lines jsonb;
begin
  select * into i from public.whatsapp_platform_billing_invoices where id=p_invoice_id;
  if i.id is null then raise exception 'WhatsApp invoice not found';end if;
  if i.document_environment<>'live' or i.status='void' then return;end if;
  v_supplier:=lpad(regexp_replace(coalesce(i.issuer_snapshot->>'stateCode',''),'\D','','g'),2,'0');
  v_place:=case when coalesce(i.billing_gstin,'')~'^[0-9]{2}' then left(i.billing_gstin,2) when coalesce(i.safe_metadata->>'placeOfSupplyStateCode','')~'^[0-9]{1,2}$' then lpad(i.safe_metadata->>'placeOfSupplyStateCode',2,'0') else null end;
  if v_supplier~'^[0-9]{2}$' and v_place~'^[0-9]{2}$' then
    if v_supplier=v_place then v_nature:='intra_state';v_cgst:=floor(i.gst_paise/2.0);v_sgst:=i.gst_paise-v_cgst;else v_nature:='inter_state';v_igst:=i.gst_paise;end if;
  else v_nature:='unclassified';v_unclassified:=i.gst_paise;end if;
  v_lines:=jsonb_build_array(
    jsonb_build_object('accountCode','1320','debit',i.total_paise/100.0,'credit',0,'memo','Customer receivable - '||i.invoice_number),
    jsonb_build_object('accountCode','4120','debit',0,'credit',i.taxable_base_paise/100.0,'memo','WhatsApp subscription revenue'),
    jsonb_build_object('accountCode','4130','debit',0,'credit',i.gateway_adjustment_paise/100.0,'memo','Gateway fee recovery'),
    jsonb_build_object('accountCode','2210','debit',0,'credit',v_cgst/100.0,'memo','Output CGST'),
    jsonb_build_object('accountCode','2220','debit',0,'credit',v_sgst/100.0,'memo','Output SGST'),
    jsonb_build_object('accountCode','2230','debit',0,'credit',v_igst/100.0,'memo','Output IGST'),
    jsonb_build_object('accountCode','2240','debit',0,'credit',v_unclassified/100.0,'memo','Output GST pending place-of-supply classification'));
  return query select * from public.whatsapp_platform_post_central_journal('WHATSAPP_PLATFORM_INVOICE','whatsapp_platform_billing_invoices',i.id,i.invoice_number,i.tenant_id,i.invoice_date,i.total_paise/100.0,i.taxable_base_paise/100.0,i.gst_paise/100.0,i.total_paise/100.0,'invoice_issued',v_lines,
    jsonb_build_object('provider_invoice_id',i.provider_invoice_id,'provider_payment_id',i.provider_payment_id,'gst_nature',v_nature,'supplier_state_code',v_supplier,'place_of_supply_state_code',v_place,'cgst_paise',v_cgst,'sgst_paise',v_sgst,'igst_paise',v_igst,'unclassified_gst_paise',v_unclassified,'gstin',i.billing_gstin,'currency',i.currency));
end;$$;

create or replace function public.whatsapp_platform_post_payment_event(p_payment_id uuid)
returns table(financial_document_id uuid,journal_entry_id uuid) language plpgsql security definer set search_path=public as $$
declare
  p public.whatsapp_platform_billing_payments;i public.whatsapp_platform_billing_invoices;v_fee bigint;v_tax bigint;v_fee_base bigint;v_clearing bigint;v_lines jsonb;v_result record;v_invoice_fd uuid;v_open_item uuid;
begin
  select * into p from public.whatsapp_platform_billing_payments where id=p_payment_id;
  select * into i from public.whatsapp_platform_billing_invoices where payment_id=p.id;
  if p.id is null or i.id is null then raise exception 'Captured WhatsApp payment or invoice not found';end if;
  if i.document_environment<>'live' or not p.captured or p.status<>'captured' then return;end if;
  v_fee:=least(p.amount_paise,greatest(0,coalesce(p.fee_paise,0)));
  v_tax:=least(v_fee,greatest(0,coalesce(p.tax_paise,0)));
  v_fee_base:=v_fee-v_tax;v_clearing:=p.amount_paise-v_fee;
  v_lines:=jsonb_build_array(
    jsonb_build_object('accountCode','1120','debit',v_clearing/100.0,'credit',0,'memo','Razorpay clearing - '||p.provider_payment_id),
    jsonb_build_object('accountCode','5210','debit',v_fee_base/100.0,'credit',0,'memo','Razorpay fee excluding GST'),
    jsonb_build_object('accountCode','1420','debit',v_tax/100.0,'credit',0,'memo','Input GST on Razorpay fee'),
    jsonb_build_object('accountCode','1320','debit',0,'credit',p.amount_paise/100.0,'memo','Settle customer receivable - '||i.invoice_number));
  select * into v_result from public.whatsapp_platform_post_central_journal('WHATSAPP_PLATFORM_PAYMENT','whatsapp_platform_billing_payments',p.id,p.provider_payment_id,p.tenant_id,coalesce(p.paid_at::date,i.invoice_date),p.amount_paise/100.0,v_fee_base/100.0,v_tax/100.0,p.amount_paise/100.0,'payment_captured',v_lines,
    jsonb_build_object('provider_invoice_id',p.provider_invoice_id,'provider_payment_id',p.provider_payment_id,'payment_method',p.payment_method,'gateway_fee_including_gst_paise',v_fee,'gateway_input_gst_paise',v_tax,'razorpay_clearing_paise',v_clearing,'currency',p.currency));
  select fd.id into v_invoice_fd from public.financial_documents fd where fd.source_module='whatsapp-platform' and fd.source_table='whatsapp_platform_billing_invoices' and fd.source_document_id=i.id and fd.document_family='WHATSAPP_PLATFORM_INVOICE';
  if v_invoice_fd is not null then
    insert into public.receivable_open_items(financial_document_id,division_id,counterparty_dimension_id,due_date,original_amount,open_amount,status)
    select v_invoice_fd,fd.division_id,fd.counterparty_dimension_id,i.invoice_date,i.total_paise/100.0,0,'settled' from public.financial_documents fd where fd.id=v_invoice_fd
    on conflict on constraint receivable_open_items_financial_document_id_key do update set original_amount=excluded.original_amount,open_amount=0,status='settled',updated_at=now()
    returning id into v_open_item;
    insert into public.receivable_allocations(receivable_item_id,applied_document_id,allocation_date,amount,status)
    values(v_open_item,v_result.financial_document_id,coalesce(p.paid_at::date,i.invoice_date),p.amount_paise/100.0,'posted')
    on conflict(receivable_item_id,applied_document_id) where applied_document_id is not null do update set amount=excluded.amount,status='posted',updated_at=now();
  end if;
  return query select v_result.financial_document_id,v_result.journal_entry_id;
end;$$;

create or replace function public.whatsapp_platform_post_credit_note_event(p_credit_note_id uuid)
returns table(financial_document_id uuid,journal_entry_id uuid) language plpgsql security definer set search_path=public as $$
declare
  c public.whatsapp_platform_billing_credit_notes;i public.whatsapp_platform_billing_invoices;v_supplier text;v_place text;v_nature text;v_cgst bigint:=0;v_sgst bigint:=0;v_igst bigint:=0;v_unclassified bigint:=0;v_lines jsonb;
begin
  select * into c from public.whatsapp_platform_billing_credit_notes where id=p_credit_note_id;
  select * into i from public.whatsapp_platform_billing_invoices where id=c.invoice_id;
  if c.id is null or i.id is null then raise exception 'WhatsApp credit note or original invoice not found';end if;
  if c.document_environment<>'live' or c.status='void' then return;end if;
  v_supplier:=lpad(regexp_replace(coalesce(i.issuer_snapshot->>'stateCode',''),'\D','','g'),2,'0');
  v_place:=case when coalesce(i.billing_gstin,'')~'^[0-9]{2}' then left(i.billing_gstin,2) when coalesce(i.safe_metadata->>'placeOfSupplyStateCode','')~'^[0-9]{1,2}$' then lpad(i.safe_metadata->>'placeOfSupplyStateCode',2,'0') else null end;
  if v_supplier~'^[0-9]{2}$' and v_place~'^[0-9]{2}$' then if v_supplier=v_place then v_nature:='intra_state';v_cgst:=floor(c.gst_paise/2.0);v_sgst:=c.gst_paise-v_cgst;else v_nature:='inter_state';v_igst:=c.gst_paise;end if;else v_nature:='unclassified';v_unclassified:=c.gst_paise;end if;
  v_lines:=jsonb_build_array(
    jsonb_build_object('accountCode','4120','debit',c.taxable_base_paise/100.0,'credit',0,'memo','Revenue reversal - '||c.credit_note_number),
    jsonb_build_object('accountCode','4130','debit',c.gateway_adjustment_paise/100.0,'credit',0,'memo','Gateway recovery reversal'),
    jsonb_build_object('accountCode','2210','debit',v_cgst/100.0,'credit',0,'memo','Reverse output CGST'),
    jsonb_build_object('accountCode','2220','debit',v_sgst/100.0,'credit',0,'memo','Reverse output SGST'),
    jsonb_build_object('accountCode','2230','debit',v_igst/100.0,'credit',0,'memo','Reverse output IGST'),
    jsonb_build_object('accountCode','2240','debit',v_unclassified/100.0,'credit',0,'memo','Reverse unclassified output GST'),
    jsonb_build_object('accountCode','2250','debit',0,'credit',c.total_paise/100.0,'memo','Customer refund payable'));
  return query select * from public.whatsapp_platform_post_central_journal('WHATSAPP_PLATFORM_CREDIT_NOTE','whatsapp_platform_billing_credit_notes',c.id,c.credit_note_number,c.tenant_id,c.credit_note_date,c.total_paise/100.0,c.taxable_base_paise/100.0,c.gst_paise/100.0,c.total_paise/100.0,'credit_note_issued',v_lines,
    jsonb_build_object('against_invoice_number',i.invoice_number,'provider_refund_id',c.provider_refund_id,'provider_payment_id',c.provider_payment_id,'gst_nature',v_nature,'supplier_state_code',v_supplier,'place_of_supply_state_code',v_place,'cgst_paise',v_cgst,'sgst_paise',v_sgst,'igst_paise',v_igst,'unclassified_gst_paise',v_unclassified,'currency',c.currency));
end;$$;

create or replace function public.whatsapp_platform_post_refund_event(p_refund_id uuid)
returns table(financial_document_id uuid,journal_entry_id uuid) language plpgsql security definer set search_path=public as $$
declare r public.whatsapp_platform_billing_refunds;c public.whatsapp_platform_billing_credit_notes;v_lines jsonb;
begin
  select * into r from public.whatsapp_platform_billing_refunds where id=p_refund_id;
  select * into c from public.whatsapp_platform_billing_credit_notes where refund_id=r.id;
  if r.id is null or c.id is null then raise exception 'Processed WhatsApp refund or credit note not found';end if;
  if c.document_environment<>'live' or r.status<>'processed' then return;end if;
  v_lines:=jsonb_build_array(
    jsonb_build_object('accountCode','2250','debit',r.amount_paise/100.0,'credit',0,'memo','Settle customer refund payable'),
    jsonb_build_object('accountCode','1120','debit',0,'credit',r.amount_paise/100.0,'memo','Razorpay refund - '||r.provider_refund_id));
  return query select * from public.whatsapp_platform_post_central_journal('WHATSAPP_PLATFORM_REFUND','whatsapp_platform_billing_refunds',r.id,r.provider_refund_id,r.tenant_id,coalesce(r.processed_at::date,c.credit_note_date),r.amount_paise/100.0,0,0,r.amount_paise/100.0,'refund_processed',v_lines,
    jsonb_build_object('credit_note_number',c.credit_note_number,'provider_refund_id',r.provider_refund_id,'provider_payment_id',r.provider_payment_id,'reason',r.reason,'currency',r.currency));
end;$$;

create or replace function public.whatsapp_platform_process_accounting_event(p_event_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare e public.whatsapp_platform_central_accounting_events;v_result record;
begin
  select * into e from public.whatsapp_platform_central_accounting_events where id=p_event_id for update;
  if e.id is null or e.status in ('posted','ignored') then return;end if;
  update public.whatsapp_platform_central_accounting_events set status='processing',attempt_count=attempt_count+1,last_attempt_at=now(),last_error=null,updated_at=now() where id=e.id;
  if e.document_environment<>'live' then
    update public.whatsapp_platform_central_accounting_events set status='ignored',posted_at=now(),updated_at=now() where id=e.id;return;
  end if;
  if e.event_type='invoice_issued' then select * into v_result from public.whatsapp_platform_post_invoice_event(e.source_document_id);
  elsif e.event_type='payment_captured' then select * into v_result from public.whatsapp_platform_post_payment_event(e.source_document_id);
  elsif e.event_type='credit_note_issued' then select * into v_result from public.whatsapp_platform_post_credit_note_event(e.source_document_id);
  elsif e.event_type='refund_processed' then select * into v_result from public.whatsapp_platform_post_refund_event(e.source_document_id);
  else raise exception 'Unsupported WhatsApp accounting event %',e.event_type;end if;
  if v_result.financial_document_id is null or v_result.journal_entry_id is null then raise exception 'WhatsApp accounting event produced no posted journal';end if;
  update public.whatsapp_platform_central_accounting_events set status='posted',financial_document_id=v_result.financial_document_id,journal_entry_id=v_result.journal_entry_id,posted_at=now(),last_error=null,updated_at=now() where id=e.id;
exception when others then
  update public.whatsapp_platform_central_accounting_events set status='failed',last_error=left(sqlerrm,1000),updated_at=now() where id=p_event_id;
end;$$;

create or replace function public.whatsapp_platform_enqueue_accounting_event(p_event_type text,p_source_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_tenant uuid;v_table text;v_no text;v_environment text;v_amount bigint;v_occurred timestamptz;v_evidence jsonb;
begin
  if p_event_type='invoice_issued' then
    select tenant_id,'whatsapp_platform_billing_invoices',invoice_number,document_environment,total_paise,issued_at,jsonb_build_object('invoice_number',invoice_number,'provider_invoice_id',provider_invoice_id,'provider_payment_id',provider_payment_id) into v_tenant,v_table,v_no,v_environment,v_amount,v_occurred,v_evidence from public.whatsapp_platform_billing_invoices where id=p_source_id;
  elsif p_event_type='payment_captured' then
    select p.tenant_id,'whatsapp_platform_billing_payments',p.provider_payment_id,i.document_environment,p.amount_paise,coalesce(p.paid_at,p.created_at),jsonb_build_object('provider_invoice_id',p.provider_invoice_id,'provider_payment_id',p.provider_payment_id,'payment_method',p.payment_method,'fee_paise',p.fee_paise,'tax_paise',p.tax_paise) into v_tenant,v_table,v_no,v_environment,v_amount,v_occurred,v_evidence from public.whatsapp_platform_billing_payments p join public.whatsapp_platform_billing_invoices i on i.payment_id=p.id where p.id=p_source_id and p.captured=true;
  elsif p_event_type='credit_note_issued' then
    select tenant_id,'whatsapp_platform_billing_credit_notes',credit_note_number,document_environment,total_paise,issued_at,jsonb_build_object('credit_note_number',credit_note_number,'provider_refund_id',provider_refund_id,'provider_payment_id',provider_payment_id) into v_tenant,v_table,v_no,v_environment,v_amount,v_occurred,v_evidence from public.whatsapp_platform_billing_credit_notes where id=p_source_id;
  elsif p_event_type='refund_processed' then
    select r.tenant_id,'whatsapp_platform_billing_refunds',r.provider_refund_id,c.document_environment,r.amount_paise,coalesce(r.processed_at,r.created_at),jsonb_build_object('provider_refund_id',r.provider_refund_id,'provider_payment_id',r.provider_payment_id,'credit_note_number',c.credit_note_number) into v_tenant,v_table,v_no,v_environment,v_amount,v_occurred,v_evidence from public.whatsapp_platform_billing_refunds r join public.whatsapp_platform_billing_credit_notes c on c.refund_id=r.id where r.id=p_source_id and r.status='processed';
  else raise exception 'Unsupported WhatsApp accounting event %',p_event_type;end if;
  if v_tenant is null then return null;end if;
  insert into public.whatsapp_platform_central_accounting_events(event_key,event_type,tenant_id,source_table,source_document_id,source_document_no,document_environment,amount_paise,occurred_at,evidence)
  values(p_event_type||':'||p_source_id::text,p_event_type,v_tenant,v_table,p_source_id,v_no,v_environment,v_amount,v_occurred,coalesce(v_evidence,'{}'::jsonb))
  on conflict(event_key) do update set source_document_no=excluded.source_document_no,evidence=excluded.evidence,updated_at=now(),status=case when public.whatsapp_platform_central_accounting_events.status='posted' then 'posted' else 'pending' end,last_error=case when public.whatsapp_platform_central_accounting_events.status='posted' then public.whatsapp_platform_central_accounting_events.last_error else null end
  returning id into v_id;
  perform public.whatsapp_platform_process_accounting_event(v_id);
  return v_id;
end;$$;

create or replace function public.trg_whatsapp_platform_enqueue_invoice_accounting()
returns trigger language plpgsql security definer set search_path=public as $$begin
  perform public.whatsapp_platform_enqueue_accounting_event('invoice_issued',new.id);
  perform public.whatsapp_platform_enqueue_accounting_event('payment_captured',new.payment_id);
  return new;
end;$$;
drop trigger if exists trg_whatsapp_platform_invoice_central_accounting on public.whatsapp_platform_billing_invoices;
create trigger trg_whatsapp_platform_invoice_central_accounting after insert on public.whatsapp_platform_billing_invoices for each row execute function public.trg_whatsapp_platform_enqueue_invoice_accounting();

create or replace function public.trg_whatsapp_platform_enqueue_credit_note_accounting()
returns trigger language plpgsql security definer set search_path=public as $$begin
  perform public.whatsapp_platform_enqueue_accounting_event('credit_note_issued',new.id);
  perform public.whatsapp_platform_enqueue_accounting_event('refund_processed',new.refund_id);
  return new;
end;$$;
drop trigger if exists trg_whatsapp_platform_credit_note_central_accounting on public.whatsapp_platform_billing_credit_notes;
create trigger trg_whatsapp_platform_credit_note_central_accounting after insert on public.whatsapp_platform_billing_credit_notes for each row execute function public.trg_whatsapp_platform_enqueue_credit_note_accounting();

create or replace function public.whatsapp_platform_retry_accounting_events()
returns void language plpgsql security definer set search_path=public as $$declare e record;begin
  for e in select id from public.whatsapp_platform_central_accounting_events where status in ('pending','failed') and attempt_count<25 and (last_attempt_at is null or last_attempt_at<now()-interval '2 minutes') order by occurred_at for update skip locked limit 50 loop
    perform public.whatsapp_platform_process_accounting_event(e.id);
  end loop;
end;$$;

do $$begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='whatsapp-platform-central-accounting-retry') then perform cron.unschedule('whatsapp-platform-central-accounting-retry');end if;
    perform cron.schedule('whatsapp-platform-central-accounting-retry','*/5 * * * *','select public.whatsapp_platform_retry_accounting_events();');
  end if;
end;$$;

create or replace view public.whatsapp_platform_gst_register as
with documents as (
  select i.id,i.tenant_id,'invoice'::text document_type,i.invoice_number document_number,i.invoice_date document_date,i.billing_name,i.billing_gstin,
    lpad(regexp_replace(coalesce(i.issuer_snapshot->>'stateCode',''),'\D','','g'),2,'0') supplier_state_code,
    case when coalesce(i.billing_gstin,'')~'^[0-9]{2}' then left(i.billing_gstin,2) when coalesce(i.safe_metadata->>'placeOfSupplyStateCode','')~'^[0-9]{1,2}$' then lpad(i.safe_metadata->>'placeOfSupplyStateCode',2,'0') else null end place_of_supply_state_code,
    i.taxable_base_paise,i.gst_paise,i.total_paise,i.provider_invoice_id,i.provider_payment_id,null::text provider_refund_id,1 direction
  from public.whatsapp_platform_billing_invoices i where i.document_environment='live' and i.status<>'void'
  union all
  select c.id,c.tenant_id,'credit_note',c.credit_note_number,c.credit_note_date,i.billing_name,i.billing_gstin,
    lpad(regexp_replace(coalesce(i.issuer_snapshot->>'stateCode',''),'\D','','g'),2,'0'),
    case when coalesce(i.billing_gstin,'')~'^[0-9]{2}' then left(i.billing_gstin,2) when coalesce(i.safe_metadata->>'placeOfSupplyStateCode','')~'^[0-9]{1,2}$' then lpad(i.safe_metadata->>'placeOfSupplyStateCode',2,'0') else null end,
    c.taxable_base_paise,c.gst_paise,c.total_paise,c.provider_invoice_id,c.provider_payment_id,c.provider_refund_id,-1
  from public.whatsapp_platform_billing_credit_notes c join public.whatsapp_platform_billing_invoices i on i.id=c.invoice_id where c.document_environment='live' and c.status<>'void'
)
select d.id,d.tenant_id,d.document_type,d.document_number,d.document_date,d.billing_name,d.billing_gstin,d.supplier_state_code,d.place_of_supply_state_code,
  case when d.supplier_state_code~'^[0-9]{2}$' and d.place_of_supply_state_code~'^[0-9]{2}$' then case when d.supplier_state_code=d.place_of_supply_state_code then 'intra_state' else 'inter_state' end else 'unclassified' end gst_nature,
  round(d.direction*d.taxable_base_paise/100.0,2) taxable_amount,
  case when d.supplier_state_code=d.place_of_supply_state_code then round(d.direction*floor(d.gst_paise/2.0)/100.0,2) else 0::numeric end cgst_amount,
  case when d.supplier_state_code=d.place_of_supply_state_code then round(d.direction*(d.gst_paise-floor(d.gst_paise/2.0))/100.0,2) else 0::numeric end sgst_amount,
  case when d.supplier_state_code<>d.place_of_supply_state_code and d.place_of_supply_state_code is not null then round(d.direction*d.gst_paise/100.0,2) else 0::numeric end igst_amount,
  case when d.place_of_supply_state_code is null then round(d.direction*d.gst_paise/100.0,2) else 0::numeric end unclassified_gst_amount,
  round(d.direction*d.total_paise/100.0,2) document_total,d.provider_invoice_id,d.provider_payment_id,d.provider_refund_id
from documents d;
revoke all on public.whatsapp_platform_gst_register from public,anon;
grant select on public.whatsapp_platform_gst_register to authenticated,service_role;

revoke all on function public.whatsapp_platform_ensure_accounting_period(date) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_post_central_journal(text,text,uuid,text,uuid,date,numeric,numeric,numeric,numeric,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_post_invoice_event(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_post_payment_event(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_post_credit_note_event(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_post_refund_event(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_process_accounting_event(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_enqueue_accounting_event(text,uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_retry_accounting_events() from public,anon,authenticated;
grant execute on function public.whatsapp_platform_enqueue_accounting_event(text,uuid) to service_role;
grant execute on function public.whatsapp_platform_retry_accounting_events() to service_role;

-- Backfill every retained live WhatsApp billing document into Central Accounts.
do $$declare r record;begin
  for r in select id,payment_id from public.whatsapp_platform_billing_invoices where document_environment='live' and status<>'void' order by invoice_date,created_at loop
    perform public.whatsapp_platform_enqueue_accounting_event('invoice_issued',r.id);
    perform public.whatsapp_platform_enqueue_accounting_event('payment_captured',r.payment_id);
  end loop;
  for r in select id,refund_id from public.whatsapp_platform_billing_credit_notes where document_environment='live' and status<>'void' order by credit_note_date,created_at loop
    perform public.whatsapp_platform_enqueue_accounting_event('credit_note_issued',r.id);
    perform public.whatsapp_platform_enqueue_accounting_event('refund_processed',r.refund_id);
  end loop;
end;$$;

-- Deployment assertions: every live source event must be posted and balanced.
do $$declare v_failures text;begin
  if exists(select 1 from public.whatsapp_platform_central_accounting_events where document_environment='live' and status<>'posted') then
    select string_agg(event_type||':'||source_document_no||' -> '||coalesce(last_error,status),'; ' order by occurred_at)
      into v_failures from public.whatsapp_platform_central_accounting_events where document_environment='live' and status<>'posted';
    raise exception 'One or more live WhatsApp accounting events failed to post: %',v_failures;
  end if;
  if exists(
    select je.id from public.journal_entries je join public.financial_documents fd on fd.id=je.financial_document_id
    join public.journal_lines jl on jl.journal_entry_id=je.id
    where fd.source_module='whatsapp-platform' and je.status='posted'
    group by je.id having round(sum(jl.debit_amount),2)<>round(sum(jl.credit_amount),2)
  ) then raise exception 'A WhatsApp Central Accounts journal is unbalanced';end if;
  if exists(select 1 from public.posting_queue pq join public.financial_documents fd on fd.id=pq.financial_document_id where fd.source_module='whatsapp-platform') then
    raise exception 'WhatsApp accounting must not require an approval/posting queue';
  end if;
end;$$;

comment on table public.whatsapp_platform_central_accounting_events is 'Retryable, idempotent outbox for automatic Central Accounts posting of live WhatsApp invoices, captured payments, credit notes and processed refunds.';
comment on view public.whatsapp_platform_gst_register is 'Statutory WhatsApp outward-supply register with invoice/credit-note signs and CGST/SGST/IGST classification for GST reporting.';
notify pgrst,'reload schema';
