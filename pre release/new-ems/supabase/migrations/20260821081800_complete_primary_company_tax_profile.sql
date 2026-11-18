-- Complete the centralized legal identity used by every EMS statutory document.
-- The WhatsApp billing PDF snapshots this record when an invoice is issued.

insert into public.company_tax_profiles (
  company_key,
  legal_name,
  trade_name,
  entity_type,
  pan,
  cin,
  registered_address,
  city,
  state_code,
  pincode,
  updated_at
)
values (
  'PRIMARY',
  'Varada Nexus Private Limited',
  'Varada Nexus',
  'private_limited',
  'AAKCV7495B',
  'U43121AP2025PTC117741',
  'D.No. 80-17-28, K.B. Nagar, A.V.A. Road',
  'Rajahmundry, East Godavari',
  '37',
  '533101',
  now()
)
on conflict (company_key) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  entity_type = excluded.entity_type,
  pan = excluded.pan,
  cin = excluded.cin,
  registered_address = excluded.registered_address,
  city = excluded.city,
  state_code = excluded.state_code,
  pincode = excluded.pincode,
  updated_at = now();

insert into public.company_gst_registrations (
  company_key,
  gstin,
  registration_name,
  state_code,
  state_name,
  registration_type,
  filing_frequency,
  is_primary,
  is_active,
  updated_at
)
values (
  'PRIMARY',
  '37AAKCV7495B1ZV',
  'Varada Nexus Private Limited',
  '37',
  'Andhra Pradesh',
  'regular',
  'monthly',
  true,
  true,
  now()
)
on conflict (gstin) do update set
  registration_name = excluded.registration_name,
  state_code = excluded.state_code,
  state_name = excluded.state_name,
  registration_type = excluded.registration_type,
  filing_frequency = excluded.filing_frequency,
  is_primary = true,
  is_active = true,
  updated_at = now();

update public.company_gst_registrations
set is_primary = false, updated_at = now()
where company_key = 'PRIMARY'
  and gstin <> '37AAKCV7495B1ZV'
  and is_primary = true;
