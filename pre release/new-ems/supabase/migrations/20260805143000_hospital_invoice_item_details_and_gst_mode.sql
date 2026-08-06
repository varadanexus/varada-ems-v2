-- Hospital Projects: separate invoice item details and exclusive item-wise/common GST modes.

alter table public.hospital_invoices
  add column if not exists gst_mode text not null default 'item_wise',
  add column if not exists common_gst_rate numeric(6,3) not null default 18,
  add column if not exists common_gst_included boolean not null default false;

alter table public.hospital_invoices drop constraint if exists hospital_invoices_gst_mode_check;
alter table public.hospital_invoices drop constraint if exists hospital_invoices_common_gst_rate_check;
alter table public.hospital_invoices
  add constraint hospital_invoices_gst_mode_check check (gst_mode in ('item_wise','common')),
  add constraint hospital_invoices_common_gst_rate_check check (common_gst_rate between 0 and 100);

alter table public.hospital_invoice_lines add column if not exists item_name text;
update public.hospital_invoice_lines set item_name=description where item_name is null or btrim(item_name)='';
alter table public.hospital_invoice_lines alter column item_name set not null;
alter table public.hospital_invoice_lines alter column description drop not null;

drop function if exists public.hospital_save_invoice(uuid,uuid,text,date,date,text,text,text,text,numeric,jsonb,boolean);

create or replace function public.hospital_save_invoice(
  p_invoice_id uuid, p_project_id uuid, p_invoice_type text, p_issue_date date, p_due_date date,
  p_reference_number text, p_place_of_supply text, p_payment_terms text, p_notes text,
  p_round_off numeric, p_gst_mode text, p_common_gst_rate numeric,
  p_common_gst_included boolean, p_lines jsonb, p_issue boolean default false
) returns public.hospital_invoices language plpgsql security definer set search_path=public as $$
declare
  v_project public.hospital_projects; v_invoice public.hospital_invoices; v_line jsonb; v_no integer:=0;
  v_qty numeric; v_rate numeric; v_discount numeric; v_gst numeric; v_entered numeric; v_taxable numeric; v_tax numeric;
  v_taxable_total numeric:=0; v_tax_total numeric:=0; v_total numeric:=0; v_included boolean;
begin
  if not public.has_permission('hospital-projects',case when p_invoice_id is null then 'create' else 'edit' end) then raise exception 'Hospital billing permission required'; end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_project.id is null then raise exception 'Hospital project not found'; end if;
  if coalesce(p_gst_mode,'') not in ('item_wise','common') then raise exception 'Select item-wise or entire-bill GST'; end if;
  if coalesce(p_common_gst_rate,0)<0 or coalesce(p_common_gst_rate,0)>100 then raise exception 'Enter a valid common GST rate'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Add at least one invoice line'; end if;

  if p_invoice_id is null then
    insert into public.hospital_invoices(
      division_id,project_id,client_id,invoice_number,invoice_type,issue_date,due_date,description,
      taxable_amount,tax_rate,tax_amount,total_amount,status,accounts_status,reference_number,
      place_of_supply,payment_terms,notes,round_off,gst_mode,common_gst_rate,common_gst_included
    ) values(
      v_project.division_id,v_project.id,v_project.client_id,public.next_central_document_number('invoice',coalesce(p_issue_date,current_date)),
      coalesce(p_invoice_type,'progress'),coalesce(p_issue_date,current_date),p_due_date,'Itemized client invoice',0,0,0,0,
      'draft','unposted',nullif(btrim(p_reference_number),''),nullif(btrim(p_place_of_supply),''),
      nullif(btrim(p_payment_terms),''),nullif(btrim(p_notes),''),coalesce(p_round_off,0),p_gst_mode,
      coalesce(p_common_gst_rate,0),coalesce(p_common_gst_included,false)
    ) returning * into v_invoice;
  else
    select * into v_invoice from public.hospital_invoices where id=p_invoice_id and project_id=p_project_id for update;
    if v_invoice.id is null then raise exception 'Invoice not found'; end if;
    if v_invoice.status<>'draft' or v_invoice.accounts_status<>'unposted' or v_invoice.paid_amount<>0 or v_invoice.credited_amount<>0 then raise exception 'Only an unpaid, unposted draft invoice can be edited'; end if;
    update public.hospital_invoices set
      invoice_type=coalesce(p_invoice_type,'progress'),issue_date=coalesce(p_issue_date,current_date),due_date=p_due_date,
      reference_number=nullif(btrim(p_reference_number),''),place_of_supply=nullif(btrim(p_place_of_supply),''),
      payment_terms=nullif(btrim(p_payment_terms),''),notes=nullif(btrim(p_notes),''),round_off=coalesce(p_round_off,0),
      gst_mode=p_gst_mode,common_gst_rate=coalesce(p_common_gst_rate,0),common_gst_included=coalesce(p_common_gst_included,false),updated_at=now()
    where id=v_invoice.id;
    delete from public.hospital_invoice_lines where invoice_id=v_invoice.id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no:=v_no+1;
    if nullif(btrim(v_line->>'item_name'),'') is null then raise exception 'Enter an item name for line %',v_no; end if;
    v_qty:=coalesce((v_line->>'quantity')::numeric,0); v_rate:=coalesce((v_line->>'unit_price')::numeric,0); v_discount:=coalesce((v_line->>'discount_amount')::numeric,0);
    v_gst:=case when p_gst_mode='common' then coalesce(p_common_gst_rate,0) else coalesce((v_line->>'gst_rate')::numeric,0) end;
    v_included:=case when p_gst_mode='common' then coalesce(p_common_gst_included,false) else coalesce((v_line->>'gst_included')::boolean,false) end;
    if v_qty<=0 or v_rate<0 or v_discount<0 or v_discount>v_qty*v_rate or v_gst<0 or v_gst>100 then raise exception 'Invalid invoice line values'; end if;
    v_entered:=round(v_qty*v_rate-v_discount,2);
    if v_included and v_gst>0 then v_taxable:=round(v_entered*100/(100+v_gst),2); v_tax:=v_entered-v_taxable;
    else v_taxable:=v_entered; v_tax:=round(v_taxable*v_gst/100,2); end if;
    insert into public.hospital_invoice_lines(
      invoice_id,line_no,item_name,description,hsn_sac,quantity,unit,unit_price,discount_amount,
      gst_rate,gst_included,taxable_amount,tax_amount,total_amount
    ) values(
      v_invoice.id,v_no,btrim(v_line->>'item_name'),nullif(btrim(v_line->>'description'),''),nullif(btrim(v_line->>'hsn_sac'),''),
      v_qty,coalesce(nullif(btrim(v_line->>'unit'),''),'Nos'),v_rate,v_discount,v_gst,v_included,v_taxable,v_tax,v_taxable+v_tax
    );
    v_taxable_total:=v_taxable_total+v_taxable; v_tax_total:=v_tax_total+v_tax;
  end loop;

  v_total:=round(v_taxable_total+v_tax_total+coalesce(p_round_off,0),2);
  update public.hospital_invoices set
    description=(select string_agg(item_name,', ' order by line_no) from public.hospital_invoice_lines where invoice_id=v_invoice.id),
    taxable_amount=v_taxable_total,tax_rate=case when p_gst_mode='common' then coalesce(p_common_gst_rate,0) else 0 end,
    tax_amount=v_tax_total,total_amount=v_total,status=case when p_issue then 'issued' else 'draft' end,
    accounts_status='unposted',updated_at=now()
  where id=v_invoice.id returning * into v_invoice;
  return v_invoice;
end $$;

grant execute on function public.hospital_save_invoice(uuid,uuid,text,date,date,text,text,text,text,numeric,text,numeric,boolean,jsonb,boolean) to authenticated;

drop trigger if exists trg_hospital_invoice_accounts_bridge on public.hospital_invoices;
drop trigger if exists trg_hospital_credit_accounts_bridge on public.hospital_credit_notes;

create or replace function public.hospital_stage_billing_to_central_accounts(p_entity_type text,p_entity_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_financial_document uuid;
begin
  if not public.has_permission('hospital-projects','approve') then raise exception 'Hospital ledger approval permission required'; end if;
  if p_entity_type='invoice' then
    update public.hospital_invoices set accounts_status='ready',updated_at=now()
    where id=p_entity_id and status='issued' and accounts_status='unposted';
    if not found then raise exception 'Only an issued, unposted Hospital invoice can be sent to Central Accounts'; end if;
  elsif p_entity_type='credit_note' then
    update public.hospital_credit_notes set accounts_status='ready',updated_at=now()
    where id=p_entity_id and status='approved' and accounts_status='unposted';
    if not found then raise exception 'Only an approved, unposted Hospital credit note can be sent to Central Accounts'; end if;
  else raise exception 'Unsupported Hospital ledger document'; end if;
  v_financial_document:=public.bridge_hospital_document_to_central_accounts(p_entity_type,p_entity_id);
  if v_financial_document is null then raise exception 'Central Accounts staging failed'; end if;
  return v_financial_document;
end $$;

grant execute on function public.hospital_stage_billing_to_central_accounts(text,uuid) to authenticated;

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
    values(v_invoice.division_id,v_invoice.id,v_invoice.project_id,v_invoice.client_id,public.next_central_document_number('credit_note',coalesce(p_credit_note_date,current_date)),coalesce(p_credit_note_date,current_date),btrim(p_reason),v_total,p_taxable_amount,p_tax_rate,v_tax,nullif(btrim(p_notes),''),case when p_approve then 'approved' else 'draft' end,'unposted') returning * into v_note;
  else
    update public.hospital_credit_notes set credit_note_date=coalesce(p_credit_note_date,current_date),reason=btrim(p_reason),amount=v_total,taxable_amount=p_taxable_amount,tax_rate=p_tax_rate,tax_amount=v_tax,notes=nullif(btrim(p_notes),''),status=case when p_approve then 'approved' else 'draft' end,accounts_status='unposted',approved_by=case when p_approve then public.current_app_user_id() else null end,approved_at=case when p_approve then now() else null end,updated_at=now() where id=v_note.id returning * into v_note;
  end if;
  if p_approve then update public.hospital_invoices set credited_amount=credited_amount+v_total-v_old,updated_at=now() where id=v_invoice.id; end if;
  return v_note;
end $$;

grant execute on function public.hospital_save_credit_note(uuid,uuid,date,text,numeric,numeric,text,boolean) to authenticated;

drop view if exists public.hospital_invoice_register;
create view public.hospital_invoice_register with (security_invoker=true) as
select i.*,p.project_code,p.title as project_title,c.hospital_name,c.client_code,
  greatest(i.total_amount-i.credited_amount-i.paid_amount,0)::numeric(16,2) as balance_amount
from public.hospital_invoices i
join public.hospital_projects p on p.id=i.project_id
join public.hospital_clients c on c.id=i.client_id;
grant select on public.hospital_invoice_register to authenticated;
