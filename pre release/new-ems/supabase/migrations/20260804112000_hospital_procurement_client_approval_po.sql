-- Revisioned client approval and vendor purchase-order workflow for Hospital procurement.

alter table public.hospital_document_sequences
  drop constraint if exists hospital_document_sequences_document_type_check;
alter table public.hospital_document_sequences
  add constraint hospital_document_sequences_document_type_check
  check (document_type in (
    'PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL','PROCUREMENT_PACKAGE',
    'PROCUREMENT_APPROVAL','PURCHASE_ORDER'
  ));

create table public.hospital_procurement_approvals (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  client_id uuid not null references public.hospital_clients(id) on delete restrict,
  package_id uuid not null references public.hospital_procurement_packages(id) on delete cascade,
  approval_number text not null unique,
  revision_no integer not null check (revision_no > 0),
  status text not null default 'pending' check (status in ('pending','approved','revision_requested','rejected','withdrawn')),
  client_total_snapshot numeric(16,2) not null check (client_total_snapshot >= 0),
  payload_snapshot jsonb not null,
  terms text,
  sent_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_remarks text,
  decided_by_portal_user_id uuid references public.external_portal_users(id) on delete set null,
  requested_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, revision_no)
);

create table public.hospital_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete restrict,
  project_id uuid not null references public.hospital_projects(id) on delete cascade,
  vendor_id uuid not null references public.hospital_vendors(id) on delete restrict,
  package_id uuid not null unique references public.hospital_procurement_packages(id) on delete restrict,
  approval_id uuid not null references public.hospital_procurement_approvals(id) on delete restrict,
  po_number text not null unique,
  po_date date not null default current_date,
  expected_delivery date,
  status text not null default 'issued' check (status in ('draft','issued','acknowledged','cancelled','completed')),
  vendor_total_snapshot numeric(16,2) not null check (vendor_total_snapshot >= 0),
  payload_snapshot jsonb not null,
  terms text,
  created_by uuid references public.app_users(id) on delete set null default public.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index hospital_procurement_one_pending_approval
  on public.hospital_procurement_approvals(package_id) where status='pending';
create index hospital_procurement_approvals_client_status
  on public.hospital_procurement_approvals(client_id,status,sent_at desc);
create index hospital_procurement_approvals_project
  on public.hospital_procurement_approvals(project_id,created_at desc);
create index hospital_purchase_orders_project
  on public.hospital_purchase_orders(project_id,created_at desc);
create index hospital_purchase_orders_vendor
  on public.hospital_purchase_orders(vendor_id,status);

create trigger trg_hospital_procurement_approvals_touch before update on public.hospital_procurement_approvals
for each row execute function public.touch_interior_entity_updated_at();
create trigger trg_hospital_purchase_orders_touch before update on public.hospital_purchase_orders
for each row execute function public.touch_interior_entity_updated_at();

alter table public.hospital_procurement_approvals enable row level security;
alter table public.hospital_purchase_orders enable row level security;

create policy hospital_procurement_approvals_staff_select on public.hospital_procurement_approvals
for select to authenticated using ((select public.has_permission('hospital-projects','view')));
create policy hospital_procurement_approvals_staff_insert on public.hospital_procurement_approvals
for insert to authenticated with check ((select public.has_permission('hospital-projects','create')));
create policy hospital_procurement_approvals_staff_update on public.hospital_procurement_approvals
for update to authenticated using ((select public.has_permission('hospital-projects','edit')))
with check ((select public.has_permission('hospital-projects','edit')));
create policy hospital_purchase_orders_staff_select on public.hospital_purchase_orders
for select to authenticated using ((select public.has_permission('hospital-projects','view')));
create policy hospital_purchase_orders_staff_insert on public.hospital_purchase_orders
for insert to authenticated with check ((select public.has_permission('hospital-projects','create')));
create policy hospital_purchase_orders_staff_update on public.hospital_purchase_orders
for update to authenticated using ((select public.has_permission('hospital-projects','edit')))
with check ((select public.has_permission('hospital-projects','edit')));

grant select,insert,update on public.hospital_procurement_approvals to authenticated;
grant select,insert,update on public.hospital_purchase_orders to authenticated;

create or replace function public.hospital_next_document_number(p_document_type text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare v_fy text := public.hospital_fiscal_year(p_date); v_no bigint; v_prefix text;
begin
  if public.hospital_actor_kind() <> 'staff' then raise exception 'Hospital staff access required'; end if;
  if p_document_type not in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL','PROCUREMENT_PACKAGE','PROCUREMENT_APPROVAL','PURCHASE_ORDER') then
    raise exception 'Unsupported document type';
  end if;
  insert into public.hospital_document_sequences(scope_code,document_type,fiscal_year,last_number)
  values ('HOSPITAL_PROJECTS',p_document_type,v_fy,1)
  on conflict (scope_code,document_type,fiscal_year) do update
    set last_number=public.hospital_document_sequences.last_number+1,updated_at=now()
  returning last_number into v_no;
  v_prefix := case p_document_type
    when 'PROJECT' then 'HSP/PRJ/' when 'INVOICE' then 'HSP/INV/'
    when 'CREDIT_NOTE' then 'HSP/CN/' when 'VENDOR_BILL' then 'HSP/VB/'
    when 'PROCUREMENT_PACKAGE' then 'HSP/PROC/' when 'PROCUREMENT_APPROVAL' then 'HSP/PA/'
    when 'PURCHASE_ORDER' then 'HSP/PO/' else 'HSP/QRY/' end;
  return v_prefix || v_fy || '/' || lpad(v_no::text,5,'0');
end $$;

create or replace function public.hospital_submit_procurement_for_approval(p_package_id uuid,p_terms text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pkg public.hospital_procurement_package_register; prj public.hospital_projects; cli public.hospital_clients;
  approval public.hospital_procurement_approvals; revision integer; approval_no text; snapshot jsonb;
begin
  if not public.has_permission('hospital-projects','create') then raise exception 'Hospital procurement create permission required'; end if;
  select * into pkg from public.hospital_procurement_package_register where id=p_package_id;
  if pkg.id is null then raise exception 'Procurement package not found'; end if;
  if pkg.item_count=0 or pkg.client_package_total<=0 then raise exception 'Add client pricing before sending for approval'; end if;
  if exists(select 1 from public.hospital_procurement_approvals where package_id=p_package_id and status='pending') then
    raise exception 'This package already has a pending client approval';
  end if;
  if exists(select 1 from public.hospital_procurement_approvals where package_id=p_package_id and status='approved') then
    raise exception 'This package has already been approved';
  end if;
  select * into prj from public.hospital_projects where id=pkg.project_id;
  select * into cli from public.hospital_clients where id=prj.client_id;
  select coalesce(max(revision_no),0)+1 into revision from public.hospital_procurement_approvals where package_id=p_package_id;
  approval_no:=public.hospital_next_document_number('PROCUREMENT_APPROVAL',current_date);
  snapshot:=jsonb_build_object(
    'approvalNumber',approval_no,'revisionNo',revision,'generatedAt',now(),
    'project',jsonb_build_object('id',prj.id,'code',prj.project_code,'title',prj.title,'location',prj.location),
    'client',jsonb_build_object('id',cli.id,'code',cli.client_code,'name',cli.hospital_name,'billingAddress',cli.billing_address,'gstin',cli.gstin),
    'package',jsonb_build_object('id',pkg.id,'number',pkg.package_number,'validUntil',pkg.valid_until,'expectedDelivery',pkg.expected_delivery,'placeOfSupply',pkg.place_of_supply,'taxMode',pkg.tax_mode,'commonGstRate',pkg.common_gst_rate,'notes',pkg.notes),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',i.equipment_name,'makeModel',i.make_model,'specification',i.specification,'quantity',li.quantity,'unit',li.unit,
      'unitPrice',li.client_unit_price,'discount',li.client_discount,'hsnSac',li.hsn_sac,
      'gstRate',case when pkg.tax_mode='common' then pkg.common_gst_rate else li.gst_rate end,
      'taxableAmount',round(li.quantity*li.client_unit_price-li.client_discount,2)
    ) order by li.created_at) from public.hospital_procurement_package_items li join public.hospital_procurement_items i on i.id=li.procurement_item_id where li.package_id=pkg.id),'[]'::jsonb),
    'charges',coalesce((select jsonb_agg(jsonb_build_object(
      'type',c.charge_type,'description',c.description,'amount',c.client_amount,'hsnSac',c.hsn_sac,
      'gstRate',case when pkg.tax_mode='common' then pkg.common_gst_rate else c.gst_rate end
    ) order by c.created_at) from public.hospital_procurement_package_charges c where c.package_id=pkg.id and c.client_amount>0),'[]'::jsonb),
    'otherTaxes',coalesce((select jsonb_agg(jsonb_build_object('name',t.tax_name,'effect',t.effect,'taxableBase',t.taxable_base,'rate',t.tax_rate,'amount',t.tax_amount,'notes',t.notes) order by t.created_at) from public.hospital_procurement_package_taxes t where t.package_id=pkg.id and t.applies_to in ('client','both')),'[]'::jsonb),
    'totals',jsonb_build_object('itemsSubtotal',pkg.client_items_subtotal,'chargesSubtotal',pkg.client_charges_subtotal,'gst',pkg.client_gst,'additions',pkg.client_tax_additions,'deductions',pkg.client_tax_deductions,'roundOff',pkg.client_round_off,'grandTotal',pkg.client_package_total),
    'terms',nullif(btrim(coalesce(p_terms,'')),'')
  );
  insert into public.hospital_procurement_approvals(division_id,project_id,client_id,package_id,approval_number,revision_no,client_total_snapshot,payload_snapshot,terms)
  values(pkg.division_id,pkg.project_id,prj.client_id,pkg.id,approval_no,revision,pkg.client_package_total,snapshot,nullif(btrim(coalesce(p_terms,'')),'')) returning * into approval;
  return jsonb_build_object('id',approval.id,'approval_number',approval.approval_number,'revision_no',approval.revision_no,'status',approval.status);
end $$;

-- The package status vocabulary predates client approval; approval state remains in its own register.
create or replace function public.hospital_portal_decide_procurement(p_session_token text,p_approval_id uuid,p_decision text,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx record; approval public.hospital_procurement_approvals;
begin
  select * into ctx from public.hospital_portal_context(p_session_token);
  if ctx.portal_user_id is null or ctx.party_kind<>'client' then raise exception 'Valid Hospital client portal access required'; end if;
  if p_decision not in ('approved','revision_requested','rejected') then raise exception 'Invalid procurement decision'; end if;
  select * into approval from public.hospital_procurement_approvals where id=p_approval_id and client_id=ctx.party_id for update;
  if approval.id is null then raise exception 'Procurement approval access denied'; end if;
  if approval.status<>'pending' then raise exception 'This procurement revision has already been decided'; end if;
  if p_decision<>'approved' and nullif(btrim(coalesce(p_remarks,'')),'') is null then raise exception 'Please enter a reason'; end if;
  update public.hospital_procurement_approvals set status=p_decision,decided_at=now(),decision_remarks=nullif(btrim(coalesce(p_remarks,'')),''),decided_by_portal_user_id=ctx.portal_user_id where id=approval.id;
  if p_decision='approved' then update public.hospital_procurement_packages set status='approved' where id=approval.package_id; end if;
  return jsonb_build_object('id',approval.id,'status',p_decision);
end $$;

create or replace function public.hospital_create_purchase_order(p_package_id uuid,p_po_date date default current_date,p_terms text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pkg public.hospital_procurement_package_register; approval public.hospital_procurement_approvals; po public.hospital_purchase_orders; po_no text; snapshot jsonb;
begin
  if not public.has_permission('hospital-projects','create') then raise exception 'Hospital procurement create permission required'; end if;
  select * into pkg from public.hospital_procurement_package_register where id=p_package_id;
  if pkg.id is null then raise exception 'Procurement package not found'; end if;
  select * into approval from public.hospital_procurement_approvals where package_id=p_package_id and status='approved' order by revision_no desc limit 1;
  if approval.id is null then raise exception 'Client approval is required before creating a purchase order'; end if;
  select * into po from public.hospital_purchase_orders where package_id=p_package_id;
  if po.id is not null then return jsonb_build_object('id',po.id,'po_number',po.po_number,'status',po.status,'existing',true); end if;
  po_no:=public.hospital_next_document_number('PURCHASE_ORDER',coalesce(p_po_date,current_date));
  snapshot:=jsonb_build_object(
    'poNumber',po_no,'poDate',coalesce(p_po_date,current_date),'approvalNumber',approval.approval_number,
    'project',(approval.payload_snapshot->'project'),
    'vendor',jsonb_build_object('id',pkg.vendor_id,'code',pkg.vendor_code,'name',pkg.vendor_name),
    'package',jsonb_build_object('id',pkg.id,'number',pkg.package_number,'quoteReference',pkg.vendor_quote_number,'expectedDelivery',pkg.expected_delivery,'placeOfSupply',pkg.place_of_supply,'taxMode',pkg.tax_mode,'commonGstRate',pkg.common_gst_rate),
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.equipment_name,'makeModel',i.make_model,'specification',i.specification,'quantity',li.quantity,'unit',li.unit,'unitPrice',li.vendor_unit_price,'discount',li.vendor_discount,'hsnSac',li.hsn_sac,'gstRate',case when pkg.tax_mode='common' then pkg.common_gst_rate else li.gst_rate end,'taxableAmount',round(li.quantity*li.vendor_unit_price-li.vendor_discount,2)) order by li.created_at) from public.hospital_procurement_package_items li join public.hospital_procurement_items i on i.id=li.procurement_item_id where li.package_id=pkg.id),'[]'::jsonb),
    'charges',coalesce((select jsonb_agg(jsonb_build_object('type',c.charge_type,'description',c.description,'amount',c.vendor_amount,'hsnSac',c.hsn_sac,'gstRate',case when pkg.tax_mode='common' then pkg.common_gst_rate else c.gst_rate end) order by c.created_at) from public.hospital_procurement_package_charges c where c.package_id=pkg.id and c.vendor_amount>0),'[]'::jsonb),
    'otherTaxes',coalesce((select jsonb_agg(jsonb_build_object('name',t.tax_name,'effect',t.effect,'taxableBase',t.taxable_base,'rate',t.tax_rate,'amount',t.tax_amount,'notes',t.notes) order by t.created_at) from public.hospital_procurement_package_taxes t where t.package_id=pkg.id and t.applies_to in ('vendor','both')),'[]'::jsonb),
    'totals',jsonb_build_object('itemsSubtotal',pkg.vendor_items_subtotal,'chargesSubtotal',pkg.vendor_charges_subtotal,'gst',pkg.vendor_gst,'additions',pkg.vendor_tax_additions,'deductions',pkg.vendor_tax_deductions,'roundOff',pkg.vendor_round_off,'grandTotal',pkg.vendor_package_total),
    'terms',nullif(btrim(coalesce(p_terms,'')),'')
  );
  insert into public.hospital_purchase_orders(division_id,project_id,vendor_id,package_id,approval_id,po_number,po_date,expected_delivery,vendor_total_snapshot,payload_snapshot,terms)
  values(pkg.division_id,pkg.project_id,pkg.vendor_id,pkg.id,approval.id,po_no,coalesce(p_po_date,current_date),pkg.expected_delivery,pkg.vendor_package_total,snapshot,nullif(btrim(coalesce(p_terms,'')),'')) returning * into po;
  update public.hospital_procurement_packages set status='purchase_order' where id=pkg.id;
  return jsonb_build_object('id',po.id,'po_number',po.po_number,'status',po.status,'existing',false);
end $$;

create or replace view public.hospital_procurement_approval_register with (security_invoker=true) as
select a.*,p.package_number,p.vendor_id,v.legal_name vendor_name,pr.project_code,pr.title project_title,c.hospital_name client_name
from public.hospital_procurement_approvals a
join public.hospital_procurement_packages p on p.id=a.package_id
join public.hospital_vendors v on v.id=p.vendor_id
join public.hospital_projects pr on pr.id=a.project_id
join public.hospital_clients c on c.id=a.client_id;
grant select on public.hospital_procurement_approval_register to authenticated;

create or replace view public.hospital_purchase_order_register with (security_invoker=true) as
select o.*,p.package_number,v.vendor_code,v.legal_name vendor_name,pr.project_code,pr.title project_title,a.approval_number
from public.hospital_purchase_orders o
join public.hospital_procurement_packages p on p.id=o.package_id
join public.hospital_vendors v on v.id=o.vendor_id
join public.hospital_projects pr on pr.id=o.project_id
join public.hospital_procurement_approvals a on a.id=o.approval_id;
grant select on public.hospital_purchase_order_register to authenticated;

-- Wrap the established portal snapshot so approval data is only appended for the owning client.
alter function public.hospital_portal_snapshot(text) rename to hospital_portal_snapshot_base;
revoke all on function public.hospital_portal_snapshot_base(text) from public,anon,authenticated;
create or replace function public.hospital_portal_snapshot(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx record; result jsonb;
begin
  select * into ctx from public.hospital_portal_context(p_session_token);
  if ctx.portal_user_id is null then raise exception 'Hospital portal session is invalid or has expired'; end if;
  result:=public.hospital_portal_snapshot_base(p_session_token);
  return result || jsonb_build_object('procurementApprovals',case when ctx.party_kind='client' then coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'approvalNumber',a.approval_number,'revisionNo',a.revision_no,'status',a.status,'clientTotal',a.client_total_snapshot,'snapshot',a.payload_snapshot,'sentAt',a.sent_at,'decidedAt',a.decided_at,'remarks',a.decision_remarks) order by a.sent_at desc)
    from public.hospital_procurement_approvals a where a.client_id=ctx.party_id
  ),'[]'::jsonb) else '[]'::jsonb end);
end $$;

revoke all on function public.hospital_submit_procurement_for_approval(uuid,text) from public,anon;
grant execute on function public.hospital_submit_procurement_for_approval(uuid,text) to authenticated,service_role;
revoke all on function public.hospital_create_purchase_order(uuid,date,text) from public,anon;
grant execute on function public.hospital_create_purchase_order(uuid,date,text) to authenticated,service_role;
revoke all on function public.hospital_portal_decide_procurement(text,uuid,text,text) from public;
grant execute on function public.hospital_portal_decide_procurement(text,uuid,text,text) to anon,authenticated;
revoke all on function public.hospital_portal_snapshot(text) from public;
grant execute on function public.hospital_portal_snapshot(text) to anon,authenticated;
