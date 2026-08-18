-- Hospital Projects quotations: let staff choose whether the branded PDF
-- includes the signature/company-stamp block, and refresh the register view
-- so the new column is visible to the app (views freeze their column list at
-- (re)definition time in Postgres, so a plain "add column" is not enough).

alter table public.hospital_quotations
  add column if not exists include_signature boolean not null default true;

drop function if exists public.hospital_save_quotation(uuid,uuid,date,date,text,text,text,text,numeric,jsonb);

create or replace function public.hospital_save_quotation(
  p_quotation_id uuid, p_project_id uuid, p_quotation_date date, p_valid_until date,
  p_subject text, p_place_of_supply text, p_terms_conditions text, p_notes text,
  p_round_off numeric, p_lines jsonb, p_include_signature boolean default true
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
    insert into public.hospital_quotations(division_id,project_id,client_id,quotation_number,quotation_date,valid_until,subject,place_of_supply,terms_conditions,notes,round_off,status,include_signature)
    values(v_project.division_id,v_project.id,v_project.client_id,public.hospital_next_document_number('QUOTATION',coalesce(p_quotation_date,current_date)),coalesce(p_quotation_date,current_date),p_valid_until,nullif(btrim(p_subject),''),nullif(btrim(p_place_of_supply),''),nullif(btrim(p_terms_conditions),''),nullif(btrim(p_notes),''),coalesce(p_round_off,0),'draft',coalesce(p_include_signature,true))
    returning * into v_quotation;
  else
    select * into v_quotation from public.hospital_quotations where id=p_quotation_id and project_id=p_project_id for update;
    if v_quotation.id is null then raise exception 'Quotation not found'; end if;
    if v_quotation.status<>'draft' then raise exception 'Only a draft quotation can be edited'; end if;
    update public.hospital_quotations set quotation_date=coalesce(p_quotation_date,current_date),valid_until=p_valid_until,subject=nullif(btrim(p_subject),''),place_of_supply=nullif(btrim(p_place_of_supply),''),terms_conditions=nullif(btrim(p_terms_conditions),''),notes=nullif(btrim(p_notes),''),round_off=coalesce(p_round_off,0),include_signature=coalesce(p_include_signature,true),updated_at=now() where id=v_quotation.id;
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

revoke all on function public.hospital_save_quotation(uuid,uuid,date,date,text,text,text,text,numeric,jsonb,boolean) from public, anon;
grant execute on function public.hospital_save_quotation(uuid,uuid,date,date,text,text,text,text,numeric,jsonb,boolean) to authenticated;

-- CREATE OR REPLACE VIEW cannot reorder/rename existing output columns, and
-- adding include_signature to hospital_quotations shifts every column that
-- q.* expands to after it (p.project_code onward), so the view must be
-- dropped and recreated rather than replaced in place.
drop view if exists public.hospital_quotation_register;
create view public.hospital_quotation_register with (security_invoker=true) as
select q.*, p.project_code, p.title as project_title, c.hospital_name, c.client_code
from public.hospital_quotations q
join public.hospital_projects p on p.id=q.project_id
join public.hospital_clients c on c.id=q.client_id;
grant select on public.hospital_quotation_register to authenticated;
