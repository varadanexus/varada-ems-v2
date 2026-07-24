-- Notification Studio accepts local Indian mobile numbers without a country
-- code. Explicit international country codes remain unchanged.

create or replace function public.notification_normalize_mobile(p_mobile text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g') as digits
  )
  select case
    when digits ~ '^00[1-9][0-9]{7,13}$' then substr(digits, 3)
    when digits ~ '^0[0-9]{10}$' then '91' || substr(digits, 2)
    when digits ~ '^[0-9]{10}$' then '91' || digits
    else digits
  end
  from cleaned;
$$;

revoke all on function public.notification_normalize_mobile(text) from public, anon;
grant execute on function public.notification_normalize_mobile(text) to authenticated, service_role;
