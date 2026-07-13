-- Sprint 6C.1: Transportation Financial Snapshot (non-destructive)

alter table public.transport_trips
  add column if not exists client_rate_per_mt numeric(12,3),
  add column if not exists transporter_rate_per_mt numeric(12,3),
  add column if not exists client_gross_amount numeric(14,2),
  add column if not exists transporter_gross_amount numeric(14,2),
  add column if not exists company_margin numeric(14,2),
  add column if not exists client_rate_source text,
  add column if not exists transporter_rate_source text;

do $$ begin
  alter table public.transport_trips
    add constraint chk_transport_trips_client_rate_source
    check (client_rate_source is null or client_rate_source in ('RATE_MASTER','MANUAL_OVERRIDE'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.transport_trips
    add constraint chk_transport_trips_transporter_rate_source
    check (transporter_rate_source is null or transporter_rate_source in ('RATE_MASTER','MANUAL_OVERRIDE'));
exception when duplicate_object then null; end $$;

create or replace function public.recalc_transport_trip_financials()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.quantity_kg, 0) <= 0 and coalesce(new.quantity_mt, 0) <= 0 then
    raise exception 'Trip quantity must be greater than 0';
  end if;

  if coalesce(new.quantity_kg, 0) > 0 then
    new.quantity_mt := round((new.quantity_kg / 1000.0)::numeric, 3);
  elsif coalesce(new.quantity_mt, 0) > 0 then
    new.quantity_kg := round((new.quantity_mt * 1000.0)::numeric, 3);
  end if;

  if coalesce(new.client_rate_per_mt, 0) < 0 then
    raise exception 'client_rate_per_mt must be >= 0';
  end if;

  if coalesce(new.transporter_rate_per_mt, 0) < 0 then
    raise exception 'transporter_rate_per_mt must be >= 0';
  end if;

  new.client_gross_amount := round((coalesce(new.quantity_mt,0) * coalesce(new.client_rate_per_mt,0))::numeric, 2);
  new.transporter_gross_amount := round((coalesce(new.quantity_mt,0) * coalesce(new.transporter_rate_per_mt,0))::numeric, 2);
  new.company_margin := round((coalesce(new.client_gross_amount,0) - coalesce(new.transporter_gross_amount,0))::numeric, 2);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_recalc_transport_trip_financials on public.transport_trips;
do $$
begin
  if to_regclass('public.transport_trips') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'quantity_kg'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'quantity_mt'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'client_rate_per_mt'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'transporter_rate_per_mt'
     ) then
    create trigger trg_recalc_transport_trip_financials
    before insert or update of quantity_kg, quantity_mt, client_rate_per_mt, transporter_rate_per_mt
    on public.transport_trips
    for each row execute function public.recalc_transport_trip_financials();
  else
    raise notice 'Skipping trg_recalc_transport_trip_financials creation: transport_trips or required trigger columns are missing';
  end if;
end $$;

-- Backfill existing rows safely
do $$
begin
  if to_regclass('public.transport_trips') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transport_trips'
      and column_name = 'company_rate_per_mt'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'client_rate_per_mt'
  ) then
    execute $sql$
      update public.transport_trips
      set client_rate_per_mt = coalesce(client_rate_per_mt, company_rate_per_mt)
      where client_rate_per_mt is null
    $sql$;
  else
    raise notice 'Skipping transport_trips client rate backfill: required columns are missing';
  end if;
end $$;

do $$
begin
  if to_regclass('public.transport_trips') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='client_rate_source') then
    update public.transport_trips
    set client_rate_source = coalesce(client_rate_source, 'RATE_MASTER')
    where client_rate_source is null;
  else
    raise notice 'Skipping transport_trips client_rate_source backfill: required column is missing';
  end if;
end $$;

do $$
begin
  if to_regclass('public.transport_trips') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='transporter_rate_source') then
    update public.transport_trips
    set transporter_rate_source = coalesce(transporter_rate_source, 'RATE_MASTER')
    where transporter_rate_source is null;
  else
    raise notice 'Skipping transport_trips transporter_rate_source backfill: required column is missing';
  end if;
end $$;

do $$
begin
  if to_regclass('public.transport_trips') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='quantity_kg')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='quantity_mt') then
    update public.transport_trips
    set quantity_kg = quantity_mt * 1000
    where quantity_kg is null and quantity_mt is not null;
  else
    raise notice 'Skipping transport_trips quantity_kg backfill: required columns are missing';
  end if;
end $$;

do $$
begin
  if to_regclass('public.transport_trips') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='quantity_mt')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='client_rate_per_mt')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='transporter_rate_per_mt')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='client_gross_amount')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='transporter_gross_amount')
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='transport_trips' and column_name='company_margin') then
    update public.transport_trips
    set client_gross_amount = round((coalesce(quantity_mt,0) * coalesce(client_rate_per_mt,0))::numeric, 2),
        transporter_gross_amount = round((coalesce(quantity_mt,0) * coalesce(transporter_rate_per_mt,0))::numeric, 2),
        company_margin = round(((coalesce(quantity_mt,0) * coalesce(client_rate_per_mt,0)) - (coalesce(quantity_mt,0) * coalesce(transporter_rate_per_mt,0)))::numeric, 2)
    where true;
  else
    raise notice 'Skipping transport_trips financial snapshot backfill: required columns are missing';
  end if;
end $$;
