-- Hospital Projects: advanced client billing, credit notes and Central Accounts bridge.

alter table public.hospital_invoices
  add column if not exists reference_number text,
  add column if not exists place_of_supply text,
  add column if not exists payment_terms text,
  add column if not exists notes text,
  add column if not exists round_off numeric(16,2) not null default 0;

alter table public.hospital_credit_notes
  add column if not exists taxable_amount numeric(16,2) not null default 0,
  add column if not exists tax_rate numeric(6,3) not null default 0,
  add column if not exists tax_amount numeric(16,2) not null default 0,
  add column if not exists notes text;

update public.hospital_credit_notes
set taxable_amount = amount, tax_rate = 0, tax_amount = 0
where taxable_amount = 0 and amount > 0;

create table if not exists public.hospital_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.hospital_invoices(id) on delete cascade,
  line_no integer not null,
  description text not null,
  hsn_sac text,
  quantity numeric(16,3) not null default 1 check (quantity > 0),
  unit text not null default 'Nos',
  unit_price numeric(16,2) not null default 0 check (unit_price >= 0),
  discount_amount numeric(16,2) not null default 0 check (discount_amount >= 0),
  gst_rate numeric(6,3) not null default 18 check (gst_rate between 0 and 100),
  gst_included boolean not null default false,
  taxable_amount numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0,
  total_amount numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_id, line_no)
);

create index if not exists idx_hospital_invoice_lines_invoice on public.hospital_invoice_lines(invoice_id, line_no);
alter table public.hospital_invoice_lines enable row level security;
drop policy if exists hospital_invoice_lines_staff_all on public.hospital_invoice_lines;
create policy hospital_invoice_lines_staff_all on public.hospital_invoice_lines for all to authenticated
using (public.has_permission('hospital-projects','view') and exists(select 1 from public.hospital_invoices i where i.id=invoice_id and public.hospital_can_access_project(i.project_id)))
with check ((public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit')) and exists(select 1 from public.hospital_invoices i where i.id=invoice_id and public.hospital_can_access_project(i.project_id)));
drop policy if exists hospital_invoice_lines_client_select on public.hospital_invoice_lines;
create policy hospital_invoice_lines_client_select on public.hospital_invoice_lines for select to authenticated
using (exists(select 1 from public.hospital_invoices i join public.hospital_clients c on c.id=i.client_id where i.id=invoice_id and c.auth_user_id=(select auth.uid())));
grant select,insert,update,delete on public.hospital_invoice_lines to authenticated;

create or replace function public.hospital_save_invoice(
  p_invoice_id uuid, p_project_id uuid, p_invoice_type text, p_issue_date date, p_due_date date,
  p_reference_number text, p_place_of_supply text, p_payment_terms text, p_notes text,
  p_round_off numeric, p_lines jsonb, p_issue boolean default false
) returns public.hospital_invoices language plpgsql security definer set search_path=public as $$
declare v_project public.hospital_projects; v_invoice public.hospital_invoices; v_line jsonb; v_no integer:=0;
  v_qty numeric; v_rate numeric; v_discount numeric; v_gst numeric; v_entered numeric; v_taxable numeric; v_tax numeric;
  v_taxable_total numeric:=0; v_tax_total numeric:=0; v_total numeric:=0;
begin
  if not public.has_permission('hospital-projects',case when p_invoice_id is null then 'create' else 'edit' end) then raise exception 'Hospital billing permission required'; end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_project.id is null then raise exception 'Hospital project not found'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Add at least one invoice line'; end if;
  if p_invoice_id is null then
    insert into public.hospital_invoices(division_id,project_id,client_id,invoice_number,invoice_type,issue_date,due_date,description,taxable_amount,tax_rate,tax_amount,total_amount,status,accounts_status,reference_number,place_of_supply,payment_terms,notes,round_off)
    values(v_project.division_id,v_project.id,v_project.client_id,public.next_central_document_number('invoice',coalesce(p_issue_date,current_date)),coalesce(p_invoice_type,'progress'),coalesce(p_issue_date,current_date),p_due_date,'Itemized client invoice',0,0,0,0,'draft','unposted',nullif(btrim(p_reference_number),''),nullif(btrim(p_place_of_supply),''),nullif(btrim(p_payment_terms),''),nullif(btrim(p_notes),''),coalesce(p_round_off,0)) returning * into v_invoice;
  else
    select * into v_invoice from public.hospital_invoices where id=p_invoice_id and project_id=p_project_id for update;
    if v_invoice.id is null then raise exception 'Invoice not found'; end if;
    if v_invoice.status<>'draft' or v_invoice.accounts_status<>'unposted' or v_invoice.paid_amount<>0 or v_invoice.credited_amount<>0 then raise exception 'Only an unpaid, unposted draft invoice can be edited'; end if;
    update public.hospital_invoices set invoice_type=coalesce(p_invoice_type,'progress'),issue_date=coalesce(p_issue_date,current_date),due_date=p_due_date,reference_number=nullif(btrim(p_reference_number),''),place_of_supply=nullif(btrim(p_place_of_supply),''),payment_terms=nullif(btrim(p_payment_terms),''),notes=nullif(btrim(p_notes),''),round_off=coalesce(p_round_off,0),updated_at=now() where id=v_invoice.id;
    delete from public.hospital_invoice_lines where invoice_id=v_invoice.id;
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no:=v_no+1; v_qty:=coalesce((v_line->>'quantity')::numeric,0); v_rate:=coalesce((v_line->>'unit_price')::numeric,0); v_discount:=coalesce((v_line->>'discount_amount')::numeric,0); v_gst:=coalesce((v_line->>'gst_rate')::numeric,0);
    if v_qty<=0 or v_rate<0 or v_discount<0 or v_discount>v_qty*v_rate or v_gst<0 or v_gst>100 then raise exception 'Invalid invoice line values'; end if;
    v_entered:=round(v_qty*v_rate-v_discount,2);
    if coalesce((v_line->>'gst_included')::boolean,false) and v_gst>0 then v_taxable:=round(v_entered*100/(100+v_gst),2); v_tax:=v_entered-v_taxable; else v_taxable:=v_entered; v_tax:=round(v_taxable*v_gst/100,2); end if;
    insert into public.hospital_invoice_lines(invoice_id,line_no,description,hsn_sac,quantity,unit,unit_price,discount_amount,gst_rate,gst_included,taxable_amount,tax_amount,total_amount)
    values(v_invoice.id,v_no,btrim(v_line->>'description'),nullif(btrim(v_line->>'hsn_sac'),''),v_qty,coalesce(nullif(btrim(v_line->>'unit'),''),'Nos'),v_rate,v_discount,v_gst,coalesce((v_line->>'gst_included')::boolean,false),v_taxable,v_tax,v_taxable+v_tax);
    v_taxable_total:=v_taxable_total+v_taxable; v_tax_total:=v_tax_total+v_tax;
  end loop;
  v_total:=round(v_taxable_total+v_tax_total+coalesce(p_round_off,0),2);
  update public.hospital_invoices set description=(select string_agg(description,', ' order by line_no) from public.hospital_invoice_lines where invoice_id=v_invoice.id),taxable_amount=v_taxable_total,tax_rate=0,tax_amount=v_tax_total,total_amount=v_total,status=case when p_issue then 'issued' else 'draft' end,accounts_status=case when p_issue then 'ready' else 'unposted' end,updated_at=now() where id=v_invoice.id returning * into v_invoice;
  return v_invoice;
end $$;

create or replace function public.hospital_save_credit_note(
  p_credit_note_id uuid, p_invoice_id uuid, p_credit_note_date date, p_reason text,
  p_taxable_amount numeric, p_tax_rate numeric, p_notes text, p_approve boolean default false
) returns public.hospital_credit_notes language plpgsql security definer set search_path=public as $$
declare v_invoice public.hospital_invoices; v_note public.hospital_credit_notes; v_tax numeric; v_total numeric; v_old numeric:=0; v_available numeric;
begin
  if not public.has_permission('hospital-projects',case when p_credit_note_id is null then 'create' else 'edit' end) then raise exception 'Hospital credit-note permission required'; end if;
  select * into v_invoice from public.hospital_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  if coalesce(p_taxable_amount,0)<=0 or coalesce(p_tax_rate,0)<0 or coalesce(p_tax_rate,0)>100 then raise exception 'Enter a valid credit amount and GST rate'; end if;
  v_tax:=round(p_taxable_amount*coalesce(p_tax_rate,0)/100,2); v_total:=p_taxable_amount+v_tax;
  if p_credit_note_id is not null then
    select * into v_note from public.hospital_credit_notes where id=p_credit_note_id and invoice_id=p_invoice_id for update;
    if v_note.id is null or v_note.status<>'draft' or v_note.accounts_status<>'unposted' then raise exception 'Only an unposted draft credit note can be edited'; end if;
    v_old:=v_note.amount;
  end if;
  v_available:=v_invoice.total_amount-v_invoice.credited_amount+v_old;
  if v_total>v_available then raise exception 'Credit amount exceeds available invoice balance'; end if;
  if p_credit_note_id is null then
    insert into public.hospital_credit_notes(division_id,invoice_id,project_id,client_id,credit_note_number,credit_note_date,reason,amount,taxable_amount,tax_rate,tax_amount,notes,status,accounts_status)
    values(v_invoice.division_id,v_invoice.id,v_invoice.project_id,v_invoice.client_id,public.next_central_document_number('credit_note',coalesce(p_credit_note_date,current_date)),coalesce(p_credit_note_date,current_date),btrim(p_reason),v_total,p_taxable_amount,p_tax_rate,v_tax,nullif(btrim(p_notes),''),case when p_approve then 'approved' else 'draft' end,case when p_approve then 'ready' else 'unposted' end) returning * into v_note;
  else
    update public.hospital_credit_notes set credit_note_date=coalesce(p_credit_note_date,current_date),reason=btrim(p_reason),amount=v_total,taxable_amount=p_taxable_amount,tax_rate=p_tax_rate,tax_amount=v_tax,notes=nullif(btrim(p_notes),''),status=case when p_approve then 'approved' else 'draft' end,accounts_status=case when p_approve then 'ready' else 'unposted' end,approved_by=case when p_approve then public.current_app_user_id() else null end,approved_at=case when p_approve then now() else null end,updated_at=now() where id=v_note.id returning * into v_note;
  end if;
  if p_approve then update public.hospital_invoices set credited_amount=credited_amount+v_total-v_old,updated_at=now() where id=v_invoice.id; end if;
  return v_note;
end $$;

create or replace function public.bridge_hospital_document_to_central_accounts(p_entity_type text,p_entity_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_doc record; v_family text; v_table text; v_fd uuid; v_queue uuid; v_counterparty uuid; v_projectdim uuid; v_profit uuid; v_actor uuid:=public.current_app_user_id();
begin
  if p_entity_type='invoice' then
    select i.id,i.invoice_number as document_no,i.issue_date as document_date,i.due_date,i.division_id,i.client_id,i.project_id,i.taxable_amount,i.tax_amount,i.total_amount,i.status,i.accounts_status,c.hospital_name,p.project_code,p.title into v_doc from public.hospital_invoices i join public.hospital_clients c on c.id=i.client_id join public.hospital_projects p on p.id=i.project_id where i.id=p_entity_id;
    v_family:='HOSPITAL_CLIENT_INVOICE';v_table:='hospital_invoices'; if v_doc.status<>'issued' or v_doc.accounts_status not in ('ready','posted') then return null; end if;
  elsif p_entity_type='credit_note' then
    select n.id,n.credit_note_number as document_no,n.credit_note_date as document_date,null::date as due_date,n.division_id,n.client_id,n.project_id,n.taxable_amount,n.tax_amount,n.amount as total_amount,n.status,n.accounts_status,c.hospital_name,p.project_code,p.title into v_doc from public.hospital_credit_notes n join public.hospital_clients c on c.id=n.client_id join public.hospital_projects p on p.id=n.project_id where n.id=p_entity_id;
    v_family:='HOSPITAL_CREDIT_NOTE';v_table:='hospital_credit_notes'; if v_doc.status<>'approved' or v_doc.accounts_status not in ('ready','posted') then return null; end if;
  else raise exception 'Unsupported Hospital accounting document'; end if;
  v_counterparty:=public.ensure_reporting_dimension('counterparty','HOSPITAL_CLIENT:'||v_doc.client_id::text,v_doc.hospital_name);
  v_projectdim:=public.ensure_reporting_dimension('project',v_doc.project_code,v_doc.title);
  v_profit:=public.ensure_reporting_dimension('profit_center','HOSPITAL_PROJECTS','Hospital Projects');
  insert into public.financial_documents(document_family,source_module,source_table,source_document_id,source_document_no,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,status,document_date,effective_date,gross_amount,taxable_amount,tax_amount,net_amount,finance_approved_by,finance_approved_at)
  values(v_family,'hospital-projects',v_table,v_doc.id,v_doc.document_no,v_doc.division_id,v_counterparty,v_projectdim,v_profit,'ready_for_posting',v_doc.document_date,v_doc.document_date,v_doc.total_amount,v_doc.taxable_amount,v_doc.tax_amount,v_doc.total_amount,v_actor,now())
  on conflict(source_module,source_table,source_document_id,document_family) do update set source_document_no=excluded.source_document_no,status=case when public.financial_documents.status='posted' then 'posted' else 'ready_for_posting' end,document_date=excluded.document_date,effective_date=excluded.effective_date,gross_amount=excluded.gross_amount,taxable_amount=excluded.taxable_amount,tax_amount=excluded.tax_amount,net_amount=excluded.net_amount,updated_at=now() returning id into v_fd;
  insert into public.posting_queue(financial_document_id,queue_status,requested_by) values(v_fd,'ready_to_post',v_actor) on conflict(financial_document_id) do update set queue_status=case when public.posting_queue.queue_status='posted' then 'posted' else 'ready_to_post' end,requested_by=excluded.requested_by,last_error=null,updated_at=now() returning id into v_queue;
  perform public.log_central_accounts_audit_event('hospital_document_staged',v_family,v_doc.id::text,v_fd,null,v_queue,null,v_actor,jsonb_build_object('source_module','hospital-projects','source_table',v_table,'source_document_no',v_doc.document_no,'project_code',v_doc.project_code));
  return v_fd;
end $$;

create or replace function public.trg_bridge_hospital_billing_to_central_accounts() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='hospital_invoices' and new.status='issued' and new.accounts_status='ready' then perform public.bridge_hospital_document_to_central_accounts('invoice',new.id);
  elsif tg_table_name='hospital_credit_notes' and new.status='approved' and new.accounts_status='ready' then perform public.bridge_hospital_document_to_central_accounts('credit_note',new.id); end if;
  return new;
end $$;
drop trigger if exists trg_hospital_invoice_accounts_bridge on public.hospital_invoices;
create trigger trg_hospital_invoice_accounts_bridge after insert or update of status,accounts_status,total_amount on public.hospital_invoices for each row execute function public.trg_bridge_hospital_billing_to_central_accounts();
drop trigger if exists trg_hospital_credit_accounts_bridge on public.hospital_credit_notes;
create trigger trg_hospital_credit_accounts_bridge after insert or update of status,accounts_status,amount on public.hospital_credit_notes for each row execute function public.trg_bridge_hospital_billing_to_central_accounts();

create or replace function public.execute_central_accounts_hospital_posting(p_financial_document_id uuid)
returns table(result_financial_document_id uuid,result_posting_id uuid,result_posting_sequence text,result_journal_entry_id uuid,result_posting_status text)
language plpgsql security definer set search_path=public as $$
declare v_fd public.financial_documents; v_queue uuid; v_period uuid; v_fy uuid; v_posting uuid; v_sequence text; v_journal uuid;
  v_actor uuid:=public.current_app_user_id(); v_ar uuid; v_revenue uuid; v_gst uuid; v_due date; v_invoice_fd uuid; v_open uuid; v_new_open numeric;
begin
  if not (public.has_permission('central-accounts-posting-queue','post') or public.can_emergency_post_central_accounts()) then raise exception 'Not authorized to execute Central Accounts posting'; end if;
  select * into v_fd from public.financial_documents where id=p_financial_document_id and source_module='hospital-projects' and document_family in ('HOSPITAL_CLIENT_INVOICE','HOSPITAL_CREDIT_NOTE') for update;
  if v_fd.id is null then raise exception 'Hospital financial document not found'; end if;
  if exists(select 1 from public.document_postings where financial_document_id=v_fd.id and posting_status='posted') then raise exception 'Financial document already posted'; end if;
  select id into v_queue from public.posting_queue where financial_document_id=v_fd.id limit 1;
  if v_queue is null then raise exception 'Posting queue record not found'; end if;
  v_period:=public.get_central_accounts_period_id(coalesce(v_fd.effective_date,v_fd.document_date));
  if v_period is null then raise exception 'No open accounting period found'; end if;
  select fiscal_year_id into v_fy from public.accounting_periods where id=v_period;
  select id into v_ar from public.coa_accounts where code='1310' limit 1;
  select id into v_revenue from public.coa_accounts where code='4110' limit 1;
  select id into v_gst from public.coa_accounts where code='2200' limit 1;
  if v_ar is null or v_revenue is null or (v_fd.tax_amount<>0 and v_gst is null) then raise exception 'Required Hospital posting accounts not found'; end if;
  update public.posting_queue set queue_status='processing',queue_attempt=queue_attempt+1,processed_by=v_actor,processed_at=now(),last_error=null,updated_at=now() where id=v_queue;
  v_sequence:=public.generate_central_accounts_posting_sequence(coalesce(v_fd.effective_date,v_fd.document_date));
  insert into public.document_postings(financial_document_id,posting_sequence,posting_status,accounting_period_id,posted_by,posted_at) values(v_fd.id,v_sequence,'processing',v_period,v_actor,now()) returning id into v_posting;
  insert into public.journal_entries(journal_no,posting_sequence,accounting_period_id,fiscal_year_id,financial_document_id,entry_date,source_module,source_document_id,source_document_family,division_id,status,created_by,posted_by,posted_at)
  values(v_sequence,v_sequence,v_period,v_fy,v_fd.id,coalesce(v_fd.effective_date,v_fd.document_date),'hospital-projects',v_fd.source_document_id,v_fd.document_family,v_fd.division_id,'posted',v_actor,v_actor,now()) returning id into v_journal;
  if v_fd.document_family='HOSPITAL_CLIENT_INVOICE' then
    insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo) values
      (v_journal,1,v_ar,v_fd.division_id,v_fd.counterparty_dimension_id,v_fd.project_dimension_id,v_fd.profit_center_dimension_id,v_fd.gross_amount,0,'Hospital project client receivable'),
      (v_journal,2,v_revenue,v_fd.division_id,v_fd.counterparty_dimension_id,v_fd.project_dimension_id,v_fd.profit_center_dimension_id,0,v_fd.gross_amount-v_fd.tax_amount,'Hospital project revenue and round-off');
    if v_fd.tax_amount<>0 then insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo) values(v_journal,3,v_gst,v_fd.division_id,v_fd.counterparty_dimension_id,v_fd.project_dimension_id,v_fd.profit_center_dimension_id,0,v_fd.tax_amount,'Hospital project GST output'); end if;
    select due_date into v_due from public.hospital_invoices where id=v_fd.source_document_id;
    insert into public.receivable_open_items(financial_document_id,division_id,counterparty_dimension_id,due_date,original_amount,open_amount,status) values(v_fd.id,v_fd.division_id,v_fd.counterparty_dimension_id,v_due,v_fd.gross_amount,v_fd.gross_amount,'open')
    on conflict(financial_document_id) do update set due_date=excluded.due_date,original_amount=excluded.original_amount,open_amount=excluded.open_amount,status='open',updated_at=now();
    update public.hospital_invoices set accounts_status='posted',updated_at=now() where id=v_fd.source_document_id;
  else
    insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo) values
      (v_journal,1,v_revenue,v_fd.division_id,v_fd.counterparty_dimension_id,v_fd.project_dimension_id,v_fd.profit_center_dimension_id,v_fd.taxable_amount,0,'Hospital project credit-note revenue reversal'),
      (v_journal,2,v_ar,v_fd.division_id,v_fd.counterparty_dimension_id,v_fd.project_dimension_id,v_fd.profit_center_dimension_id,0,v_fd.gross_amount,'Hospital project receivable reduction');
    if v_fd.tax_amount<>0 then insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo) values(v_journal,3,v_gst,v_fd.division_id,v_fd.counterparty_dimension_id,v_fd.project_dimension_id,v_fd.profit_center_dimension_id,v_fd.tax_amount,0,'Hospital project GST reversal'); end if;
    select i_fd.id into v_invoice_fd from public.hospital_credit_notes n join public.financial_documents i_fd on i_fd.source_module='hospital-projects' and i_fd.source_table='hospital_invoices' and i_fd.source_document_id=n.invoice_id and i_fd.document_family='HOSPITAL_CLIENT_INVOICE' where n.id=v_fd.source_document_id;
    select id,greatest(open_amount-v_fd.gross_amount,0) into v_open,v_new_open from public.receivable_open_items where financial_document_id=v_invoice_fd for update;
    if v_open is not null then
      update public.receivable_open_items set open_amount=v_new_open,status=case when v_new_open=0 then 'settled' else 'partially_settled' end,updated_at=now() where id=v_open;
      insert into public.receivable_allocations(receivable_item_id,applied_document_id,allocation_date,amount,status) values(v_open,v_fd.id,v_fd.document_date,v_fd.gross_amount,'posted');
    end if;
    update public.hospital_credit_notes set accounts_status='posted',updated_at=now() where id=v_fd.source_document_id;
  end if;
  update public.document_postings set posting_status='posted',journal_entry_id=v_journal,posted_by=v_actor,posted_at=now(),updated_at=now() where id=v_posting;
  update public.posting_queue set queue_status='posted',processed_by=v_actor,processed_at=now(),last_error=null,updated_at=now() where id=v_queue;
  update public.financial_documents set status='posted',posted_by=v_actor,posted_at=now(),updated_at=now() where id=v_fd.id;
  perform public.log_central_accounts_audit_event('hospital_document_posted',v_fd.document_family,v_fd.source_document_id::text,v_fd.id,v_journal,v_queue,v_period,v_actor,jsonb_build_object('source_module','hospital-projects','source_document_no',v_fd.source_document_no,'posting_sequence',v_sequence,'amount',v_fd.gross_amount));
  return query select v_fd.id,v_posting,v_sequence,v_journal,'posted'::text;
end $$;

create or replace function public.hospital_delete_billing_document(p_entity_type text,p_entity_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_status text; v_accounts text; v_paid numeric:=0; v_credited numeric:=0;
begin
  if not public.has_permission('hospital-projects','delete') then raise exception 'Hospital billing delete permission required'; end if;
  if p_entity_type='invoice' then
    select status,accounts_status,paid_amount,credited_amount into v_status,v_accounts,v_paid,v_credited from public.hospital_invoices where id=p_entity_id for update;
    if v_status is null then return true; end if;
    if v_status<>'draft' or v_accounts<>'unposted' or v_paid<>0 or v_credited<>0 then raise exception 'Only an unpaid, unposted draft invoice can be deleted'; end if;
    delete from public.hospital_invoices where id=p_entity_id;
  elsif p_entity_type='credit_note' then
    select status,accounts_status into v_status,v_accounts from public.hospital_credit_notes where id=p_entity_id for update;
    if v_status is null then return true; end if;
    if v_status<>'draft' or v_accounts<>'unposted' then raise exception 'Only an unposted draft credit note can be deleted'; end if;
    delete from public.hospital_credit_notes where id=p_entity_id;
  else raise exception 'Unsupported billing document type'; end if;
  return true;
end $$;

grant execute on function public.hospital_save_invoice(uuid,uuid,text,date,date,text,text,text,text,numeric,jsonb,boolean) to authenticated;
grant execute on function public.hospital_save_credit_note(uuid,uuid,date,text,numeric,numeric,text,boolean) to authenticated;
grant execute on function public.bridge_hospital_document_to_central_accounts(text,uuid) to authenticated;
grant execute on function public.execute_central_accounts_hospital_posting(uuid) to authenticated;
grant execute on function public.hospital_delete_billing_document(text,uuid) to authenticated;

drop view if exists public.hospital_invoice_register;
create view public.hospital_invoice_register with (security_invoker=true) as
select i.*,p.project_code,p.title as project_title,c.hospital_name,c.client_code,
  greatest(i.total_amount-i.credited_amount-i.paid_amount,0)::numeric(16,2) as balance_amount
from public.hospital_invoices i join public.hospital_projects p on p.id=i.project_id join public.hospital_clients c on c.id=i.client_id;
grant select on public.hospital_invoice_register to authenticated;
