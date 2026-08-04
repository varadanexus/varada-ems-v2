-- Cover foreign keys used by procurement joins, deletes, and audit lookups.
create index if not exists idx_hospital_procurement_items_vendor
  on public.hospital_procurement_items(vendor_id);
create index if not exists idx_hospital_procurement_items_work_package
  on public.hospital_procurement_items(work_package_id);
create index if not exists idx_hospital_procurement_items_created_by
  on public.hospital_procurement_items(created_by);
create index if not exists idx_hospital_proc_packages_division
  on public.hospital_procurement_packages(division_id);
create index if not exists idx_hospital_proc_packages_created_by
  on public.hospital_procurement_packages(created_by);
