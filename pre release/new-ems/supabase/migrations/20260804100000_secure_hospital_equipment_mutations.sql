-- Equipment mutations are permission-specific. The former FOR ALL policy used
-- the view permission as its USING clause, which also governed DELETE.

drop policy if exists hospital_procurement_staff_all on public.hospital_procurement_items;

create policy hospital_procurement_staff_select
on public.hospital_procurement_items
for select to authenticated
using (public.has_permission('hospital-projects','view'));

create policy hospital_procurement_staff_insert
on public.hospital_procurement_items
for insert to authenticated
with check (public.has_permission('hospital-projects','create'));

create policy hospital_procurement_staff_update
on public.hospital_procurement_items
for update to authenticated
using (public.has_permission('hospital-projects','edit'))
with check (public.has_permission('hospital-projects','edit'));

create policy hospital_procurement_staff_delete
on public.hospital_procurement_items
for delete to authenticated
using (public.has_permission('hospital-projects','delete'));
