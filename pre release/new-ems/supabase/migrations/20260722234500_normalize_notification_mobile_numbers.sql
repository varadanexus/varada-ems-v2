-- Treat plain Indian mobile numbers and explicitly prefixed +91 numbers as the
-- same WhatsApp destination. International numbers keep their supplied code.

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
    when digits ~ '^0[6-9][0-9]{9}$' then '91' || substr(digits, 2)
    when digits ~ '^[6-9][0-9]{9}$' then '91' || digits
    else digits
  end
  from cleaned;
$$;

revoke all on function public.notification_normalize_mobile(text) from public, anon;
grant execute on function public.notification_normalize_mobile(text) to authenticated, service_role;

alter function public.notification_multichannel_recipients(uuid, text)
  rename to notification_multichannel_recipients_raw;

revoke all on function public.notification_multichannel_recipients_raw(uuid, text)
  from public, anon, authenticated;
grant execute on function public.notification_multichannel_recipients_raw(uuid, text)
  to service_role;

create function public.notification_multichannel_recipients(
  p_notification_id uuid,
  p_channel text
)
returns table(identity_kind text, identity_id uuid, destination text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      r.identity_kind,
      r.identity_id,
      case
        when lower(p_channel) = 'whatsapp'
          then public.notification_normalize_mobile(r.destination)
        else lower(btrim(r.destination))
      end as destination,
      r.display_name
    from public.notification_multichannel_recipients_raw(p_notification_id, p_channel) r
  )
  select distinct on (lower(n.destination))
    n.identity_kind,
    n.identity_id,
    n.destination,
    n.display_name
  from normalized n
  where n.destination <> ''
    and (lower(p_channel) <> 'whatsapp' or length(n.destination) between 10 and 15)
  order by
    lower(n.destination),
    case n.identity_kind
      when 'staff' then 1
      when 'external_portal' then 2
      when 'transport_portal' then 3
      else 4
    end;
$$;

revoke all on function public.notification_multichannel_recipients(uuid, text)
  from public, anon, authenticated;
grant execute on function public.notification_multichannel_recipients(uuid, text)
  to service_role;

alter function public.preview_notification_campaign_audience(text, jsonb, boolean)
  rename to preview_notification_campaign_audience_raw;

revoke all on function public.preview_notification_campaign_audience_raw(text, jsonb, boolean)
  from public, anon, authenticated;

create function public.preview_notification_campaign_audience(
  p_audience_mode text,
  p_audience jsonb default '{}'::jsonb,
  p_respect_preferences boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  previous_direct_mobile_count integer := 0;
  direct_mobile_count integer := 0;
begin
  result := public.preview_notification_campaign_audience_raw(
    p_audience_mode,
    p_audience,
    p_respect_preferences
  );

  previous_direct_mobile_count := coalesce((result ->> 'direct_mobiles')::integer, 0);

  select count(distinct public.notification_normalize_mobile(value))
    into direct_mobile_count
  from jsonb_array_elements_text(coalesce(p_audience -> 'direct_mobiles', '[]'::jsonb))
  where length(public.notification_normalize_mobile(value)) between 10 and 15;

  result := jsonb_set(result, '{direct_mobiles}', to_jsonb(direct_mobile_count), true);
  result := jsonb_set(
    result,
    '{whatsapp_reachable}',
    to_jsonb(
      greatest(
        0,
        coalesce((result ->> 'whatsapp_reachable')::integer, 0)
          - previous_direct_mobile_count
          + direct_mobile_count
      )
    ),
    true
  );

  return result;
end;
$$;

revoke all on function public.preview_notification_campaign_audience(text, jsonb, boolean)
  from public, anon;
grant execute on function public.preview_notification_campaign_audience(text, jsonb, boolean)
  to authenticated;
