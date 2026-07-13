-- Vendors may be registered organisations or individual freelancers. Existing
-- records predate the distinction and remain firms unless explicitly changed.
alter table public.marketing_vendors
  add column if not exists vendor_type text not null default 'firm';

alter table public.marketing_vendors
  drop constraint if exists marketing_vendors_vendor_type_check;

alter table public.marketing_vendors
  add constraint marketing_vendors_vendor_type_check
  check (vendor_type in ('firm', 'freelancer'));

comment on column public.marketing_vendors.vendor_type is
  'Legal vendor classification: firm or freelancer. Client-facing identity remains Varada Nexus.';
