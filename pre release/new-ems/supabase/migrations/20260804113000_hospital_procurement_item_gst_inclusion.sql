-- Item prices are GST-exclusive by default. When gst_included is selected,
-- the taxable base and GST are extracted from the entered line value.

alter table public.hospital_procurement_package_items
  add column gst_included boolean not null default false;

comment on column public.hospital_procurement_package_items.gst_included is
  'False: GST is added to entered prices. True: entered prices already include GST.';

create or replace view public.hospital_procurement_package_register
with (security_invoker=true) as
with line_values as (
  select li.package_id,
    greatest(li.quantity*li.vendor_unit_price-li.vendor_discount,0)::numeric vendor_entered,
    greatest(li.quantity*li.client_unit_price-li.client_discount,0)::numeric client_entered,
    case when p.tax_mode='common' then p.common_gst_rate else li.gst_rate end::numeric effective_gst_rate,
    li.gst_included
  from public.hospital_procurement_package_items li
  join public.hospital_procurement_packages p on p.id=li.package_id
), item_totals as (
  select lv.package_id,
    coalesce(sum(case when lv.gst_included and lv.effective_gst_rate>0 then round(lv.vendor_entered*100/(100+lv.effective_gst_rate),2) else lv.vendor_entered end),0)::numeric(16,2) vendor_items_subtotal,
    coalesce(sum(case when lv.gst_included and lv.effective_gst_rate>0 then round(lv.client_entered*100/(100+lv.effective_gst_rate),2) else lv.client_entered end),0)::numeric(16,2) client_items_subtotal,
    coalesce(sum(case when lv.gst_included and lv.effective_gst_rate>0 then lv.vendor_entered-round(lv.vendor_entered*100/(100+lv.effective_gst_rate),2) else round(lv.vendor_entered*lv.effective_gst_rate/100,2) end),0)::numeric(16,2) vendor_item_gst,
    coalesce(sum(case when lv.gst_included and lv.effective_gst_rate>0 then lv.client_entered-round(lv.client_entered*100/(100+lv.effective_gst_rate),2) else round(lv.client_entered*lv.effective_gst_rate/100,2) end),0)::numeric(16,2) client_item_gst,
    count(*)::integer item_count
  from line_values lv group by lv.package_id
), charge_values as (
  select c.package_id,c.vendor_amount,c.client_amount,
    case when p.tax_mode='common' then p.common_gst_rate else c.gst_rate end::numeric effective_gst_rate
  from public.hospital_procurement_package_charges c
  join public.hospital_procurement_packages p on p.id=c.package_id
), charge_totals as (
  select cv.package_id,
    coalesce(sum(cv.vendor_amount),0)::numeric(16,2) vendor_charges_subtotal,
    coalesce(sum(cv.client_amount),0)::numeric(16,2) client_charges_subtotal,
    coalesce(sum(round(cv.vendor_amount*cv.effective_gst_rate/100,2)),0)::numeric(16,2) vendor_charge_gst,
    coalesce(sum(round(cv.client_amount*cv.effective_gst_rate/100,2)),0)::numeric(16,2) client_charge_gst
  from charge_values cv group by cv.package_id
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
    round(coalesce(i.vendor_item_gst,0)+coalesce(c.vendor_charge_gst,0),2) vendor_gst,
    round(coalesce(i.client_item_gst,0)+coalesce(c.client_charge_gst,0),2) client_gst,
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

create or replace function public.hospital_normalize_procurement_snapshot_items()
returns trigger language plpgsql security definer set search_path=public as $$
declare pkg public.hospital_procurement_package_register; items jsonb; totals jsonb; is_client boolean;
begin
  select * into pkg from public.hospital_procurement_package_register where id=new.package_id;
  if pkg.id is null then raise exception 'Procurement package not found'; end if;
  is_client:=tg_table_name='hospital_procurement_approvals';
  select coalesce(jsonb_agg(jsonb_build_object(
    'name',i.equipment_name,'makeModel',i.make_model,'specification',i.specification,
    'quantity',li.quantity,'unit',li.unit,
    'unitPrice',case when is_client then li.client_unit_price else li.vendor_unit_price end,
    'discount',case when is_client then li.client_discount else li.vendor_discount end,
    'hsnSac',li.hsn_sac,'gstRate',case when pkg.tax_mode='common' then pkg.common_gst_rate else li.gst_rate end,
    'gstIncluded',li.gst_included,
    'taxableAmount',case
      when li.gst_included and (case when pkg.tax_mode='common' then pkg.common_gst_rate else li.gst_rate end)>0
      then round((li.quantity*(case when is_client then li.client_unit_price else li.vendor_unit_price end)-(case when is_client then li.client_discount else li.vendor_discount end))*100/(100+(case when pkg.tax_mode='common' then pkg.common_gst_rate else li.gst_rate end)),2)
      else round(li.quantity*(case when is_client then li.client_unit_price else li.vendor_unit_price end)-(case when is_client then li.client_discount else li.vendor_discount end),2)
    end
  ) order by li.created_at),'[]'::jsonb) into items
  from public.hospital_procurement_package_items li
  join public.hospital_procurement_items i on i.id=li.procurement_item_id
  where li.package_id=new.package_id;
  totals:=case when is_client then jsonb_build_object(
    'itemsSubtotal',pkg.client_items_subtotal,'chargesSubtotal',pkg.client_charges_subtotal,
    'gst',pkg.client_gst,'additions',pkg.client_tax_additions,'deductions',pkg.client_tax_deductions,
    'roundOff',pkg.client_round_off,'grandTotal',pkg.client_package_total
  ) else jsonb_build_object(
    'itemsSubtotal',pkg.vendor_items_subtotal,'chargesSubtotal',pkg.vendor_charges_subtotal,
    'gst',pkg.vendor_gst,'additions',pkg.vendor_tax_additions,'deductions',pkg.vendor_tax_deductions,
    'roundOff',pkg.vendor_round_off,'grandTotal',pkg.vendor_package_total
  ) end;
  new.payload_snapshot:=jsonb_set(jsonb_set(new.payload_snapshot,'{items}',items,true),'{totals}',totals,true);
  if is_client then new.client_total_snapshot:=pkg.client_package_total;
  else new.vendor_total_snapshot:=pkg.vendor_package_total;
  end if;
  return new;
end $$;

revoke all on function public.hospital_normalize_procurement_snapshot_items() from public,anon,authenticated;

create trigger trg_hospital_approval_normalize_items
before insert or update of payload_snapshot,package_id on public.hospital_procurement_approvals
for each row execute function public.hospital_normalize_procurement_snapshot_items();

create trigger trg_hospital_po_normalize_items
before insert or update of payload_snapshot,package_id on public.hospital_purchase_orders
for each row execute function public.hospital_normalize_procurement_snapshot_items();

-- Normalize any snapshots created before this migration.
update public.hospital_procurement_approvals set payload_snapshot=payload_snapshot;
update public.hospital_purchase_orders set payload_snapshot=payload_snapshot;

create or replace function public.hospital_guard_procurement_package_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.hospital_procurement_approvals where package_id=old.id)
    or exists(select 1 from public.hospital_purchase_orders where package_id=old.id) then
    raise exception 'A package with client approval history or a purchase order cannot be deleted';
  end if;
  return old;
end $$;

revoke all on function public.hospital_guard_procurement_package_delete() from public,anon,authenticated;
create trigger trg_hospital_procurement_package_delete_guard
before delete on public.hospital_procurement_packages
for each row execute function public.hospital_guard_procurement_package_delete();
