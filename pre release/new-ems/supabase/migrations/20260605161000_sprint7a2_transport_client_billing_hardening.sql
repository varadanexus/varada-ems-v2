-- Sprint 7A.2: Client Billing hardening lifecycle + approval metadata

alter table public.transport_client_bills
  add column if not exists approved_at timestamptz;

update public.transport_client_bills
set status = 'draft'
where status = 'generated';

alter table public.transport_client_bills
  alter column status set default 'draft';

alter table public.transport_client_bills
  drop constraint if exists chk_transport_client_bills_status;

alter table public.transport_client_bills
  add constraint chk_transport_client_bills_status
  check (status in ('draft', 'approved', 'cancelled'));