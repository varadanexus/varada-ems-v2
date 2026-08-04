-- Date-coded Hospital procurement package numbers.
-- Format: HSP/PROC/FY/DDMMYYNN, where NN is the package sequence for that date.

create temporary table _hospital_procurement_number_map on commit drop as
with ranked as (
  select
    p.id,
    p.package_number as old_number,
    coalesce(p.quote_date, p.created_at::date) as number_date,
    row_number() over (
      partition by coalesce(p.quote_date, p.created_at::date)
      order by p.created_at, p.id
    ) as daily_number
  from public.hospital_procurement_packages p
)
select
  id,
  old_number,
  'HSP/PROC/' || public.hospital_fiscal_year(number_date) || '/' ||
    to_char(number_date, 'DDMMYY') || lpad(daily_number::text, 2, '0') as new_number,
  daily_number
from ranked;

do $$
begin
  if exists(select 1 from _hospital_procurement_number_map where daily_number > 99) then
    raise exception 'Hospital procurement package numbering supports a maximum of 99 packages per date';
  end if;
end;
$$;

-- Use a temporary collision-free value before assigning final unique numbers.
update public.hospital_procurement_packages p
set package_number = 'HSP/PROC/TMP/' || replace(p.id::text, '-', '')
from _hospital_procurement_number_map m
where p.id = m.id and p.package_number is distinct from m.new_number;

update public.hospital_procurement_packages p
set package_number = m.new_number
from _hospital_procurement_number_map m
where p.id = m.id and p.package_number is distinct from m.new_number;

-- This register stores the package number as its package name.
update public.hospital_project_vendors pv
set package_name = m.new_number
from _hospital_procurement_number_map m
where pv.package_name = m.old_number
  and pv.package_name is distinct from m.new_number;

-- Keep immutable commercial snapshots consistent with the renumbered package.
update public.hospital_procurement_approvals a
set payload_snapshot = jsonb_set(a.payload_snapshot, '{package,number}', to_jsonb(m.new_number), true)
from _hospital_procurement_number_map m
where a.package_id = m.id
  and a.payload_snapshot #>> '{package,number}' is distinct from m.new_number;

update public.hospital_purchase_orders po
set payload_snapshot = jsonb_set(po.payload_snapshot, '{package,number}', to_jsonb(m.new_number), true)
from _hospital_procurement_number_map m
where po.package_id = m.id
  and po.payload_snapshot #>> '{package,number}' is distinct from m.new_number;

create or replace function public.hospital_next_document_number(
  p_document_type text,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, current_date);
  v_fy text := public.hospital_fiscal_year(v_date);
  v_no bigint;
  v_prefix text;
  v_date_prefix text;
begin
  if public.hospital_actor_kind() <> 'staff' then
    raise exception 'Hospital staff access required';
  end if;
  if p_document_type not in ('PROJECT','INVOICE','CREDIT_NOTE','QUERY','VENDOR_BILL','PROCUREMENT_PACKAGE','PROCUREMENT_APPROVAL','PURCHASE_ORDER') then
    raise exception 'Unsupported document type';
  end if;

  if p_document_type = 'PROCUREMENT_PACKAGE' then
    v_date_prefix := 'HSP/PROC/' || v_fy || '/' || to_char(v_date, 'DDMMYY');
    perform pg_advisory_xact_lock(hashtextextended('hospital-procurement-package:' || v_date::text, 0));
    select coalesce(max(
      case when right(p.package_number, 2) ~ '^[0-9]{2}$'
        then right(p.package_number, 2)::integer end
    ), 0) + 1
      into v_no
    from public.hospital_procurement_packages p
    where p.package_number like v_date_prefix || '__';
    if v_no > 99 then
      raise exception 'Hospital procurement package numbering supports a maximum of 99 packages per date';
    end if;
    return v_date_prefix || lpad(v_no::text, 2, '0');
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
    when 'PROCUREMENT_APPROVAL' then 'HSP/PA/'
    when 'PURCHASE_ORDER' then 'HSP/PO/'
    else 'HSP/QRY/'
  end;
  return v_prefix || v_fy || '/' || lpad(v_no::text,5,'0');
end;
$$;

revoke all on function public.hospital_next_document_number(text,date) from public, anon;
grant execute on function public.hospital_next_document_number(text,date) to authenticated, service_role;
