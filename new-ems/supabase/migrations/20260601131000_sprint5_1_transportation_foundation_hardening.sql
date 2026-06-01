-- Sprint 5.1 hardening constraints (Phase 1 only)

create unique index if not exists uq_transport_trucks_division_registration_active
on public.transport_trucks (division_id, registration_no)
where deleted_at is null and registration_no is not null;

create unique index if not exists uq_transport_route_master_division_code_active
on public.transport_route_master (division_id, code)
where deleted_at is null;