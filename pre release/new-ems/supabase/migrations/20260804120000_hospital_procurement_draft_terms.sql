-- Persist the editable client-facing terms on the procurement package.
-- Approval snapshots remain immutable revision history.

alter table public.hospital_procurement_packages
  add column if not exists client_terms text;

comment on column public.hospital_procurement_packages.client_terms is
  'Editable draft terms and conditions used for the next client proposal revision.';

-- Preserve the latest existing terms as the starting draft for packages that
-- already have an approval history.
update public.hospital_procurement_packages package
set client_terms = latest.terms
from (
  select distinct on (package_id) package_id, terms
  from public.hospital_procurement_approvals
  where nullif(btrim(terms), '') is not null
  order by package_id, revision_no desc
) latest
where package.id = latest.package_id
  and nullif(btrim(package.client_terms), '') is null;
