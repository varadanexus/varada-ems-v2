-- Reopen the customer test verification that was approved accidentally.
-- The historical reviewer fields and prior note are retained; the appended note
-- records why the approval was reversed.
update public.whatsapp_platform_business_verifications v
set status = 'in_review',
    review_notes = concat_ws(E'\n', nullif(v.review_notes, ''),
      '[System] Accidental approval reopened at the customer administrator''s request on 19 Aug 2026.'),
    updated_at = now()
from public.whatsapp_platform_tenants t
where t.id = v.tenant_id
  and lower(trim(t.name)) = 'varada nexus private limited'
  and v.status = 'verified';

update public.whatsapp_platform_tenants
set verification_status = 'in_review',
    verified_at = null,
    updated_at = now()
where lower(trim(name)) = 'varada nexus private limited'
  and verification_status = 'verified';

notify pgrst, 'reload schema';
