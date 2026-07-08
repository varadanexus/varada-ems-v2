begin;

create table if not exists public.legal_execution_signatures (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.legal_agreements(id) on delete cascade,
  agreement_version_id uuid not null references public.legal_agreement_versions(id),
  signing_request_id uuid references public.legal_signing_requests(id) on delete set null,
  signer_role text not null check (signer_role in ('external_party', 'company_authorised_signatory')),
  signer_name text not null,
  signer_designation text,
  signer_email text,
  signing_method text not null check (signing_method in ('didit', 'portal_evidence', 'authenticated_countersign')),
  signed_by_user_id uuid references public.app_users(id),
  signature_sha256 text not null,
  evidence_reference text,
  signature_metadata jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agreement_id, agreement_version_id, signer_role)
);

create index if not exists idx_legal_execution_signatures_agreement
  on public.legal_execution_signatures(agreement_id, signed_at desc);

alter table public.legal_execution_signatures enable row level security;

notify pgrst, 'reload schema';
commit;
