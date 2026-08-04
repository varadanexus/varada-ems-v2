-- Procurement is intentionally two-stage:
-- 1. project requirements are captured without commercial values;
-- 2. vendor packages price several requirements together and carry bill-level charges/taxes.

alter table public.hospital_document_sequences
  drop constraint if exists hospital_document_sequences_document_type_check;

alter table public.hospital_document_sequences
  add constraint hospital_document_sequences_document_type_check
  check (document_type in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL','PROCUREMENT_PACKAGE'));

create table public.hospital_procurement_packages (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  vendor_id uuid not null references public.hospital_vendors(id) on delete restrict,
  package_number text not null unique,
  vendor_quote_number text,
  quote_date date,
  valid_until date,
  expected_delivery date,
  place_of_supply text,
  tax_mode text not null default 'common' check (tax_mode in ('common','item_wise')),
  common_gst_rate numeric(6,3) not null default 18 check (common_gst_rate between 0 and 100),
  vendor_round_off numeric(16,2) not null default 0,
  client_round_off numeric(16,2) not null default 0,
  status text not null default 'draft' check (status in (
    'draft','rfq','quote_received','approved','purchase_order','delivery','installed',
    'vendor_billed','completed','cancelled'
  )),
  notes text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_procurement_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.hospital_procurement_packages(id) on delete cascade,
  procurement_item_id uuid not null references public.hospital_procurement_items(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'Nos',
  vendor_unit_price numeric(16,2) not null default 0 check (vendor_unit_price >= 0),
  vendor_discount numeric(16,2) not null default 0 check (vendor_discount >= 0),
  client_unit_price numeric(16,2) not null default 0 check (client_unit_price >= 0),
  client_discount numeric(16,2) not null default 0 check (client_discount >= 0),
  hsn_sac text,
  gst_rate numeric(6,3) not null default 0 check (gst_rate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, procurement_item_id),
  check (vendor_discount <= quantity * vendor_unit_price),
  check (client_discount <= quantity * client_unit_price)
);

create table public.hospital_procurement_package_charges (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.hospital_procurement_packages(id) on delete cascade,
  charge_type text not null check (charge_type in ('transport','installation','packing','insurance','other')),
  description text not null,
  vendor_amount numeric(16,2) not null default 0 check (vendor_amount >= 0),
  client_amount numeric(16,2) not null default 0 check (client_amount >= 0),
  hsn_sac text,
  gst_rate numeric(6,3) not null default 0 check (gst_rate between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hospital_procurement_package_taxes (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.hospital_procurement_packages(id) on delete cascade,
  tax_name text not null,
  applies_to text not null default 'both' check (applies_to in ('vendor','client','both')),
  effect text not null default 'additive' check (effect in ('additive','deduction')),
  taxable_base numeric(16,2) not null default 0 check (taxable_base >= 0),
  tax_rate numeric(7,3) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_hospital_proc_packages_project on public.hospital_procurement_packages(project_id, status);
create index idx_hospital_proc_packages_vendor on public.hospital_procurement_packages(vendor_id, status);
create index idx_hospital_proc_package_items_package on public.hospital_procurement_package_items(package_id);
create index idx_hospital_proc_package_items_requirement on public.hospital_procurement_package_items(procurement_item_id);
create index idx_hospital_proc_package_charges_package on public.hospital_procurement_package_charges(package_id);
create index idx_hospital_proc_package_taxes_package on public.hospital_procurement_package_taxes(package_id);

create trigger trg_hospital_proc_packages_touch before update on public.hospital_procurement_packages
for each row execute function public.touch_interior_entity_updated_at();
create trigger trg_hospital_proc_package_items_touch before update on public.hospital_procurement_package_items
for each row execute function public.touch_interior_entity_updated_at();
create trigger trg_hospital_proc_package_charges_touch before update on public.hospital_procurement_package_charges
for each row execute function public.touch_interior_entity_updated_at();
create trigger trg_hospital_proc_package_taxes_touch before update on public.hospital_procurement_package_taxes
for each row execute function public.touch_interior_entity_updated_at();

create or replace function public.hospital_next_document_number(p_document_type text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text := public.hospital_fiscal_year(p_date); v_no bigint; v_prefix text;
begin
  if public.hospital_actor_kind() <> 'staff' then raise exception 'Hospital staff access required'; end if;
  if p_document_type not in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL','PROCUREMENT_PACKAGE') then
    raise exception 'Unsupported document type';
  end if;
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
    when 'PROCUREMENT_PACKAGE' then 'HSP/PROC/'
    else 'HSP/QRY/' end;
  return v_prefix || v_fy || '/' || lpad(v_no::text,5,'0');
end $$;

create or replace function public.hospital_create_procurement_package(
  p_project_id uuid,
  p_vendor_id uuid,
  p_procurement_item_ids uuid[],
  p_vendor_quote_number text default null,
  p_quote_date date default null,
  p_valid_until date default null,
  p_expected_delivery date default null,
  p_place_of_supply text default null,
  p_tax_mode text default 'common',
  p_common_gst_rate numeric default 18,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project public.hospital_projects;
  v_package public.hospital_procurement_packages;
  v_number text;
  v_requested_count integer;
  v_inserted_count integer;
begin
  if not public.has_permission('hospital-projects','create') then
    raise exception 'Hospital procurement create permission required';
  end if;
  select * into v_project from public.hospital_projects where id=p_project_id;
  if v_project.id is null then raise exception 'Hospital project not found'; end if;
  if not exists(select 1 from public.hospital_vendors where id=p_vendor_id and status='active') then
    raise exception 'Select an active Hospital vendor';
  end if;
  if p_tax_mode not in ('common','item_wise') then raise exception 'Invalid tax mode'; end if;
  if coalesce(p_common_gst_rate,0) < 0 or coalesce(p_common_gst_rate,0) > 100 then raise exception 'Invalid GST rate'; end if;
  v_requested_count := coalesce(array_length(p_procurement_item_ids,1),0);
  if v_requested_count=0 then raise exception 'Select at least one procurement requirement'; end if;
  if exists(
    select 1 from unnest(p_procurement_item_ids) selected(id)
    left join public.hospital_procurement_items i on i.id=selected.id and i.project_id=p_project_id
    where i.id is null
  ) then raise exception 'One or more requirements do not belong to this project'; end if;

  v_number := public.hospital_next_document_number('PROCUREMENT_PACKAGE',coalesce(p_quote_date,current_date));
  insert into public.hospital_procurement_packages(
    division_id,project_id,vendor_id,package_number,vendor_quote_number,quote_date,valid_until,
    expected_delivery,place_of_supply,tax_mode,common_gst_rate,notes
  ) values (
    v_project.division_id,p_project_id,p_vendor_id,v_number,nullif(btrim(coalesce(p_vendor_quote_number,'')),''),
    p_quote_date,p_valid_until,p_expected_delivery,nullif(btrim(coalesce(p_place_of_supply,'')),''),
    p_tax_mode,coalesce(p_common_gst_rate,0),nullif(btrim(coalesce(p_notes,'')),'')
  ) returning * into v_package;

  insert into public.hospital_procurement_package_items(package_id,procurement_item_id,quantity,unit)
  select v_package.id,i.id,i.quantity,i.unit
  from public.hospital_procurement_items i
  where i.project_id=p_project_id and i.id=any(p_procurement_item_ids);
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> v_requested_count then raise exception 'Duplicate or invalid requirement selection'; end if;

  insert into public.hospital_project_vendors(project_id,vendor_id,package_name,scope_summary,status)
  values(p_project_id,p_vendor_id,v_number,'Procurement package','accepted')
  on conflict(project_id,vendor_id,package_name) do nothing;

  return jsonb_build_object('id',v_package.id,'package_number',v_package.package_number);
end $$;

revoke all on function public.hospital_next_document_number(text,date) from public, anon;
grant execute on function public.hospital_next_document_number(text,date) to authenticated, service_role;
revoke all on function public.hospital_create_procurement_package(uuid,uuid,uuid[],text,date,date,date,text,text,numeric,text) from public, anon;
grant execute on function public.hospital_create_procurement_package(uuid,uuid,uuid[],text,date,date,date,text,text,numeric,text) to authenticated, service_role;

alter table public.hospital_procurement_packages enable row level security;
alter table public.hospital_procurement_package_items enable row level security;
alter table public.hospital_procurement_package_charges enable row level security;
alter table public.hospital_procurement_package_taxes enable row level security;

create policy hospital_proc_packages_staff_select on public.hospital_procurement_packages
for select to authenticated using ((select public.has_permission('hospital-projects','view')));
create policy hospital_proc_packages_staff_insert on public.hospital_procurement_packages
for insert to authenticated with check ((select public.has_permission('hospital-projects','create')));
create policy hospital_proc_packages_staff_update on public.hospital_procurement_packages
for update to authenticated using ((select public.has_permission('hospital-projects','edit')))
with check ((select public.has_permission('hospital-projects','edit')));
create policy hospital_proc_packages_staff_delete on public.hospital_procurement_packages
for delete to authenticated using ((select public.has_permission('hospital-projects','delete')));

create policy hospital_proc_package_items_staff_select on public.hospital_procurement_package_items
for select to authenticated using ((select public.has_permission('hospital-projects','view')));
create policy hospital_proc_package_items_staff_insert on public.hospital_procurement_package_items
for insert to authenticated with check ((select public.has_permission('hospital-projects','create')));
create policy hospital_proc_package_items_staff_update on public.hospital_procurement_package_items
for update to authenticated using ((select public.has_permission('hospital-projects','edit')))
with check ((select public.has_permission('hospital-projects','edit')));
create policy hospital_proc_package_items_staff_delete on public.hospital_procurement_package_items
for delete to authenticated using ((select public.has_permission('hospital-projects','delete')));

create policy hospital_proc_package_charges_staff_select on public.hospital_procurement_package_charges
for select to authenticated using ((select public.has_permission('hospital-projects','view')));
create policy hospital_proc_package_charges_staff_insert on public.hospital_procurement_package_charges
for insert to authenticated with check ((select public.has_permission('hospital-projects','create')));
create policy hospital_proc_package_charges_staff_update on public.hospital_procurement_package_charges
for update to authenticated using ((select public.has_permission('hospital-projects','edit')))
with check ((select public.has_permission('hospital-projects','edit')));
create policy hospital_proc_package_charges_staff_delete on public.hospital_procurement_package_charges
for delete to authenticated using ((select public.has_permission('hospital-projects','delete')));

create policy hospital_proc_package_taxes_staff_select on public.hospital_procurement_package_taxes
for select to authenticated using ((select public.has_permission('hospital-projects','view')));
create policy hospital_proc_package_taxes_staff_insert on public.hospital_procurement_package_taxes
for insert to authenticated with check ((select public.has_permission('hospital-projects','create')));
create policy hospital_proc_package_taxes_staff_update on public.hospital_procurement_package_taxes
for update to authenticated using ((select public.has_permission('hospital-projects','edit')))
with check ((select public.has_permission('hospital-projects','edit')));
create policy hospital_proc_package_taxes_staff_delete on public.hospital_procurement_package_taxes
for delete to authenticated using ((select public.has_permission('hospital-projects','delete')));

grant select,insert,update,delete on public.hospital_procurement_packages to authenticated;
grant select,insert,update,delete on public.hospital_procurement_package_items to authenticated;
grant select,insert,update,delete on public.hospital_procurement_package_charges to authenticated;
grant select,insert,update,delete on public.hospital_procurement_package_taxes to authenticated;

create or replace view public.hospital_procurement_package_register
with (security_invoker=true) as
with item_totals as (
  select li.package_id,
    coalesce(sum(li.quantity*li.vendor_unit_price-li.vendor_discount),0)::numeric(16,2) vendor_items_subtotal,
    coalesce(sum(li.quantity*li.client_unit_price-li.client_discount),0)::numeric(16,2) client_items_subtotal,
    coalesce(sum((li.quantity*li.vendor_unit_price-li.vendor_discount)*li.gst_rate/100),0)::numeric(16,2) vendor_item_gst,
    coalesce(sum((li.quantity*li.client_unit_price-li.client_discount)*li.gst_rate/100),0)::numeric(16,2) client_item_gst,
    count(*)::integer item_count
  from public.hospital_procurement_package_items li group by li.package_id
), charge_totals as (
  select c.package_id,
    coalesce(sum(c.vendor_amount),0)::numeric(16,2) vendor_charges_subtotal,
    coalesce(sum(c.client_amount),0)::numeric(16,2) client_charges_subtotal,
    coalesce(sum(c.vendor_amount*c.gst_rate/100),0)::numeric(16,2) vendor_charge_gst,
    coalesce(sum(c.client_amount*c.gst_rate/100),0)::numeric(16,2) client_charge_gst
  from public.hospital_procurement_package_charges c group by c.package_id
), other_taxes as (
  select t.package_id,
    coalesce(sum(case when t.applies_to in ('vendor','both') and t.effect='additive' then t.tax_amount else 0 end),0)::numeric(16,2) vendor_tax_additions,
    coalesce(sum(case when t.applies_to in ('vendor','both') and t.effect='deduction' then t.tax_amount else 0 end),0)::numeric(16,2) vendor_tax_deductions,
    coalesce(sum(case when t.applies_to in ('client','both') and t.effect='additive' then t.tax_amount else 0 end),0)::numeric(16,2) client_tax_additions,
    coalesce(sum(case when t.applies_to in ('client','both') and t.effect='deduction' then t.tax_amount else 0 end),0)::numeric(16,2) client_tax_deductions
  from public.hospital_procurement_package_taxes t group by t.package_id
), totals as (
  select p.*,
    coalesce(i.vendor_items_subtotal,0) vendor_items_subtotal,
    coalesce(i.client_items_subtotal,0) client_items_subtotal,
    coalesce(c.vendor_charges_subtotal,0) vendor_charges_subtotal,
    coalesce(c.client_charges_subtotal,0) client_charges_subtotal,
    coalesce(i.item_count,0) item_count,
    case when p.tax_mode='common' then round((coalesce(i.vendor_items_subtotal,0)+coalesce(c.vendor_charges_subtotal,0))*p.common_gst_rate/100,2)
      else round(coalesce(i.vendor_item_gst,0)+coalesce(c.vendor_charge_gst,0),2) end vendor_gst,
    case when p.tax_mode='common' then round((coalesce(i.client_items_subtotal,0)+coalesce(c.client_charges_subtotal,0))*p.common_gst_rate/100,2)
      else round(coalesce(i.client_item_gst,0)+coalesce(c.client_charge_gst,0),2) end client_gst,
    coalesce(o.vendor_tax_additions,0) vendor_tax_additions,
    coalesce(o.vendor_tax_deductions,0) vendor_tax_deductions,
    coalesce(o.client_tax_additions,0) client_tax_additions,
    coalesce(o.client_tax_deductions,0) client_tax_deductions
  from public.hospital_procurement_packages p
  left join item_totals i on i.package_id=p.id
  left join charge_totals c on c.package_id=p.id
  left join other_taxes o on o.package_id=p.id
)
select t.id,t.division_id,t.project_id,t.vendor_id,t.package_number,t.vendor_quote_number,t.quote_date,
  t.valid_until,t.expected_delivery,t.place_of_supply,t.tax_mode,t.common_gst_rate,t.status,t.notes,
  t.item_count,t.vendor_items_subtotal,t.client_items_subtotal,t.vendor_charges_subtotal,t.client_charges_subtotal,
  t.vendor_gst,t.client_gst,t.vendor_tax_additions,t.vendor_tax_deductions,t.client_tax_additions,t.client_tax_deductions,
  round(t.vendor_items_subtotal+t.vendor_charges_subtotal+t.vendor_gst+t.vendor_tax_additions-t.vendor_tax_deductions+t.vendor_round_off,2) vendor_package_total,
  round(t.client_items_subtotal+t.client_charges_subtotal+t.client_gst+t.client_tax_additions-t.client_tax_deductions+t.client_round_off,2) client_package_total,
  round((t.client_items_subtotal+t.client_charges_subtotal)-(t.vendor_items_subtotal+t.vendor_charges_subtotal),2) margin_amount,
  t.vendor_round_off,t.client_round_off,t.created_by,t.created_at,t.updated_at,
  v.vendor_code,v.legal_name vendor_name
from totals t join public.hospital_vendors v on v.id=t.vendor_id;

grant select on public.hospital_procurement_package_register to authenticated;

-- Preserve existing priced records by moving their commercial values into one
-- draft package per project/vendor. Prior landed cost is intentionally kept as
-- one package-level legacy charge; it is not guessed as transport or installation.
insert into public.hospital_procurement_packages(
  division_id,project_id,vendor_id,package_number,tax_mode,common_gst_rate,status,notes
)
select p.division_id,i.project_id,i.vendor_id,
  'HSP/PROC/MIG/'||upper(substr(md5(i.project_id::text||':'||i.vendor_id::text),1,10)),
  'common',0,'draft','Migrated from the earlier item-level procurement register'
from public.hospital_procurement_items i
join public.hospital_projects p on p.id=i.project_id
where i.vendor_id is not null and (i.vendor_unit_cost>0 or i.landed_unit_cost>0 or i.client_unit_price>0)
group by p.division_id,i.project_id,i.vendor_id
on conflict(package_number) do nothing;

insert into public.hospital_procurement_package_items(
  package_id,procurement_item_id,quantity,unit,vendor_unit_price,client_unit_price,gst_rate
)
select p.id,i.id,i.quantity,i.unit,i.vendor_unit_cost,i.client_unit_price,0
from public.hospital_procurement_items i
join public.hospital_procurement_packages p on p.package_number=
  'HSP/PROC/MIG/'||upper(substr(md5(i.project_id::text||':'||i.vendor_id::text),1,10))
where i.vendor_id is not null and (i.vendor_unit_cost>0 or i.landed_unit_cost>0 or i.client_unit_price>0)
on conflict(package_id,procurement_item_id) do nothing;

insert into public.hospital_procurement_package_charges(
  package_id,charge_type,description,vendor_amount,client_amount,gst_rate
)
select p.id,'other','Legacy landed cost',round(sum(i.quantity*i.landed_unit_cost),2),0,0
from public.hospital_procurement_items i
join public.hospital_procurement_packages p on p.package_number=
  'HSP/PROC/MIG/'||upper(substr(md5(i.project_id::text||':'||i.vendor_id::text),1,10))
where i.vendor_id is not null and i.landed_unit_cost>0
group by p.id
having sum(i.quantity*i.landed_unit_cost)>0;
