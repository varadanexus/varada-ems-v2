-- Employee portraits are publicly readable only through their public object
-- URL. Only EMS users with user-edit permission can upload or remove objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-verification-photos',
  'employee-verification-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists employee_verification_photo_insert on storage.objects;
create policy employee_verification_photo_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'employee-verification-photos'
  and (public.is_super_admin() or public.has_permission('users','edit'))
);

drop policy if exists employee_verification_photo_delete on storage.objects;
create policy employee_verification_photo_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'employee-verification-photos'
  and (public.is_super_admin() or public.has_permission('users','edit'))
);
