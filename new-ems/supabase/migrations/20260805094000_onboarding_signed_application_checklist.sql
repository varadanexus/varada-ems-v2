-- Centralised Onboarding — add the "Signed Application Form" required document to
-- every division. The customer generates a letterhead application PDF from the
-- details step, prints/signs/seals it, and uploads it here.

begin;

insert into public.onboarding_document_checklists (division_code, document_key, label, description, is_required, sort_order)
values
  ('hospital-projects','signed_application','Signed Application Form','Print the onboarding application generated from your details, sign it and affix the company seal, then upload the scan here.',true,5),
  ('interiors','signed_application','Signed Application Form','Print the onboarding application generated from your details, sign it and affix the company seal, then upload the scan here.',true,5),
  ('transport','signed_application','Signed Application Form','Print the onboarding application generated from your details, sign it and affix the company seal, then upload the scan here.',true,5),
  ('digital-services','signed_application','Signed Application Form','Print the onboarding application generated from your details, sign it and affix the company seal, then upload the scan here.',true,5)
on conflict (division_code, document_key) do update
set label = excluded.label, description = excluded.description, is_required = excluded.is_required, sort_order = excluded.sort_order, is_active = true;

commit;
