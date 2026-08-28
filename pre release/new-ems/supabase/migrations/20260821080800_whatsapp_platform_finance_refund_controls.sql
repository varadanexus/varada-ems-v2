-- Corporate refund controls: reservation, concurrency safety and audit state.

create table public.whatsapp_platform_billing_refund_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  payment_id uuid not null references public.whatsapp_platform_billing_payments(id) on delete restrict,
  requested_by uuid references public.app_users(id) on delete set null,
  amount_paise bigint not null check (amount_paise>0),
  currency text not null check (currency~'^[A-Z]{3}$'),
  reason text not null check (char_length(trim(reason)) between 10 and 500),
  status text not null default 'reserved' check (status in ('reserved','submitted','processed','failed','cancelled')),
  provider_refund_id text unique,
  provider_error text,
  expires_at timestamptz not null default (now()+interval '1 hour'),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index whatsapp_platform_billing_refund_requests_payment_idx on public.whatsapp_platform_billing_refund_requests(payment_id,created_at desc);
create index whatsapp_platform_billing_refund_requests_status_idx on public.whatsapp_platform_billing_refund_requests(status,created_at desc);
alter table public.whatsapp_platform_billing_refund_requests enable row level security;
revoke all on public.whatsapp_platform_billing_refund_requests from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_platform_billing_refund_requests to service_role;

create or replace function public.whatsapp_platform_reserve_billing_refund(p_payment_id uuid,p_amount_paise bigint,p_reason text,p_requested_by uuid)
returns public.whatsapp_platform_billing_refund_requests
language plpgsql security definer set search_path=public as $$
declare v_payment public.whatsapp_platform_billing_payments;v_refunded bigint;v_reserved bigint;v_result public.whatsapp_platform_billing_refund_requests;
begin
  if auth.role()<>'service_role' then raise exception 'Billing refunds are server-only' using errcode='42501'; end if;
  if p_amount_paise<1 or char_length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Enter a valid refund amount and a reason of 10 to 500 characters'; end if;
  select * into v_payment from public.whatsapp_platform_billing_payments where id=p_payment_id for update;
  if not found or not v_payment.captured or v_payment.status<>'captured' then raise exception 'Only a captured payment can be refunded'; end if;
  select coalesce(sum(amount_paise),0) into v_refunded from public.whatsapp_platform_billing_refunds where payment_id=v_payment.id and status in ('pending','processed');
  select coalesce(sum(amount_paise),0) into v_reserved from public.whatsapp_platform_billing_refund_requests where payment_id=v_payment.id and status='reserved' and expires_at>now();
  if p_amount_paise>v_payment.amount_paise-v_refunded-v_reserved then raise exception 'Refund amount exceeds the unrefunded payment balance'; end if;
  insert into public.whatsapp_platform_billing_refund_requests(tenant_id,payment_id,requested_by,amount_paise,currency,reason)
  values(v_payment.tenant_id,v_payment.id,p_requested_by,p_amount_paise,v_payment.currency,trim(p_reason)) returning * into v_result;
  return v_result;
end $$;

create or replace function public.whatsapp_platform_finalize_billing_refund_request(p_request_id uuid,p_status text,p_provider_refund_id text default null,p_provider_error text default null)
returns public.whatsapp_platform_billing_refund_requests
language plpgsql security definer set search_path=public as $$
declare v_status text:=lower(trim(coalesce(p_status,'')));v_result public.whatsapp_platform_billing_refund_requests;
begin
  if auth.role()<>'service_role' then raise exception 'Billing refunds are server-only' using errcode='42501'; end if;
  if v_status not in ('submitted','processed','failed','cancelled') then raise exception 'Invalid refund request status'; end if;
  update public.whatsapp_platform_billing_refund_requests set status=v_status,provider_refund_id=coalesce(nullif(trim(coalesce(p_provider_refund_id,'')),''),provider_refund_id),provider_error=case when v_status='failed' then left(coalesce(p_provider_error,'Refund request failed'),1000) else null end,submitted_at=case when v_status in ('submitted','processed') then coalesce(submitted_at,now()) else submitted_at end,completed_at=case when v_status in ('processed','failed','cancelled') then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=p_request_id returning * into v_result;
  if not found then raise exception 'Refund request was not found'; end if;
  return v_result;
end $$;

create or replace function public.whatsapp_platform_record_billing_refund(p_provider_refund_id text,p_provider_payment_id text,p_amount_paise bigint,p_currency text,p_status text,p_reason text default null,p_safe_metadata jsonb default '{}'::jsonb)
returns public.whatsapp_platform_billing_refunds
language plpgsql security definer set search_path=public as $$
declare v_payment public.whatsapp_platform_billing_payments;v_invoice public.whatsapp_platform_billing_invoices;v_refund public.whatsapp_platform_billing_refunds;v_existing public.whatsapp_platform_billing_refunds;v_note public.whatsapp_platform_billing_credit_notes;v_total_refunded bigint;v_taxable bigint;v_gst bigint;v_gateway bigint;v_number text;v_environment text;v_status text:=lower(trim(coalesce(p_status,'pending')));v_receipt text;v_request_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Billing refunds are server-only' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_provider_refund_id,'')),'') is null or nullif(trim(coalesce(p_provider_payment_id,'')),'') is null or p_amount_paise<1 then raise exception 'Refund payload is invalid'; end if;
  if v_status not in ('pending','processed','failed','cancelled') then v_status:='pending'; end if;
  select * into v_payment from public.whatsapp_platform_billing_payments where provider_payment_id=p_provider_payment_id for update;
  if not found then raise exception 'Original billing payment was not found'; end if;
  select * into v_existing from public.whatsapp_platform_billing_refunds where provider_refund_id=p_provider_refund_id;
  if found and (v_existing.payment_id<>v_payment.id or v_existing.amount_paise<>p_amount_paise or v_existing.currency<>upper(coalesce(p_currency,v_payment.currency))) then raise exception 'Refund idempotency payload does not match the existing refund'; end if;
  select * into v_invoice from public.whatsapp_platform_billing_invoices where payment_id=v_payment.id for update;
  insert into public.whatsapp_platform_billing_refunds(tenant_id,payment_id,invoice_id,provider_refund_id,provider_payment_id,amount_paise,currency,status,reason,safe_metadata,processed_at)
  values(v_payment.tenant_id,v_payment.id,v_invoice.id,p_provider_refund_id,p_provider_payment_id,p_amount_paise,upper(coalesce(p_currency,v_payment.currency)),v_status,nullif(trim(coalesce(p_reason,'')),''),coalesce(p_safe_metadata,'{}'::jsonb),case when v_status='processed' then now() else null end)
  on conflict(provider_refund_id) do update set status=excluded.status,reason=coalesce(excluded.reason,public.whatsapp_platform_billing_refunds.reason),safe_metadata=excluded.safe_metadata,processed_at=case when excluded.status='processed' then coalesce(public.whatsapp_platform_billing_refunds.processed_at,now()) else public.whatsapp_platform_billing_refunds.processed_at end,updated_at=now() returning * into v_refund;
  if v_status='processed' and v_invoice.id is not null and not exists(select 1 from public.whatsapp_platform_billing_credit_notes where refund_id=v_refund.id) then
    select coalesce(sum(amount_paise),0) into v_total_refunded from public.whatsapp_platform_billing_refunds where invoice_id=v_invoice.id and status='processed';
    if v_total_refunded>v_invoice.total_paise then raise exception 'Refunds exceed the original invoice total'; end if;
    v_taxable:=least(p_amount_paise,round(v_invoice.taxable_base_paise*(p_amount_paise::numeric/v_invoice.total_paise))::bigint);
    v_gst:=least(p_amount_paise-v_taxable,round(v_invoice.gst_paise*(p_amount_paise::numeric/v_invoice.total_paise))::bigint);
    v_gateway:=p_amount_paise-v_taxable-v_gst;v_environment:=v_invoice.document_environment;
    v_number:=case when v_environment='live' then public.next_central_document_number('credit_note',current_date) else 'TEST/CN/'||to_char(current_date,'YYYYMMDD')||'/'||upper(left(replace(p_provider_refund_id,'rfnd_',''),12)) end;
    insert into public.whatsapp_platform_billing_credit_notes(tenant_id,invoice_id,refund_id,credit_note_number,document_environment,credit_note_date,currency,taxable_base_paise,gst_paise,gateway_adjustment_paise,total_paise,reason,provider_refund_id,provider_payment_id,provider_invoice_id,safe_metadata)
    values(v_payment.tenant_id,v_invoice.id,v_refund.id,v_number,v_environment,current_date,v_refund.currency,v_taxable,v_gst,v_gateway,p_amount_paise,coalesce(v_refund.reason,'Razorpay refund'),p_provider_refund_id,p_provider_payment_id,v_invoice.provider_invoice_id,jsonb_build_object('againstInvoiceNumber',v_invoice.invoice_number)) returning * into v_note;
    update public.whatsapp_platform_billing_invoices set status=case when v_total_refunded>=total_paise then 'refunded' else 'partially_refunded' end,updated_at=now() where id=v_invoice.id;
  end if;
  v_receipt:=coalesce(p_safe_metadata->>'receipt','');
  if v_receipt~'^ems-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_request_id:=substring(v_receipt from 5)::uuid;
    update public.whatsapp_platform_billing_refund_requests set status=case when v_status='processed' then 'processed' when v_status in ('failed','cancelled') then v_status else 'submitted' end,provider_refund_id=v_refund.provider_refund_id,submitted_at=coalesce(submitted_at,now()),completed_at=case when v_status in ('processed','failed','cancelled') then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=v_request_id;
  end if;
  return v_refund;
end $$;

revoke all on function public.whatsapp_platform_reserve_billing_refund(uuid,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_finalize_billing_refund_request(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_reserve_billing_refund(uuid,bigint,text,uuid) to service_role;
grant execute on function public.whatsapp_platform_finalize_billing_refund_request(uuid,text,text,text) to service_role;

comment on table public.whatsapp_platform_billing_refund_requests is 'Auditable, concurrency-safe EMS refund commands submitted to Razorpay; reservations prevent over-refunds.';
notify pgrst,'reload schema';
