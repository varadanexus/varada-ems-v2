-- Sprint 13F.5: fix pgcrypto search_path on the local-auth functions.
--
-- pgcrypto (gen_salt, crypt, pgp_sym_encrypt/decrypt, gen_random_bytes) is
-- installed in the `extensions` schema on Supabase, not `public`. The Sprint 13F
-- functions were created with `search_path = public`, so calling them failed with
-- "function gen_salt(unknown) does not exist". This mirrors the earlier
-- Sprint 12A fix for the transport portal functions (which use
-- `search_path = public, vault, extensions`).
--
-- ALTER FUNCTION only changes the search_path config; signatures and bodies are
-- unchanged, so no PostgREST schema reload is required.

alter function public.provision_local_app_user(text, text, text, text, text, text, text, text)
  set search_path = public, extensions;

alter function public.ems_local_login(text, text)
  set search_path = public, extensions;

alter function public.ems_local_set_password(uuid, text)
  set search_path = public, extensions;

alter function public.ems_local_change_password(text, text, text)
  set search_path = public, extensions;

alter function public.reveal_ems_local_password(uuid, text)
  set search_path = public, vault, extensions;
