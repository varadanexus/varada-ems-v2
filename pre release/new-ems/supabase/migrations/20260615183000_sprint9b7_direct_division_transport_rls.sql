-- Sprint 9B.7: Direct division transportation RLS hardening
-- Scope limited to direct-division tables only.
-- No join-based child tables in this migration.

alter table public.transport_trips enable row level security;
alter table public.transport_trip_documents enable row level security;
alter table public.transport_trip_expenses enable row level security;
alter table public.transport_client_bills enable row level security;
alter table public.transport_client_credit_notes enable row level security;
alter table public.transport_client_receipts enable row level security;
alter table public.transport_gst_invoices enable row level security;
alter table public.transport_transporter_statements enable row level security;
alter table public.transport_transporter_payments enable row level security;
alter table public.transport_ledger_accounts enable row level security;
alter table public.transport_ledger_entries enable row level security;

drop policy if exists transport_trips_auth_rw on public.transport_trips;
drop policy if exists transport_trip_documents_auth_rw on public.transport_trip_documents;
drop policy if exists transport_trip_expenses_auth_rw on public.transport_trip_expenses;
drop policy if exists transport_client_bills_auth_rw on public.transport_client_bills;
drop policy if exists transport_client_credit_notes_auth_rw on public.transport_client_credit_notes;
drop policy if exists transport_client_receipts_auth_rw on public.transport_client_receipts;
drop policy if exists transport_gst_invoices_auth_rw on public.transport_gst_invoices;
drop policy if exists transport_transporter_statements_auth_rw on public.transport_transporter_statements;
drop policy if exists transport_transporter_payments_auth_rw on public.transport_transporter_payments;
drop policy if exists transport_ledger_accounts_auth_rw on public.transport_ledger_accounts;
drop policy if exists transport_ledger_entries_auth_rw on public.transport_ledger_entries;

drop policy if exists transport_trips_select_hardened on public.transport_trips;
drop policy if exists transport_trips_insert_hardened on public.transport_trips;
drop policy if exists transport_trips_update_hardened on public.transport_trips;
drop policy if exists transport_trips_delete_hardened on public.transport_trips;

create policy transport_trips_select_hardened on public.transport_trips
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trips_insert_hardened on public.transport_trips
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trips_update_hardened on public.transport_trips
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trips_delete_hardened on public.transport_trips
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trip_documents_select_hardened on public.transport_trip_documents;
drop policy if exists transport_trip_documents_insert_hardened on public.transport_trip_documents;
drop policy if exists transport_trip_documents_update_hardened on public.transport_trip_documents;
drop policy if exists transport_trip_documents_delete_hardened on public.transport_trip_documents;

create policy transport_trip_documents_select_hardened on public.transport_trip_documents
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trip_documents_insert_hardened on public.transport_trip_documents
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trip_documents_update_hardened on public.transport_trip_documents
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trip_documents_delete_hardened on public.transport_trip_documents
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trips', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_trip_expenses_select_hardened on public.transport_trip_expenses;
drop policy if exists transport_trip_expenses_insert_hardened on public.transport_trip_expenses;
drop policy if exists transport_trip_expenses_update_hardened on public.transport_trip_expenses;
drop policy if exists transport_trip_expenses_delete_hardened on public.transport_trip_expenses;

create policy transport_trip_expenses_select_hardened on public.transport_trip_expenses
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trip_expenses_insert_hardened on public.transport_trip_expenses
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trip_expenses_update_hardened on public.transport_trip_expenses
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_trip_expenses_delete_hardened on public.transport_trip_expenses
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-trip-expenses', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_client_bills_select_hardened on public.transport_client_bills;
drop policy if exists transport_client_bills_insert_hardened on public.transport_client_bills;
drop policy if exists transport_client_bills_update_hardened on public.transport_client_bills;

create policy transport_client_bills_select_hardened on public.transport_client_bills
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_client_bills_insert_hardened on public.transport_client_bills
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_client_bills_update_hardened on public.transport_client_bills
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-billing', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_client_credit_notes_select_hardened on public.transport_client_credit_notes;
drop policy if exists transport_client_credit_notes_insert_hardened on public.transport_client_credit_notes;
drop policy if exists transport_client_credit_notes_update_hardened on public.transport_client_credit_notes;

create policy transport_client_credit_notes_select_hardened on public.transport_client_credit_notes
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-credit-notes', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_client_credit_notes_insert_hardened on public.transport_client_credit_notes
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-credit-notes', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_client_credit_notes_update_hardened on public.transport_client_credit_notes
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-credit-notes', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-credit-notes', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_client_receipts_select_hardened on public.transport_client_receipts;
drop policy if exists transport_client_receipts_insert_hardened on public.transport_client_receipts;
drop policy if exists transport_client_receipts_update_hardened on public.transport_client_receipts;

create policy transport_client_receipts_select_hardened on public.transport_client_receipts
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-receipts', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_client_receipts_insert_hardened on public.transport_client_receipts
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-receipts', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_client_receipts_update_hardened on public.transport_client_receipts
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-receipts', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-client-receipts', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_gst_invoices_select_hardened on public.transport_gst_invoices;
drop policy if exists transport_gst_invoices_insert_hardened on public.transport_gst_invoices;
drop policy if exists transport_gst_invoices_update_hardened on public.transport_gst_invoices;

create policy transport_gst_invoices_select_hardened on public.transport_gst_invoices
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-gst-invoices', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_gst_invoices_insert_hardened on public.transport_gst_invoices
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-gst-invoices', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_gst_invoices_update_hardened on public.transport_gst_invoices
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-gst-invoices', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-gst-invoices', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_transporter_statements_select_hardened on public.transport_transporter_statements;
drop policy if exists transport_transporter_statements_insert_hardened on public.transport_transporter_statements;
drop policy if exists transport_transporter_statements_update_hardened on public.transport_transporter_statements;
drop policy if exists transport_transporter_statements_delete_hardened on public.transport_transporter_statements;

create policy transport_transporter_statements_select_hardened on public.transport_transporter_statements
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_transporter_statements_insert_hardened on public.transport_transporter_statements
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_transporter_statements_update_hardened on public.transport_transporter_statements
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_transporter_statements_delete_hardened on public.transport_transporter_statements
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-statements', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_transporter_payments_select_hardened on public.transport_transporter_payments;
drop policy if exists transport_transporter_payments_insert_hardened on public.transport_transporter_payments;
drop policy if exists transport_transporter_payments_update_hardened on public.transport_transporter_payments;

create policy transport_transporter_payments_select_hardened on public.transport_transporter_payments
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-payments', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_transporter_payments_insert_hardened on public.transport_transporter_payments
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-payments', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_transporter_payments_update_hardened on public.transport_transporter_payments
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-payments', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-transporter-payments', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_ledger_accounts_select_hardened on public.transport_ledger_accounts;
drop policy if exists transport_ledger_accounts_insert_hardened on public.transport_ledger_accounts;
drop policy if exists transport_ledger_accounts_update_hardened on public.transport_ledger_accounts;
drop policy if exists transport_ledger_accounts_delete_hardened on public.transport_ledger_accounts;

create policy transport_ledger_accounts_select_hardened on public.transport_ledger_accounts
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-ledger', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_ledger_accounts_insert_hardened on public.transport_ledger_accounts
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-ledger', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_ledger_accounts_update_hardened on public.transport_ledger_accounts
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-ledger', 'edit')
    and public.has_division_access_by_id(division_id)
  )
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-ledger', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_ledger_accounts_delete_hardened on public.transport_ledger_accounts
for delete to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-ledger', 'edit')
    and public.has_division_access_by_id(division_id)
  )
);

drop policy if exists transport_ledger_entries_select_hardened on public.transport_ledger_entries;
drop policy if exists transport_ledger_entries_insert_hardened on public.transport_ledger_entries;
drop policy if exists transport_ledger_entries_update_hardened on public.transport_ledger_entries;

create policy transport_ledger_entries_select_hardened on public.transport_ledger_entries
for select to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-ledger', 'view')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_ledger_entries_insert_hardened on public.transport_ledger_entries
for insert to authenticated
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
  or (
    public.has_permission('transport-finance-posting', 'post')
    and public.has_division_access_by_id(division_id)
  )
);

create policy transport_ledger_entries_update_hardened on public.transport_ledger_entries
for update to authenticated
using (
  public.is_super_admin()
  or public.has_role_code('admin')
)
with check (
  public.is_super_admin()
  or public.has_role_code('admin')
);