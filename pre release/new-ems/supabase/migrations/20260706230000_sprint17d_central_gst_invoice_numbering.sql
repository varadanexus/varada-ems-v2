-- Sprint 17d: Centralised GST invoice numbering
-- One shared, continuous register across modules: INV/GB/<FY>/<NNN>
-- (e.g. Transportation -> INV/GB/26-27/001, Interiors -> /002, Digital
-- Services -> /003). All modules call next_central_invoice_number().

create table if not exists public.central_invoice_number_sequences (
  financial_year_label text primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.central_invoice_number_sequences enable row level security;
drop policy if exists central_invoice_seq_rw on public.central_invoice_number_sequences;
create policy central_invoice_seq_rw on public.central_invoice_number_sequences
  for all to authenticated using (true) with check (true);

-- Atomic next number in the shared register for the invoice's financial year.
create or replace function public.next_central_invoice_number(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy text;
  v_n integer;
begin
  v_fy := public.get_transport_financial_year_label(coalesce(p_date, current_date));
  insert into public.central_invoice_number_sequences (financial_year_label, last_number)
  values (v_fy, 1)
  on conflict (financial_year_label)
  do update set last_number = public.central_invoice_number_sequences.last_number + 1, updated_at = now()
  returning last_number into v_n;
  return 'INV/GB/' || v_fy || '/' || lpad(v_n::text, 3, '0');
end;
$$;

grant execute on function public.next_central_invoice_number(date) to authenticated;

-- Digital Services draws from the central register.
create or replace function public.ds_next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.next_central_invoice_number(current_date);
end;
$$;

grant execute on function public.ds_next_invoice_number() to authenticated;

-- Transportation GST invoices draw from the same central register, so numbering
-- stays continuous across every module. Signature preserved for existing callers.
create or replace function public.generate_transport_gst_invoice_no(p_division_id uuid, p_invoice_date date)
returns text
language plpgsql
as $$
begin
  if p_invoice_date is null then raise exception 'invoice_date is required'; end if;
  return public.next_central_invoice_number(p_invoice_date);
end;
$$;

-- Interiors bills draw from the same central register, keeping numbering
-- continuous across Transportation, Interiors, and Digital Services.
create or replace function public.next_interior_bill_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.next_central_invoice_number(current_date);
end;
$$;

grant execute on function public.next_interior_bill_number() to authenticated;
