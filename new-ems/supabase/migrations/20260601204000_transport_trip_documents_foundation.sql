-- Transportation Trip Document Foundation (metadata only, no file storage integration)

create table if not exists public.transport_trip_documents (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  trip_id uuid not null references public.transport_trips(id),
  document_type text not null,
  custom_document_name text,
  original_file_name text,
  stored_file_name text,
  file_url text,
  file_size bigint,
  mime_type text,
  remarks text,
  is_mandatory boolean not null default false,
  is_uploaded boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_transport_trip_documents_trip_id on public.transport_trip_documents(trip_id);
create index if not exists idx_transport_trip_documents_document_type on public.transport_trip_documents(document_type);
create index if not exists idx_transport_trip_documents_deleted_at on public.transport_trip_documents(deleted_at);

create or replace function public.before_ins_upd_transport_trip_documents_normalize()
returns trigger
language plpgsql
as $$
declare
  v_trip_no text;
  v_base text;
begin
  if new.document_type is null then
    raise exception 'document_type is required';
  end if;

  new.document_type := upper(new.document_type);
  if new.document_type not in ('WEIGHT_BILL','TRIP_SHEET','INVOICE_COPY','EWAY_BILL','POD','LOADING_SLIP','UNLOADING_SLIP','OTHER') then
    raise exception 'unsupported document_type %', new.document_type;
  end if;

  if new.document_type = 'OTHER' and coalesce(btrim(new.custom_document_name), '') = '' then
    raise exception 'custom_document_name is required for OTHER';
  end if;

  new.is_mandatory := (new.document_type = 'WEIGHT_BILL');

  select trip_no into v_trip_no from public.transport_trips where id = new.trip_id;
  if v_trip_no is null then
    raise exception 'invalid trip_id';
  end if;

  v_base := case when new.document_type = 'OTHER' then coalesce(new.custom_document_name,'OTHER') else new.document_type end;
  v_base := upper(regexp_replace(v_base, '[^A-Za-z0-9]', '', 'g'));
  if coalesce(v_base, '') = '' then v_base := 'DOC'; end if;
  new.stored_file_name := v_base || '-' || v_trip_no;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_before_ins_upd_transport_trip_documents_normalize on public.transport_trip_documents;
create trigger trg_before_ins_upd_transport_trip_documents_normalize
before insert or update on public.transport_trip_documents
for each row execute function public.before_ins_upd_transport_trip_documents_normalize();

create or replace function public.before_upd_transport_trips_require_weight_bill()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('completed','financial_review') and new.status is distinct from old.status then
    if not exists (
      select 1
      from public.transport_trip_documents d
      where d.trip_id = new.id
        and d.document_type = 'WEIGHT_BILL'
        and d.deleted_at is null
        and d.is_active = true
    ) then
      raise exception 'WEIGHT_BILL is required before moving trip to completed/financial_review';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_before_upd_transport_trips_require_weight_bill on public.transport_trips;
create trigger trg_before_upd_transport_trips_require_weight_bill
before update on public.transport_trips
for each row execute function public.before_upd_transport_trips_require_weight_bill();

alter table public.transport_trip_documents enable row level security;
do $$ begin
  create policy transport_trip_documents_auth_rw on public.transport_trip_documents
  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
