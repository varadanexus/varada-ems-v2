-- Hospital bills originate inside a Level 2 project workspace. Division-level
-- payment pages are read-only registers over these project-owned records.

alter table public.hospital_document_sequences
  drop constraint if exists hospital_document_sequences_document_type_check;

alter table public.hospital_document_sequences
  add constraint hospital_document_sequences_document_type_check
  check (document_type in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL'));

create table if not exists public.hospital_vendor_bills (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete restrict,
  vendor_id uuid not null references public.hospital_vendors(id) on delete restrict,
  bill_number text not null unique,
  vendor_invoice_number text,
  bill_date date not null,
  due_date date,
  description text not null,
  taxable_amount numeric(16,2) not null check (taxable_amount >= 0),
  tax_rate numeric(6,3) not null default 18 check (tax_rate between 0 and 100),
  tax_amount numeric(16,2) not null check (tax_amount >= 0),
  total_amount numeric(16,2) not null check (total_amount >= 0),
  paid_amount numeric(16,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved','partially_paid','paid','overdue','cancelled')),
  accounts_status text not null default 'unposted' check (accounts_status in ('unposted','ready','posted','rejected')),
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, vendor_invoice_number)
);

create index if not exists idx_hospital_vendor_bills_project
  on public.hospital_vendor_bills(project_id, bill_date desc);
create index if not exists idx_hospital_vendor_bills_vendor
  on public.hospital_vendor_bills(vendor_id, status);

drop trigger if exists trg_hospital_vendor_bills_touch on public.hospital_vendor_bills;
create trigger trg_hospital_vendor_bills_touch
before update on public.hospital_vendor_bills
for each row execute function public.touch_interior_entity_updated_at();

alter table public.hospital_vendor_bills enable row level security;

create policy hospital_vendor_bills_staff_all
on public.hospital_vendor_bills for all to authenticated
using (public.has_permission('hospital-projects','view'))
with check (public.has_permission('hospital-projects','create') or public.has_permission('hospital-projects','edit'));

create policy hospital_vendor_bills_vendor_select
on public.hospital_vendor_bills for select to authenticated
using (exists (
  select 1 from public.hospital_vendors v
  where v.id=vendor_id and v.auth_user_id=(select auth.uid())
));

grant select,insert,update,delete on public.hospital_vendor_bills to authenticated;

create or replace function public.hospital_next_document_number(p_document_type text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text := public.hospital_fiscal_year(p_date); v_no bigint; v_prefix text;
begin
  if public.hospital_actor_kind() <> 'staff' then raise exception 'Hospital staff access required'; end if;
  if p_document_type not in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL') then raise exception 'Unsupported document type'; end if;
  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number)
  values ('HOSPITAL_PROJECTS',p_document_type,v_fy,1)
  on conflict (scope_code,document_type,fiscal_year) do update
    set last_number=public.hospital_document_sequences.last_number+1,updated_at=now()
  returning last_number into v_no;
  v_prefix := case p_document_type
    when 'PROJECT' then 'HSP/PRJ/'
    when 'INVOICE' then 'HSP/INV/'
    when 'CREDIT_NOTE' then 'HSP/CN/'
    when 'VENDOR_BILL' then 'HSP/VB/'
    else 'HSP/QRY/' end;
  return v_prefix || v_fy || '/' || lpad(v_no::text,5,'0');
end $$;

create or replace function public.hospital_create_vendor_bill(
  p_project_id uuid,
  p_vendor_id uuid,
  p_vendor_invoice_number text,
  p_bill_date date,
  p_due_date date,
  p_description text,
  p_taxable_amount numeric,
  p_tax_rate numeric default 18
) returns public.hospital_vendor_bills
language plpgsql security definer set search_path = public as $$
declare
  v_project public.hospital_projects;
  v_row public.hospital_vendor_bills;
  v_tax numeric(16,2);
  v_number text;
begin
  if not public.has_permission('hospital-projects','create') then
    raise exception 'Hospital vendor bill create permission required';
  end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_project.id is null then raise exception 'Hospital project not found'; end if;
  if not exists (
    select 1 from public.hospital_project_vendors a
    where a.project_id=p_project_id and a.vendor_id=p_vendor_id and a.status<>'cancelled'
  ) then
    raise exception 'Select a vendor assigned to this project';
  end if;
  if coalesce(p_taxable_amount,0) < 0 then raise exception 'Taxable amount cannot be negative'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Bill description is required'; end if;
  v_number := public.hospital_next_document_number('VENDOR_BILL',coalesce(p_bill_date,current_date));
  v_tax := round(p_taxable_amount * coalesce(p_tax_rate,0) / 100,2);
  insert into public.hospital_vendor_bills(
    division_id,project_id,vendor_id,bill_number,vendor_invoice_number,bill_date,due_date,
    description,taxable_amount,tax_rate,tax_amount,total_amount
  ) values (
    v_project.division_id,v_project.id,p_vendor_id,v_number,nullif(btrim(coalesce(p_vendor_invoice_number,'')),''),
    coalesce(p_bill_date,current_date),p_due_date,btrim(p_description),p_taxable_amount,
    coalesce(p_tax_rate,0),v_tax,p_taxable_amount+v_tax
  ) returning * into v_row;
  return v_row;
end $$;

grant execute on function public.hospital_create_vendor_bill(uuid,uuid,text,date,date,text,numeric,numeric) to authenticated;

create or replace view public.hospital_vendor_bill_register
with (security_invoker=true) as
select b.id,b.bill_number,b.vendor_invoice_number,b.bill_date,b.due_date,b.description,
       b.taxable_amount,b.tax_amount,b.total_amount,b.paid_amount,
       greatest(b.total_amount-b.paid_amount,0) as balance_amount,
       b.status,b.accounts_status,b.project_id,b.vendor_id,
       p.project_code,p.title as project_title,v.vendor_code,v.legal_name as vendor_name
from public.hospital_vendor_bills b
join public.hospital_projects p on p.id=b.project_id
join public.hospital_vendors v on v.id=b.vendor_id;

grant select on public.hospital_vendor_bill_register to authenticated;
