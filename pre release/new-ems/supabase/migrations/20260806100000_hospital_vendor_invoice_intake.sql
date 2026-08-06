-- Unified Hospital vendor-invoice intake for EMS staff and the Hospital Vendor Portal.

alter table public.hospital_vendor_bills
  add column if not exists source text not null default 'staff',
  add column if not exists submitted_by_portal_user_id uuid references public.external_portal_users(id) on delete set null,
  add column if not exists drive_document_id uuid references public.drive_documents(id) on delete set null,
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

alter table public.hospital_vendor_bills
  drop constraint if exists hospital_vendor_bills_source_check;
alter table public.hospital_vendor_bills
  add constraint hospital_vendor_bills_source_check check (source in ('staff','vendor_portal'));

create index if not exists idx_hospital_vendor_bills_drive_document
  on public.hospital_vendor_bills(drive_document_id) where drive_document_id is not null;

create or replace function public.hospital_vendor_upload_context(p_session_token text,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx record; result jsonb;
begin
  select * into ctx from public.hospital_portal_context(p_session_token);
  if ctx.portal_user_id is null or ctx.party_kind<>'vendor' then
    raise exception 'Hospital vendor portal session is invalid or has expired';
  end if;
  select jsonb_build_object(
    'portalUserId',ctx.portal_user_id,
    'vendorId',v.id,
    'vendorName',v.legal_name,
    'projectId',p.id,
    'divisionId',p.division_id,
    'projectCode',p.project_code,
    'projectName',p.title,
    'clientName',c.hospital_name
  ) into result
  from public.hospital_projects p
  join public.hospital_clients c on c.id=p.client_id
  join public.hospital_vendors v on v.id=ctx.party_id
  where p.id=p_project_id and exists(
    select 1 from public.hospital_project_vendors a
    where a.project_id=p.id and a.vendor_id=v.id and a.status<>'cancelled'
  );
  if result is null then raise exception 'Vendor project access denied'; end if;
  return result;
end $$;

revoke all on function public.hospital_vendor_upload_context(text,uuid) from public,anon,authenticated;
grant execute on function public.hospital_vendor_upload_context(text,uuid) to service_role;

create or replace function public.hospital_record_vendor_invoice_upload(
  p_project_id uuid,
  p_vendor_id uuid,
  p_vendor_invoice_number text,
  p_bill_date date,
  p_due_date date,
  p_description text,
  p_taxable_amount numeric,
  p_tax_rate numeric,
  p_source text,
  p_staff_app_user_id uuid,
  p_portal_user_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_file_size bigint
) returns public.hospital_vendor_bills
language plpgsql security definer set search_path=public as $$
declare
  project_row public.hospital_projects;
  result public.hospital_vendor_bills;
  v_fiscal_year text:=public.hospital_fiscal_year(coalesce(p_bill_date,current_date));
  v_sequence_number bigint;
  tax_amount numeric(16,2);
begin
  if p_source not in ('staff','vendor_portal') then raise exception 'Unsupported vendor-invoice source'; end if;
  if nullif(btrim(coalesce(p_vendor_invoice_number,'')),'') is null then raise exception 'Vendor invoice number is required'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Invoice description is required'; end if;
  if coalesce(p_taxable_amount,0)<=0 then raise exception 'Taxable amount must be greater than zero'; end if;
  if coalesce(p_tax_rate,0)<0 or coalesce(p_tax_rate,0)>100 then raise exception 'GST rate must be between 0 and 100'; end if;
  if p_source='staff' and p_staff_app_user_id is null then raise exception 'EMS staff identity is required'; end if;
  if p_source='vendor_portal' and not exists(
    select 1 from public.external_portal_access a
    where a.portal_user_id=p_portal_user_id and a.record_id=p_vendor_id
      and a.source_module='hospital-projects' and a.access_scope='hospital_vendor_portal'
      and a.is_active and (a.expires_at is null or a.expires_at>now())
  ) then raise exception 'Vendor portal identity is not authorized'; end if;

  select * into project_row from public.hospital_projects where id=p_project_id;
  if project_row.id is null then raise exception 'Hospital project not found'; end if;
  if not exists(
    select 1 from public.hospital_project_vendors a
    where a.project_id=p_project_id and a.vendor_id=p_vendor_id and a.status<>'cancelled'
  ) then raise exception 'Vendor is not assigned to this project'; end if;
  if exists(
    select 1 from public.hospital_vendor_bills b
    where b.vendor_id=p_vendor_id and lower(btrim(b.vendor_invoice_number))=lower(btrim(p_vendor_invoice_number))
  ) then raise exception 'This vendor invoice number has already been submitted'; end if;

  perform pg_advisory_xact_lock(hashtextextended('HOSPITAL_PROJECTS:VENDOR_BILL:'||v_fiscal_year,0));
  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number)
  values('HOSPITAL_PROJECTS','VENDOR_BILL',v_fiscal_year,1)
  on conflict(scope_code,document_type,fiscal_year) do update
    set last_number=public.hospital_document_sequences.last_number+1,updated_at=now()
  returning last_number into v_sequence_number;

  tax_amount:=round(p_taxable_amount*coalesce(p_tax_rate,0)/100,2);
  insert into public.hospital_vendor_bills(
    division_id,project_id,vendor_id,bill_number,vendor_invoice_number,bill_date,due_date,
    description,taxable_amount,tax_rate,tax_amount,total_amount,status,accounts_status,
    source,created_by,submitted_by_portal_user_id,original_file_name,mime_type,file_size
  ) values(
    project_row.division_id,project_row.id,p_vendor_id,
    'HSP/VB/'||v_fiscal_year||'/'||lpad(v_sequence_number::text,5,'0'),btrim(p_vendor_invoice_number),
    coalesce(p_bill_date,current_date),p_due_date,btrim(p_description),p_taxable_amount,
    coalesce(p_tax_rate,0),tax_amount,p_taxable_amount+tax_amount,'submitted','unposted',
    p_source,p_staff_app_user_id,p_portal_user_id,nullif(btrim(coalesce(p_original_file_name,'')),''),
    nullif(btrim(coalesce(p_mime_type,'')),''),p_file_size
  ) returning * into result;
  return result;
end $$;

revoke all on function public.hospital_record_vendor_invoice_upload(uuid,uuid,text,date,date,text,numeric,numeric,text,uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.hospital_record_vendor_invoice_upload(uuid,uuid,text,date,date,text,numeric,numeric,text,uuid,uuid,text,text,bigint) to service_role;

create or replace view public.hospital_vendor_bill_register with (security_invoker=true) as
select b.id,b.bill_number,b.vendor_invoice_number,b.bill_date,b.due_date,b.description,
       b.taxable_amount,b.tax_amount,b.total_amount,b.paid_amount,
       greatest(b.total_amount-b.paid_amount,0) as balance_amount,
       b.status,b.accounts_status,b.project_id,b.vendor_id,
       p.project_code,p.title as project_title,v.vendor_code,v.legal_name as vendor_name,
       b.source,b.original_file_name,b.mime_type,b.file_size,b.drive_document_id,d.web_view_link
from public.hospital_vendor_bills b
join public.hospital_projects p on p.id=b.project_id
join public.hospital_vendors v on v.id=b.vendor_id
left join public.drive_documents d on d.id=b.drive_document_id and d.deleted_at is null;
grant select on public.hospital_vendor_bill_register to authenticated;

-- Append the vendor's submitted bill register to the existing portal snapshot.
alter function public.hospital_portal_snapshot(text) rename to hospital_portal_snapshot_before_vendor_bills;
revoke all on function public.hospital_portal_snapshot_before_vendor_bills(text) from public,anon,authenticated;

create or replace function public.hospital_portal_snapshot(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx record; result jsonb;
begin
  select * into ctx from public.hospital_portal_context(p_session_token);
  if ctx.portal_user_id is null then raise exception 'Hospital portal session is invalid or has expired'; end if;
  result:=public.hospital_portal_snapshot_before_vendor_bills(p_session_token);
  return result || jsonb_build_object('vendorBills',case when ctx.party_kind='vendor' then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',b.id,'billNumber',b.bill_number,'vendorInvoiceNumber',b.vendor_invoice_number,
      'projectId',b.project_id,'billDate',b.bill_date,'dueDate',b.due_date,
      'description',b.description,'taxableAmount',b.taxable_amount,'taxRate',b.tax_rate,
      'taxAmount',b.tax_amount,'totalAmount',b.total_amount,'paidAmount',b.paid_amount,
      'status',b.status,'accountsStatus',b.accounts_status,'originalFileName',b.original_file_name,
      'createdAt',b.created_at
    ) order by b.created_at desc)
    from public.hospital_vendor_bills b where b.vendor_id=ctx.party_id
  ),'[]'::jsonb) else '[]'::jsonb end);
end $$;

revoke all on function public.hospital_portal_snapshot(text) from public;
grant execute on function public.hospital_portal_snapshot(text) to anon,authenticated;
