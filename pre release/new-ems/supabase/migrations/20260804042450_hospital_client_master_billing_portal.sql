-- Hospital client master: one authoritative record for project delivery,
-- centralized billing and Portal Access onboarding.

alter table public.hospital_clients
  add column if not exists client_type text not null default 'hospital',
  add column if not exists legal_entity_type text not null default 'other',
  add column if not exists trade_name text,
  add column if not exists business_registration_no text,
  add column if not exists hospital_registration_no text,
  add column if not exists cin_llpin text,
  add column if not exists pan text,
  add column if not exists website text,
  add column if not exists contact_designation text,
  add column if not exists whatsapp_phone text,
  add column if not exists registered_address text,
  add column if not exists registered_city text,
  add column if not exists registered_state text,
  add column if not exists registered_postal_code text,
  add column if not exists registered_country text not null default 'India',
  add column if not exists billing_name text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_contact_designation text,
  add column if not exists billing_email text,
  add column if not exists billing_phone text,
  add column if not exists billing_city text,
  add column if not exists billing_state text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_country text not null default 'India',
  add column if not exists gst_state_code text,
  add column if not exists place_of_supply text,
  add column if not exists tax_treatment text not null default 'unregistered',
  add column if not exists payment_terms_days integer not null default 30,
  add column if not exists credit_limit numeric(16,2) not null default 0,
  add column if not exists purchase_order_required boolean not null default false,
  add column if not exists tds_applicable boolean not null default false,
  add column if not exists invoice_delivery_method text not null default 'email',
  add column if not exists currency_code text not null default 'INR',
  add column if not exists authorized_representative_name text,
  add column if not exists authorized_representative_designation text,
  add column if not exists authorized_representative_email text,
  add column if not exists authorized_representative_phone text,
  add column if not exists authorized_representative_whatsapp text,
  add column if not exists authority_basis text,
  add column if not exists authorization_reference text,
  add column if not exists authorized_signatory boolean not null default false,
  add column if not exists portal_access_required boolean not null default false,
  add column if not exists portal_contact_name text,
  add column if not exists portal_email text,
  add column if not exists portal_phone text,
  add column if not exists portal_preferred_channel text not null default 'email',
  add column if not exists internal_notes text;

alter table public.hospital_clients
  drop constraint if exists hospital_clients_client_type_check,
  add constraint hospital_clients_client_type_check
    check (client_type in ('hospital','hospital_group','company','individual','trust_society','government','other')),
  drop constraint if exists hospital_clients_legal_entity_type_check,
  add constraint hospital_clients_legal_entity_type_check
    check (legal_entity_type in ('private_limited','public_limited','llp','partnership','proprietorship','trust','society','government','individual','other')),
  drop constraint if exists hospital_clients_tax_treatment_check,
  add constraint hospital_clients_tax_treatment_check
    check (tax_treatment in ('registered','unregistered','composition','sez','government','export')),
  drop constraint if exists hospital_clients_payment_terms_check,
  add constraint hospital_clients_payment_terms_check
    check (payment_terms_days between 0 and 365),
  drop constraint if exists hospital_clients_credit_limit_check,
  add constraint hospital_clients_credit_limit_check
    check (credit_limit >= 0),
  drop constraint if exists hospital_clients_invoice_delivery_check,
  add constraint hospital_clients_invoice_delivery_check
    check (invoice_delivery_method in ('email','portal','email_and_portal','physical')),
  drop constraint if exists hospital_clients_portal_channel_check,
  add constraint hospital_clients_portal_channel_check
    check (portal_preferred_channel in ('email','whatsapp','both')),
  drop constraint if exists hospital_clients_portal_contact_check,
  add constraint hospital_clients_portal_contact_check
    check (
      not portal_access_required
      or (
        nullif(btrim(portal_contact_name), '') is not null
        and nullif(btrim(portal_email), '') is not null
        and nullif(btrim(portal_phone), '') is not null
      )
    );

comment on column public.hospital_clients.portal_email is
  'Credential email/username proposed to centralized Portal Access; Portal Access remains the only login provisioning service.';
comment on column public.hospital_clients.authority_basis is
  'Basis on which an organizational representative is authorized, such as director, board resolution, power of attorney or authorization letter.';

-- Preserve explicit Data API access after altering the existing RLS-protected table.
grant select, insert, update, delete on public.hospital_clients to authenticated;

notify pgrst, 'reload schema';
