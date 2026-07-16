-- Trigger-only function: it must never be callable through PostgREST RPC.
revoke all on function public.queue_legal_terms_drive_archive() from public, anon, authenticated;
grant execute on function public.queue_legal_terms_drive_archive() to service_role;
