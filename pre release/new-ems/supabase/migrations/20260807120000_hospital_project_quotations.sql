-- Hospital Projects: branded client quotation generator.
-- Itemised GST per line (extra or included) and an overall GST/round-off summary,
-- editable Terms & Conditions, and centrally date-coded quotation numbering
-- (HSP/QTN/<FY>/<DDMMYY><NN>), matching the existing hospital procurement /
-- billing document conventions.

-- 1. Extend the shared Hospital document-numbering function with a QUOTATION type.
create or replace function public.hospital_next_document_number(
  p_document_type text,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_date date:=coalesce(p_date,current_date);
  v_fy text:=public.hospital_fiscal_year(v_date);
  v_no bigint;
  v_prefix text;
  v_date_prefix text;
begin
  if public.hospital_actor_kind()<>'staff' then raise exception 'Hospital staff access required'; end if;
  if p_document_type not in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL','PROCUREMENT_PACKAGE','PROCUREMENT_APPROVAL','PURCHASE_ORDER','QUOTATION') then
    raise exception 'Unsupported document type';
  end if;

  if p_document_type='PROCUREMENT_PACKAGE' then
    v_date_prefix:='HSP/PROC/' || v_fy || '/' || to_char(v_date,'DDMMYY');
    perform pg_advisory_xact_lock(hashtextextended('hospital-procurement-package:' || v_date::text,0));
    select coalesce(max(case when right(p.package_number,2)~'^[0-9]{2}$' then right(p.package_number,2)::integer end),0)+1
      into v_no from public.hospital_procurement_packages p
      where p.package_number like v_date_prefix || '__';
    if v_no>99 then raise exception 'Hospital procurement package numbering supports a maximum of 99 packages per date'; end if;
    return v_date_prefix || lpad(v_no::text,2,'0');
  end if;

  if p_document_type='PROCUREMENT_APPROVAL' then
    v_date_prefix:='HSP/PA/' || v_fy || '/' || to_char(v_date,'DDMMYY');
    perform pg_advisory_xact_lock(hashtextextended('hospital-procurement-approval:' || v_date::text,0));
    select coalesce(max(case when right(a.approval_number,2)~'^[0-9]{2}$' then right(a.approval_number,2)::integer end),0)+1
      into v_no from public.hospital_procurement_approvals a
      where a.approval_number like v_date_prefix || '__';
    if v_no>99 then raise exception 'Hospital procurement proposal numbering supports a maximum of 99 proposals per date'; end if;
    return v_date_prefix || lpad(v_no::text,2,'0');
  end if;

  if p_document_type='QUOTATION' then
    v_date_prefix:='HSP/QTN/' || v_fy || '/' || to_char(v_date,'DDMMYY');
    perform pg_advisory_xact_lock(hashtextextended('hospital-quotation:' || v_date::text,0));
    select coalesce(max(case when right(q.quotation_number,2)~'^[0-9]{2}$' then right(q.quotation_number,2)::integer end),0)+1
      into v_no from public.hospital_quotations q
      where q.quotation_number like v_date_prefix || '__';
    if v_no>99 then raise exception 'Hospital quotation numbering supports a maximum of 99 quotations per date'; end if;
    return v_date_prefix || lpad(v_no::text,2,'0');
  end if;

  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number)
  values ('HOSPITAL_PROJECTS',p_document_type,v_fy,1)
  on conflict (scope_code,document_type,fiscal_year) do update
    set last_number=public.hospital_document_sequences.last_number+1,updated_at=now()
  returning last_number into v_no;

  v_prefix:=case p_document_type
    when 'PROJECT' then 'HSP/PRJ/'
    when 'INVOICE' then 'HSP/INV/'
    when 'CREDIT_NOTE' then 'HSP/CN/'
    when 'VENDOR_BILL' then 'HSP/VB/'
    when 'PURCHASE_ORDER' then 'HSP/PO/'
    else 'HSP/QRY/'
  end;
  return v_prefix || v_fy || '/' || lpad(v_no::text,5,'0');
end;
$$;
revoke all on function public.hospital_next_document_number(text,date) from public, anon;
grant execute on function public.hospital_next_document_number(text,date) to authenticated;

-- 2. Header + line tables.
create table public.hospital_quotations (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete restrict,
  client_id uuid not null references public.hospital_clients(id) on delete restrict,
  quotation_number text not null unique,
  quotation_date date not null default current_date,
  valid_until date,
  subject text,
  place_of_supply text,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  terms_conditions text,
  notes text,
  round_off numeric(16,2) not null default 0,
  taxable_amount numeric(16,2) not null default 0 check (taxable_amount >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  sent_at timestamptz,
  responded_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.hospital_quotations(id) on delete cascade,
  line_no integer not null,
  item_name text not null,
  description text,
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
  unique(quotation_id, line_no)
);

create index idx_hospital_quotations_project on public.hospital_quotations(project_id, status);
create index idx_hospital_quotation_lines_quotation on public.hospital_quotation_lines(quotation_id, line_no);

-- 3. RLS, matching the hospital_invoices / hospital_invoice_lines convention:
-- has_permission() already carries the chairman_managing_director / super_admin
-- unrestricted-access bypass centrally, so no separate bypass is required here.
alter table public.hospital_quotations enable row level security;
drop policy if exists hospital_quotations_staff_all on public.hospital_quotations;
create policy hospital_quotations_staff_all on public.hospital_quotations for all to authenticated
using (public.has_permission('hospital-projects','view') and public.hospital_can_access_project(project_id))
with check ((public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit')) and public.hospital_can_access_project(project_id));
grant select,insert,update,delete on public.hospital_quotations to authenticated;

alter table public.hospital_quotation_lines enable row level security;
drop policy if exists hospital_quotation_lines_staff_all on public.hospital_quotation_lines;
create policy hospital_quotation_lines_staff_all on public.hospital_quotation_lines for all to authenticated
using (public.has_permission('hospital-projects','view') and exists(select 1 from public.hospital_quotations q where q.id=quotation_id and public.hospital_can_access_project(q.project_id)))
with check ((public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit')) and exists(select 1 from public.hospital_quotations q where q.id=quotation_id and public.hospital_can_access_project(q.project_id)));
grant select,insert,update,delete on public.hospital_quotation_lines to authenticated;

-- 4. Save (create/edit draft) RPC — mirrors hospital_save_invoice: recomputes every
-- line's taxable/tax/total from quantity, unit price, discount, GST rate and the
-- extra-vs-included flag, then rolls the header totals up from the lines.
create or replace function public.hospital_save_quotation(
  p_quotation_id uuid, p_project_id uuid, p_quotation_date date, p_valid_until date,
  p_subject text, p_place_of_supply text, p_terms_conditions text, p_notes text,
  p_round_off numeric, p_lines jsonb
) returns public.hospital_quotations language plpgsql security definer set search_path=public as $$
declare v_project public.hospital_projects; v_quotation public.hospital_quotations; v_line jsonb; v_no integer:=0;
  v_qty numeric; v_rate numeric; v_discount numeric; v_gst numeric; v_included boolean; v_entered numeric; v_taxable numeric; v_tax numeric;
  v_taxable_total numeric:=0; v_tax_total numeric:=0; v_total numeric:=0; v_item text;
begin
  if not public.has_permission('hospital-projects',case when p_quotation_id is null then 'create' else 'edit' end) then raise exception 'Hospital quotation permission required'; end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_project.id is null then raise exception 'Hospital project not found'; end if;
  if not public.hospital_can_access_project(v_project.id) then raise exception 'Hospital project access required'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Add at least one quotation line'; end if;

  if p_quotation_id is null then
    insert into public.hospital_quotations(division_id,project_id,client_id,quotation_number,quotation_date,valid_until,subject,place_of_supply,terms_conditions,notes,round_off,status)
    values(v_project.division_id,v_project.id,v_project.client_id,public.hospital_next_document_number('QUOTATION',coalesce(p_quotation_date,current_date)),coalesce(p_quotation_date,current_date),p_valid_until,nullif(btrim(p_subject),''),nullif(btrim(p_place_of_supply),''),nullif(btrim(p_terms_conditions),''),nullif(btrim(p_notes),''),coalesce(p_round_off,0),'draft')
    returning * into v_quotation;
  else
    select * into v_quotation from public.hospital_quotations where id=p_quotation_id and project_id=p_project_id for update;
    if v_quotation.id is null then raise exception 'Quotation not found'; end if;
    if v_quotation.status<>'draft' then raise exception 'Only a draft quotation can be edited'; end if;
    update public.hospital_quotations set quotation_date=coalesce(p_quotation_date,current_date),valid_until=p_valid_until,subject=nullif(btrim(p_subject),''),place_of_supply=nullif(btrim(p_place_of_supply),''),terms_conditions=nullif(btrim(p_terms_conditions),''),notes=nullif(btrim(p_notes),''),round_off=coalesce(p_round_off,0),updated_at=now() where id=v_quotation.id;
    delete from public.hospital_quotation_lines where quotation_id=v_quotation.id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no:=v_no+1;
    v_item:=btrim(v_line->>'item_name');
    v_qty:=coalesce((v_line->>'quantity')::numeric,0); v_rate:=coalesce((v_line->>'unit_price')::numeric,0); v_discount:=coalesce((v_line->>'discount_amount')::numeric,0); v_gst:=coalesce((v_line->>'gst_rate')::numeric,0); v_included:=coalesce((v_line->>'gst_included')::boolean,false);
    if v_item is null or v_item='' then raise exception 'Every quotation line needs an item name'; end if;
    if v_qty<=0 or v_rate<0 or v_discount<0 or v_discount>v_qty*v_rate or v_gst<0 or v_gst>100 then raise exception 'Invalid quotation line values'; end if;
    v_entered:=round(v_qty*v_rate-v_discount,2);
    if v_included and v_gst>0 then v_taxable:=round(v_entered*100/(100+v_gst),2); v_tax:=v_entered-v_taxable; else v_taxable:=v_entered; v_tax:=round(v_taxable*v_gst/100,2); end if;
    insert into public.hospital_quotation_lines(quotation_id,line_no,item_name,description,hsn_sac,quantity,unit,unit_price,discount_amount,gst_rate,gst_included,taxable_amount,tax_amount,total_amount)
    values(v_quotation.id,v_no,v_item,nullif(btrim(v_line->>'description'),''),nullif(btrim(v_line->>'hsn_sac'),''),v_qty,coalesce(nullif(btrim(v_line->>'unit'),''),'Nos'),v_rate,v_discount,v_gst,v_included,v_taxable,v_tax,v_taxable+v_tax);
    v_taxable_total:=v_taxable_total+v_taxable; v_tax_total:=v_tax_total+v_tax;
  end loop;

  v_total:=round(v_taxable_total+v_tax_total+coalesce(p_round_off,0),2);
  update public.hospital_quotations set taxable_amount=v_taxable_total,tax_amount=v_tax_total,total_amount=v_total,updated_at=now() where id=v_quotation.id returning * into v_quotation;
  return v_quotation;
end $$;

-- 5. Status transitions (Sent / Accepted / Rejected / Expired) and delete.
create or replace function public.hospital_update_quotation_status(p_quotation_id uuid, p_status text)
returns public.hospital_quotations language plpgsql security definer set search_path=public as $$
declare v_quotation public.hospital_quotations;
begin
  if not public.has_permission('hospital-projects','edit') then raise exception 'Hospital quotation permission required'; end if;
  if p_status not in ('sent','accepted','rejected','expired') then raise exception 'Unsupported quotation status'; end if;
  select * into v_quotation from public.hospital_quotations where id=p_quotation_id and public.hospital_can_access_project(project_id) for update;
  if v_quotation.id is null then raise exception 'Quotation not found'; end if;
  if p_status='sent' and v_quotation.status<>'draft' then raise exception 'Only a draft quotation can be marked as sent'; end if;
  if p_status in ('accepted','rejected') and v_quotation.status<>'sent' then raise exception 'Only a sent quotation can be accepted or rejected'; end if;
  update public.hospital_quotations set status=p_status,
    sent_at=case when p_status='sent' then now() else sent_at end,
    responded_at=case when p_status in ('accepted','rejected') then now() else responded_at end,
    updated_at=now()
  where id=p_quotation_id returning * into v_quotation;
  return v_quotation;
end $$;

create or replace function public.hospital_delete_quotation(p_quotation_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
  if not public.has_permission('hospital-projects','delete') then raise exception 'Hospital quotation delete permission required'; end if;
  select status into v_status from public.hospital_quotations where id=p_quotation_id and public.hospital_can_access_project(project_id) for update;
  if v_status is null then return true; end if;
  if v_status<>'draft' then raise exception 'Only a draft quotation can be deleted'; end if;
  delete from public.hospital_quotations where id=p_quotation_id;
  return true;
end $$;

revoke all on function public.hospital_save_quotation(uuid,uuid,date,date,text,text,text,text,numeric,jsonb) from public, anon;
revoke all on function public.hospital_update_quotation_status(uuid,text) from public, anon;
revoke all on function public.hospital_delete_quotation(uuid) from public, anon;
grant execute on function public.hospital_save_quotation(uuid,uuid,date,date,text,text,text,text,numeric,jsonb) to authenticated;
grant execute on function public.hospital_update_quotation_status(uuid,text) to authenticated;
grant execute on function public.hospital_delete_quotation(uuid) to authenticated;

-- 6. List/register view for the workspace UI (project + client display fields).
create view public.hospital_quotation_register with (security_invoker=true) as
select q.*, p.project_code, p.title as project_title, c.hospital_name, c.client_code
from public.hospital_quotations q
join public.hospital_projects p on p.id=q.project_id
join public.hospital_clients c on c.id=q.client_id;
grant select on public.hospital_quotation_register to authenticated;
