-- The guarded test reset has been executed. Remove the destructive primitive
-- before live onboarding so it cannot become a standing administration path.

drop function if exists public.whatsapp_platform_purge_test_tenant(uuid,text,text);
