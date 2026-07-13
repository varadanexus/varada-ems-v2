-- Internal tax and address details for firms and freelance delivery partners.
alter table public.marketing_vendors
  add column if not exists gstin text,
  add column if not exists pan text,
  add column if not exists legal_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text;

alter table public.marketing_vendors
  drop constraint if exists marketing_vendors_gstin_format_check,
  drop constraint if exists marketing_vendors_pan_format_check,
  drop constraint if exists marketing_vendors_postal_code_format_check;

alter table public.marketing_vendors
  add constraint marketing_vendors_gstin_format_check
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
  add constraint marketing_vendors_pan_format_check
    check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  add constraint marketing_vendors_postal_code_format_check
    check (postal_code is null or postal_code ~ '^[0-9]{6}$');

comment on column public.marketing_vendors.gstin is 'Optional Indian GST registration number.';
comment on column public.marketing_vendors.pan is 'Indian Permanent Account Number; internal compliance data.';
comment on column public.marketing_vendors.legal_address is 'Registered or residential address used for vendor compliance.';
