-- Make Razorpay webhook handling retryable and observable without retaining
-- raw webhook payloads. A failed delivery is answered with 5xx and the same
-- signed provider delivery can safely claim and retry its existing event row.

alter table public.whatsapp_platform_billing_webhook_events
  add column if not exists processing_status text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

update public.whatsapp_platform_billing_webhook_events
set processing_status = case
  when processing_error is not null then 'failed'
  when processed_at is not null then 'processed'
  else 'received'
end
where processing_status is null;

alter table public.whatsapp_platform_billing_webhook_events
  alter column processing_status set default 'received',
  alter column processing_status set not null,
  drop constraint if exists whatsapp_platform_billing_webhook_processing_status_check,
  add constraint whatsapp_platform_billing_webhook_processing_status_check
    check (processing_status in ('received','processing','processed','failed')),
  drop constraint if exists whatsapp_platform_billing_webhook_attempt_count_check,
  add constraint whatsapp_platform_billing_webhook_attempt_count_check
    check (attempt_count >= 0);

create index if not exists whatsapp_platform_billing_webhooks_recovery_idx
  on public.whatsapp_platform_billing_webhook_events(processing_status, received_at)
  where processing_status in ('received','failed');

comment on column public.whatsapp_platform_billing_webhook_events.processing_status is
  'Retryable processing state. processed is the only terminal success state.';
comment on column public.whatsapp_platform_billing_webhook_events.attempt_count is
  'Number of signed delivery processing attempts for operational reconciliation.';

create or replace function public.whatsapp_platform_claim_billing_webhook_event(p_event_id uuid)
returns public.whatsapp_platform_billing_webhook_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.whatsapp_platform_billing_webhook_events;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Webhook recovery is server-only' using errcode = '42501';
  end if;

  select * into v_event
  from public.whatsapp_platform_billing_webhook_events
  where id = p_event_id
  for update;

  if not found
     or v_event.processing_status = 'processed'
     or (v_event.processing_status = 'processing' and v_event.last_attempt_at > now() - interval '2 minutes') then
    return null;
  end if;

  update public.whatsapp_platform_billing_webhook_events
  set processing_status = 'processing',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      processing_error = null
  where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.whatsapp_platform_claim_billing_webhook_event(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_platform_claim_billing_webhook_event(uuid) to service_role;

comment on function public.whatsapp_platform_claim_billing_webhook_event(uuid) is
  'Atomically claims a new, failed, or stale Razorpay webhook delivery for idempotent processing.';

-- Provider payment identity is immutable. Status, capture, invoice reference,
-- provider fee/tax and timestamps may advance as later signed events arrive.
create or replace function public.whatsapp_platform_guard_billing_payment_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tenant_id <> old.tenant_id
     or new.subscription_id is distinct from old.subscription_id
     or new.provider <> old.provider
     or new.provider_payment_id <> old.provider_payment_id
     or new.amount_paise <> old.amount_paise
     or new.currency <> old.currency then
    raise exception 'Billing payment identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_guard_billing_payment_identity_trg
  on public.whatsapp_platform_billing_payments;
create trigger whatsapp_platform_guard_billing_payment_identity_trg
before update on public.whatsapp_platform_billing_payments
for each row execute function public.whatsapp_platform_guard_billing_payment_identity();

-- Reject currency mismatches and aggregate over-refunds at the database layer,
-- independently of the EMS refund command and provider webhook code.
create or replace function public.whatsapp_platform_guard_billing_refund_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payment public.whatsapp_platform_billing_payments;
  v_committed bigint;
begin
  select * into v_payment
  from public.whatsapp_platform_billing_payments
  where id = new.payment_id
  for update;

  if not found or not v_payment.captured then
    raise exception 'Refund requires an existing captured payment';
  end if;
  if new.provider_payment_id <> v_payment.provider_payment_id
     or new.tenant_id <> v_payment.tenant_id
     or new.currency <> v_payment.currency then
    raise exception 'Refund identity or currency does not match the captured payment';
  end if;

  if new.status in ('pending','processed') then
    select coalesce(sum(amount_paise), 0) into v_committed
    from public.whatsapp_platform_billing_refunds
    where payment_id = new.payment_id
      and status in ('pending','processed')
      and id <> new.id;
    if v_committed + new.amount_paise > v_payment.amount_paise then
      raise exception 'Refunds exceed the captured payment total';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_platform_guard_billing_refund_amount_trg
  on public.whatsapp_platform_billing_refunds;
create trigger whatsapp_platform_guard_billing_refund_amount_trg
before insert or update on public.whatsapp_platform_billing_refunds
for each row execute function public.whatsapp_platform_guard_billing_refund_amount();
