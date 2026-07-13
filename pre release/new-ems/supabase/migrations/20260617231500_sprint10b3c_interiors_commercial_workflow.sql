-- Sprint 10B.3C: Interiors commercial workflow
-- Adds workflow fields, totals support, and quotation release outcomes.

create extension if not exists pgcrypto;

alter table if exists public.interior_boq_headers
  add column if not exists total_amount numeric(14,2) not null default 0;

alter table if exists public.interior_boq_lines
  add column if not exists unit_rate numeric(14,2) not null default 0,
  add column if not exists line_amount numeric(14,2) not null default 0;

alter table if exists public.interior_quotation_headers
  drop constraint if exists interior_quotation_headers_status_check;

alter table if exists public.interior_quotation_headers
  add constraint interior_quotation_headers_status_check
  check (status in ('draft', 'released', 'accepted', 'rejected', 'approved', 'superseded', 'archived'));

create or replace function public.recalc_interior_boq_header_total(p_boq_header_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interior_boq_headers h
  set total_amount = coalesce((
        select round(sum(coalesce(l.line_amount, 0))::numeric, 2)
        from public.interior_boq_lines l
        where l.boq_header_id = h.id
      ), 0),
      updated_at = now()
  where h.id = p_boq_header_id;
end;
$$;

create or replace function public.recalc_interior_estimate_header_total(p_estimate_header_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interior_estimate_headers h
  set total_amount = coalesce((
        select round(sum(coalesce(l.line_amount, 0))::numeric, 2)
        from public.interior_estimate_lines l
        where l.estimate_header_id = h.id
      ), 0),
      updated_at = now()
  where h.id = p_estimate_header_id;
end;
$$;

create or replace function public.recalc_interior_quotation_header_total(p_quotation_header_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.interior_quotation_headers h
  set total_amount = coalesce((
        select round(sum(coalesce(l.line_amount, 0))::numeric, 2)
        from public.interior_quotation_lines l
        where l.quotation_header_id = h.id
      ), 0),
      updated_at = now()
  where h.id = p_quotation_header_id;
end;
$$;

create or replace function public.handle_interior_boq_line_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_header_id uuid;
begin
  if tg_op <> 'DELETE' then
    new.line_amount := round((coalesce(new.quantity, 0) * coalesce(new.unit_rate, 0))::numeric, 2);
    new.updated_at := now();
    return new;
  end if;

  return old;
end;
$$;

create or replace function public.handle_interior_boq_line_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_header_id uuid;
begin
  v_header_id := case when tg_op = 'DELETE' then old.boq_header_id else new.boq_header_id end;
  perform public.recalc_interior_boq_header_total(v_header_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.handle_interior_estimate_line_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' then
    new.line_amount := round((coalesce(new.quantity, 0) * coalesce(new.unit_rate, 0))::numeric, 2);
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

create or replace function public.handle_interior_estimate_line_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_header_id uuid;
begin
  v_header_id := case when tg_op = 'DELETE' then old.estimate_header_id else new.estimate_header_id end;
  perform public.recalc_interior_estimate_header_total(v_header_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.handle_interior_quotation_line_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' then
    new.line_amount := round((coalesce(new.quantity, 0) * coalesce(new.unit_rate, 0))::numeric, 2);
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

create or replace function public.handle_interior_quotation_line_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_header_id uuid;
begin
  v_header_id := case when tg_op = 'DELETE' then old.quotation_header_id else new.quotation_header_id end;
  perform public.recalc_interior_quotation_header_total(v_header_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

grant execute on function public.recalc_interior_boq_header_total(uuid) to authenticated;
grant execute on function public.recalc_interior_estimate_header_total(uuid) to authenticated;
grant execute on function public.recalc_interior_quotation_header_total(uuid) to authenticated;

drop trigger if exists trg_interior_boq_line_amounts on public.interior_boq_lines;
create trigger trg_interior_boq_line_amounts
before insert or update on public.interior_boq_lines
for each row execute function public.handle_interior_boq_line_amounts();

drop trigger if exists trg_interior_boq_line_totals on public.interior_boq_lines;
create trigger trg_interior_boq_line_totals
after insert or update or delete on public.interior_boq_lines
for each row execute function public.handle_interior_boq_line_totals();

drop trigger if exists trg_interior_estimate_line_amounts on public.interior_estimate_lines;
create trigger trg_interior_estimate_line_amounts
before insert or update on public.interior_estimate_lines
for each row execute function public.handle_interior_estimate_line_amounts();

drop trigger if exists trg_interior_estimate_line_totals on public.interior_estimate_lines;
create trigger trg_interior_estimate_line_totals
after insert or update or delete on public.interior_estimate_lines
for each row execute function public.handle_interior_estimate_line_totals();

drop trigger if exists trg_interior_quotation_line_amounts on public.interior_quotation_lines;
create trigger trg_interior_quotation_line_amounts
before insert or update on public.interior_quotation_lines
for each row execute function public.handle_interior_quotation_line_amounts();

drop trigger if exists trg_interior_quotation_line_totals on public.interior_quotation_lines;
create trigger trg_interior_quotation_line_totals
after insert or update or delete on public.interior_quotation_lines
for each row execute function public.handle_interior_quotation_line_totals();