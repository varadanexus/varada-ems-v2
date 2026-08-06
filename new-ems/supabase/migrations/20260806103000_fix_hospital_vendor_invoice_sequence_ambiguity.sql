Exit code: 0
Wall time: 0.5 seconds
Output:
-- Qualify the vendor-bill sequence variables so PL/pgSQL cannot confuse them
-- with hospital_document_sequences column names.

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

