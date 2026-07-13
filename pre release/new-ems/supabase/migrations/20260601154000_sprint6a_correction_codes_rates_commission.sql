-- Sprint 6A correction: auto codes + rate dimensions + truck-agent commission mapping

alter table public.transport_rate_master add column if not exists truck_owner_id uuid references public.transport_truck_owners(id);
alter table public.transport_rate_master add column if not exists truck_id uuid references public.transport_trucks(id);
alter table public.transport_rate_master add column if not exists agent_id uuid references public.master_agents(id);

create table if not exists public.transport_truck_agent_commission_mapping (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  code text,
  name text,
  truck_id uuid not null references public.transport_trucks(id),
  agent_id uuid not null references public.master_agents(id),
  commission_type text not null check (commission_type in ('per_mt','percentage_margin','fixed_per_trip')),
  commission_value numeric(12,3) not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_code_sequences (
  key text primary key,
  yymm text not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_transport_code(p_key text, p_prefix text)
returns text
language plpgsql
as $$
declare v_yymm text; v_seq integer;
begin
  v_yymm := to_char(current_date, 'YYMM');
  insert into public.transport_code_sequences(key, yymm, last_seq)
  values (p_key || ':' || v_yymm, v_yymm, 1)
  on conflict (key)
  do update set last_seq = public.transport_code_sequences.last_seq + 1, updated_at = now()
  returning last_seq into v_seq;
  return p_prefix || v_yymm || lpad(v_seq::text, 3, '0');
end;
$$;

create or replace function public.derive_truck_code(p_reg text)
returns text
language plpgsql
as $$
declare v text; m text[];
begin
  if p_reg is null then return null; end if;
  v := upper(regexp_replace(p_reg, '[^A-Z0-9]', '', 'g'));
  m := regexp_match(v, '^[A-Z]{2}[0-9]{2}([A-Z]{2})([0-9]{4})$');
  if m is null then return null; end if;
  return m[1] || '-' || m[2];
end;
$$;

create or replace function public.before_ins_transport_owners_code()
returns trigger language plpgsql as $$ begin
  if coalesce(new.code,'') = '' then new.code := public.next_transport_code('owner','OW'); end if; return new;
end $$;
drop trigger if exists trg_before_ins_transport_owners_code on public.transport_truck_owners;
create trigger trg_before_ins_transport_owners_code before insert on public.transport_truck_owners for each row execute function public.before_ins_transport_owners_code();

create or replace function public.before_ins_transport_trucks_code()
returns trigger language plpgsql as $$ begin
  if coalesce(new.code,'') = '' then
    new.code := coalesce(public.derive_truck_code(new.registration_no), public.next_transport_code('truck','TK'));
  end if;
  return new;
end $$;
drop trigger if exists trg_before_ins_transport_trucks_code on public.transport_trucks;
create trigger trg_before_ins_transport_trucks_code before insert on public.transport_trucks for each row execute function public.before_ins_transport_trucks_code();

create or replace function public.before_ins_master_clients_code()
returns trigger language plpgsql as $$ begin if coalesce(new.code,'')='' then new.code := public.next_transport_code('client','CL'); end if; return new; end $$;
drop trigger if exists trg_before_ins_master_clients_code on public.master_clients;
create trigger trg_before_ins_master_clients_code before insert on public.master_clients for each row execute function public.before_ins_master_clients_code();

create or replace function public.before_ins_master_transporters_code()
returns trigger language plpgsql as $$ begin if coalesce(new.code,'')='' then new.code := public.next_transport_code('transporter','TP'); end if; return new; end $$;
drop trigger if exists trg_before_ins_master_transporters_code on public.master_transporters;
create trigger trg_before_ins_master_transporters_code before insert on public.master_transporters for each row execute function public.before_ins_master_transporters_code();

create or replace function public.before_ins_transport_drivers_code()
returns trigger language plpgsql as $$ begin if coalesce(new.code,'')='' then new.code := public.next_transport_code('driver','DR'); end if; return new; end $$;
drop trigger if exists trg_before_ins_transport_drivers_code on public.transport_drivers;
create trigger trg_before_ins_transport_drivers_code before insert on public.transport_drivers for each row execute function public.before_ins_transport_drivers_code();

create or replace function public.before_ins_transport_routes_code()
returns trigger language plpgsql as $$ begin if coalesce(new.code,'')='' then new.code := public.next_transport_code('route','RT'); end if; return new; end $$;
drop trigger if exists trg_before_ins_transport_routes_code on public.transport_route_master;
create trigger trg_before_ins_transport_routes_code before insert on public.transport_route_master for each row execute function public.before_ins_transport_routes_code();