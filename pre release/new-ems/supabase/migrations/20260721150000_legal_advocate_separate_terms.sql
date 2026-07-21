-- Separate, versioned undertaking for external advocates. This is deliberately
-- independent of the general EMS Terms accepted by staff and other portal users.

create table if not exists public.legal_advocate_terms_versions (
  version text primary key,
  title text not null,
  effective_at timestamptz not null default now(),
  sections jsonb not null check (jsonb_typeof(sections) = 'array'),
  acceptance_label text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id)
);

create unique index if not exists uq_legal_advocate_terms_one_active
  on public.legal_advocate_terms_versions(is_active) where is_active;

create table if not exists public.legal_advocate_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.external_portal_users(id) on delete cascade,
  advocate_id uuid not null references public.legal_advocates(id) on delete cascade,
  terms_version text not null references public.legal_advocate_terms_versions(version),
  accepted_at timestamptz not null default clock_timestamp(),
  confirmation_name text not null,
  bar_council_number text not null,
  user_agent text,
  accepted_ip inet,
  device_id text,
  terms_snapshot jsonb not null,
  terms_hash text not null,
  acceptance_metadata jsonb not null default '{}'::jsonb,
  unique(portal_user_id, advocate_id, terms_version)
);

alter table public.legal_advocate_terms_versions enable row level security;
alter table public.legal_advocate_terms_acceptances enable row level security;
revoke all on public.legal_advocate_terms_versions, public.legal_advocate_terms_acceptances from anon, authenticated;

update public.legal_advocate_terms_versions set is_active=false where is_active;
insert into public.legal_advocate_terms_versions(version,title,effective_at,sections,acceptance_label,is_active)
values (
  'ADV-2026-07-21-v1',
  'External Advocate Access, Confidentiality and Professional Responsibility Undertaking',
  '2026-07-21 00:00:00+05:30',
  jsonb_build_array(
    jsonb_build_object('heading','1. Separate and binding undertaking','body','This undertaking applies only to the Advocate Portal and is separate from the general website or EMS terms. It supplements every engagement letter, confidentiality obligation and professional duty. If provisions conflict, applicable law and binding professional duties prevail; otherwise the stricter confidentiality, security and document-control requirement applies.'),
    jsonb_build_object('heading','2. Identity, authority and enrolment','body','You confirm that you are the named advocate or an expressly authorised member of the named legal practice, that the enrolment details entered below are accurate and current, and that you are authorised to access each shared matter. Credentials, OTPs and sessions are personal and may not be shared, delegated or used by clerks, interns, colleagues or third parties unless Varada Nexus has separately provisioned that person.'),
    jsonb_build_object('heading','3. Professional independence and ethical duties','body','Nothing in this portal directs or limits your independent professional judgment or duties to a court, regulator, client or the administration of justice. You must refuse unlawful or improper instructions and comply with the Advocates Act, 1961, Bar Council of India Rules and other binding professional rules. Portal access does not itself appoint, brief or authorise appearance by an advocate.'),
    jsonb_build_object('heading','4. Conflicts and continuing disclosure','body','Before opening or reviewing a matter, you must conduct an appropriate conflict check. You must promptly disclose any actual, potential or perceived conflict, prior involvement, financial interest, relationship or circumstance that may affect independence, and stop accessing the matter until Varada Nexus confirms the permitted course in writing. You must not act for an adverse party in the same or a substantially related matter.'),
    jsonb_build_object('heading','5. Confidentiality, privilege and non-waiver','body','All files, facts, annotations, bookmarks, communications, credentials, work product and metadata are Confidential Information. Use them only for the authorised legal review. Do not disclose them directly or indirectly. Nothing displayed, uploaded, annotated or discussed waives legal professional privilege, confidentiality or work-product protection. These obligations survive expiry, revocation and termination.'),
    jsonb_build_object('heading','6. Restricted use and onward disclosure','body','Access is matter-specific, purpose-limited and on a strict need-to-know basis. You may not copy, forward, photograph, screen-record, scrape, bulk extract, republish, sell, train a model on, or upload material to public or personal AI tools, personal cloud storage, messaging services or unapproved systems. Download, printing or onward sharing is permitted only where the document permission and written instructions expressly allow it and equivalent protections are maintained.'),
    jsonb_build_object('heading','7. Security controls','body','You must use a trusted device, current software, secure network and reasonable endpoint protection; keep the device locked and under your control; and immediately report suspected loss, credential compromise, malware, unauthorised access or disclosure. Do not bypass OTP, watermark, inactivity, access, download, audit or other controls. Watermarks and evidence identifiers must not be removed, obscured or altered.'),
    jsonb_build_object('heading','8. Personal data and sensitive material','body','Process personal data only for the authorised matter, on documented instructions or another lawful basis, and only to the minimum extent necessary. Do not build profiles, reuse contact details, combine portal data with unrelated datasets or retain local copies beyond need. Notify Varada Nexus immediately, and no later than twelve hours after discovery, of any suspected personal-data or security incident, while preserving evidence and cooperating with containment and lawful notifications.'),
    jsonb_build_object('heading','9. Document status and review responsibility','body','Drafts, previews, annotations and status labels are working materials and are not final legal advice, approval, filing instructions or authority to act. You must confirm the current version, completeness, parties, dates, annexures and instructions before relying on a document. Silence, opening a file, adding a bookmark or making an annotation never constitutes approval. Review comments must identify the clause, page or issue clearly and must not knowingly omit a material concern.'),
    jsonb_build_object('heading','10. No unauthorised communications or commitments','body','You must not contact counterparties, clients, witnesses, authorities, vendors or employees, make admissions, settle, incur costs, accept service, issue notices or bind Varada Nexus unless expressly authorised in writing for that step. You must act only on instructions from Varada Nexus or its identified authorised representative, subject always to law and professional duties.'),
    jsonb_build_object('heading','11. Intellectual property and retention','body','Portal access grants a limited, revocable, non-transferable right to review authorised material and no ownership or broader licence. On request, revocation or completion, stop access and securely delete permitted local copies, extracts and backups to the extent technically feasible, except records that law or professional rules require you to retain. Any retained material remains protected and isolated from unrelated use.'),
    jsonb_build_object('heading','12. Audit trail and electronic evidence','body','You consent to security and audit records for login, OTP, IP address, device identifier, timestamps, file access, page position, downloads, annotations, bookmarks, comments and acceptance. These records, electronic communications and integrity hashes may be preserved and used to investigate access, establish chronology and support legal or regulatory proceedings, subject to applicable law.'),
    jsonb_build_object('heading','13. Compelled disclosure','body','If disclosure is required by law, court or regulator, notify Varada Nexus before disclosure where legally permitted, disclose only the minimum required, seek confidential treatment where available and preserve privilege over all remaining material. Nothing requires concealment, destruction of evidence or breach of a lawful obligation.'),
    jsonb_build_object('heading','14. Suspension, breach and remedies','body','Varada Nexus may immediately suspend or revoke access to protect a matter, client, system or legal obligation. You remain responsible for access through your credentials and for loss caused by your breach, fraud, wilful misconduct, gross negligence or unauthorised disclosure, subject to applicable law and professional rules. Varada Nexus may seek injunctive or other lawful relief because unauthorised disclosure may cause irreparable harm.'),
    jsonb_build_object('heading','15. Governing law, jurisdiction and survival','body','This undertaking is governed by Indian law. Subject to mandatory law and the jurisdiction of competent Bar Councils and courts, courts at Rajamahendravaram, Andhra Pradesh have exclusive jurisdiction. Confidentiality, privilege, data protection, audit, return or deletion, liability and dispute provisions survive termination. If a provision is unenforceable, it is limited or severed without affecting the remainder.'),
    jsonb_build_object('heading','16. Electronic acceptance','body','Typing your name and enrolment number, confirming the declarations and selecting Accept creates a time-stamped electronic acceptance linked to your portal identity, session, device and server-observed network information. Do not accept if the identity, authority, scope or terms are inaccurate; contact Varada Nexus for correction before accessing any document.')
  ),
  'I have read and accept the Advocate Portal Undertaking and confirm that the information supplied is accurate.',
  true
)
on conflict (version) do update set
  title=excluded.title,effective_at=excluded.effective_at,sections=excluded.sections,
  acceptance_label=excluded.acceptance_label,is_active=excluded.is_active;

create or replace function public.legal_advocate_portal_identity(p_session_token text)
returns table(portal_user_id uuid,advocate_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_user record; v_session public.external_portal_sessions%rowtype;
begin
  select s.* into v_session from public.external_portal_sessions s
  where s.session_token=p_session_token and s.revoked_at is null and s.expires_at>clock_timestamp() for update;
  if v_session.id is null then raise exception 'Advocate portal session is not valid'; end if;
  if v_session.last_activity_at < clock_timestamp()-interval '30 minutes 30 seconds' then raise exception 'Portal session expired after 30 minutes of inactivity'; end if;
  update public.external_portal_sessions set last_activity_at=clock_timestamp() where id=v_session.id;
  select * into v_user from public.external_portal_validate_session(p_session_token) limit 1;
  if v_user.portal_user_id is null then raise exception 'Advocate portal session is not valid'; end if;
  return query select v_user.portal_user_id,a.record_id from public.external_portal_access a
  join public.legal_advocates v on v.id=a.record_id
  where a.portal_user_id=v_user.portal_user_id and a.source_module='legal' and a.access_scope='legal_advocate_portal'
    and a.record_type='legal_advocates' and a.is_active and (a.expires_at is null or a.expires_at>now()) and v.status='active'
  order by a.granted_at desc limit 1;
end $$;

create or replace function public.legal_advocate_terms_status(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_access record; v_terms public.legal_advocate_terms_versions%rowtype; v_accepted_at timestamptz;
begin
  select * into v_access from public.legal_advocate_portal_identity(p_session_token) limit 1;
  if v_access.advocate_id is null then raise exception 'No active advocate profile is linked to this account'; end if;
  select * into v_terms from public.legal_advocate_terms_versions where is_active limit 1;
  if v_terms.version is null then raise exception 'Advocate terms are not configured'; end if;
  select a.accepted_at into v_accepted_at from public.legal_advocate_terms_acceptances a
    where a.portal_user_id=v_access.portal_user_id and a.advocate_id=v_access.advocate_id and a.terms_version=v_terms.version;
  return jsonb_build_object(
    'version',v_terms.version,'title',v_terms.title,'effective_at',v_terms.effective_at,
    'sections',v_terms.sections,'acceptance_label',v_terms.acceptance_label,
    'accepted',v_accepted_at is not null,'accepted_at',v_accepted_at,
    'profile',(select jsonb_build_object('name',full_name,'firm',firm_name,'bar_council_number',bar_council_number,'email',email) from public.legal_advocates where id=v_access.advocate_id)
  );
end $$;

create or replace function public.legal_advocate_accept_terms(
  p_session_token text,p_terms_version text,p_confirmation_name text,p_bar_council_number text,
  p_user_agent text,p_device_id text,p_identity_confirmed boolean,p_confidentiality_confirmed boolean,p_professional_duties_confirmed boolean
) returns timestamptz language plpgsql security definer set search_path=public,extensions as $$
declare
  v_access record; v_advocate public.legal_advocates%rowtype; v_terms public.legal_advocate_terms_versions%rowtype;
  v_headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  v_ip_text text; v_ip inet; v_accepted_at timestamptz:=clock_timestamp(); v_enrolment text; v_hash text;
begin
  select * into v_access from public.legal_advocate_portal_identity(p_session_token) limit 1;
  if v_access.advocate_id is null then raise exception 'No active advocate profile is linked to this account'; end if;
  select * into v_advocate from public.legal_advocates where id=v_access.advocate_id;
  select * into v_terms from public.legal_advocate_terms_versions where is_active limit 1;
  if v_terms.version is null or p_terms_version is distinct from v_terms.version then raise exception 'The advocate terms changed. Reload and review the current version'; end if;
  if lower(regexp_replace(trim(coalesce(p_confirmation_name,'')),'\s+',' ','g')) is distinct from lower(regexp_replace(trim(v_advocate.full_name),'\s+',' ','g')) then raise exception 'Type the advocate name exactly as shown'; end if;
  v_enrolment:=upper(trim(coalesce(p_bar_council_number,'')));
  if length(v_enrolment)<4 then raise exception 'Enter the advocate enrolment or Bar Council number'; end if;
  if v_advocate.bar_council_number is not null and upper(regexp_replace(v_enrolment,'\s+','','g')) is distinct from upper(regexp_replace(trim(v_advocate.bar_council_number),'\s+','','g')) then raise exception 'The enrolment number does not match the advocate profile'; end if;
  if p_identity_confirmed is distinct from true or p_confidentiality_confirmed is distinct from true or p_professional_duties_confirmed is distinct from true then raise exception 'All advocate declarations are required'; end if;
  v_ip_text:=nullif(trim(split_part(coalesce(v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip',v_headers->>'x-forwarded-for',''),',',1)),'');
  begin v_ip:=v_ip_text::inet; exception when others then v_ip:=null; end;
  v_hash:=encode(digest(convert_to(jsonb_build_object('version',v_terms.version,'title',v_terms.title,'sections',v_terms.sections,'label',v_terms.acceptance_label)::text,'UTF8'),'sha256'),'hex');
  insert into public.legal_advocate_terms_acceptances(portal_user_id,advocate_id,terms_version,accepted_at,confirmation_name,bar_council_number,user_agent,accepted_ip,device_id,terms_snapshot,terms_hash,acceptance_metadata)
  values(v_access.portal_user_id,v_access.advocate_id,v_terms.version,v_accepted_at,trim(p_confirmation_name),v_enrolment,left(nullif(trim(coalesce(p_user_agent,'')),''),1000),v_ip,left(nullif(trim(coalesce(p_device_id,'')),''),120),jsonb_build_object('title',v_terms.title,'sections',v_terms.sections,'acceptance_label',v_terms.acceptance_label),v_hash,jsonb_build_object('method','advocate_portal_typed_electronic_acceptance','identity_confirmed',true,'confidentiality_confirmed',true,'professional_duties_confirmed',true,'server_observed_ip',case when v_ip is null then null else host(v_ip) end))
  on conflict(portal_user_id,advocate_id,terms_version) do update set accepted_at=excluded.accepted_at,confirmation_name=excluded.confirmation_name,bar_council_number=excluded.bar_council_number,user_agent=excluded.user_agent,accepted_ip=excluded.accepted_ip,device_id=excluded.device_id,terms_snapshot=excluded.terms_snapshot,terms_hash=excluded.terms_hash,acceptance_metadata=excluded.acceptance_metadata;
  perform public.log_external_portal_audit_event(v_access.portal_user_id,'legal_advocate_terms_accepted',jsonb_build_object('advocate_id',v_access.advocate_id,'terms_version',v_terms.version,'terms_hash',v_hash));
  return v_accepted_at;
end $$;

create or replace function public.legal_advocate_portal_resolve(p_session_token text)
returns table(portal_user_id uuid,advocate_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_access record; v_version text;
begin
  select * into v_access from public.legal_advocate_portal_identity(p_session_token) limit 1;
  if v_access.advocate_id is null then raise exception 'No active advocate profile is linked to this account'; end if;
  select version into v_version from public.legal_advocate_terms_versions where is_active limit 1;
  if v_version is null or not exists(select 1 from public.legal_advocate_terms_acceptances a where a.portal_user_id=v_access.portal_user_id and a.advocate_id=v_access.advocate_id and a.terms_version=v_version) then
    raise exception 'ADVOCATE_TERMS_ACCEPTANCE_REQUIRED';
  end if;
  return query select v_access.portal_user_id,v_access.advocate_id;
end $$;

revoke all on function public.legal_advocate_portal_identity(text) from public;
revoke all on function public.legal_advocate_terms_status(text) from public;
revoke all on function public.legal_advocate_accept_terms(text,text,text,text,text,text,boolean,boolean,boolean) from public;
revoke all on function public.legal_advocate_portal_resolve(text) from public;
grant execute on function public.legal_advocate_terms_status(text) to anon,authenticated;
grant execute on function public.legal_advocate_accept_terms(text,text,text,text,text,text,boolean,boolean,boolean) to anon,authenticated;

notify pgrst, 'reload schema';
