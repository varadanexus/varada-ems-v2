-- Auditable WhatsApp Platform tax invoices, refunds and credit notes.
-- Live documents draw from the existing EMS-wide invoice / credit-note
-- sequences. Razorpay test-mode documents use a non-statutory TEST prefix.

grant execute on function public.next_central_document_number(text,date) to service_role;

create table public.whatsapp_platform_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  subscription_id uuid not null references public.whatsapp_platform_billing_subscriptions(id) on delete restrict,
  payment_id uuid not null unique references public.whatsapp_platform_billing_payments(id) on delete restrict,
  invoice_number text not null unique,
  document_environment text not null check (document_environment in ('live','test')),
  invoice_date date not null,
  status text not null default 'issued' check (status in ('issued','partially_refunded','refunded','void')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  base_subtotal_paise bigint not null check (base_subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  taxable_base_paise bigint not null check (taxable_base_paise >= 0),
  gst_rate_bps integer not null default 1800 check (gst_rate_bps between 0 and 10000),
  gst_paise bigint not null check (gst_paise >= 0),
  gateway_adjustment_paise bigint not null default 0 check (gateway_adjustment_paise >= 0),
  total_paise bigint not null check (total_paise > 0),
  provider text not null default 'razorpay' check (provider='razorpay'),
  provider_invoice_id text not null,
  provider_payment_id text not null,
  package_code text not null references public.whatsapp_platform_package_master(code),
  billing_interval text not null check (billing_interval in ('month','year')),
  billing_name text not null,
  billing_email text,
  billing_gstin text,
  billing_address text,
  issuer_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(issuer_snapshot)='object'),
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items)='array'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_platform_billing_invoice_total_check
    check (total_paise=taxable_base_paise+gst_paise+gateway_adjustment_paise),
  constraint whatsapp_platform_billing_invoice_discount_check
    check (base_subtotal_paise>=discount_paise and taxable_base_paise=base_subtotal_paise-discount_paise)
);

create table public.whatsapp_platform_billing_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  payment_id uuid not null references public.whatsapp_platform_billing_payments(id) on delete restrict,
  invoice_id uuid references public.whatsapp_platform_billing_invoices(id) on delete restrict,
  provider text not null default 'razorpay' check (provider='razorpay'),
  provider_refund_id text not null unique,
  provider_payment_id text not null,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending','processed','failed','cancelled')),
  reason text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_platform_billing_credit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.whatsapp_platform_tenants(id) on delete restrict,
  invoice_id uuid not null references public.whatsapp_platform_billing_invoices(id) on delete restrict,
  refund_id uuid not null unique references public.whatsapp_platform_billing_refunds(id) on delete restrict,
  credit_note_number text not null unique,
  document_environment text not null check (document_environment in ('live','test')),
  credit_note_date date not null,
  status text not null default 'issued' check (status in ('issued','void')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  taxable_base_paise bigint not null check (taxable_base_paise >= 0),
  gst_paise bigint not null check (gst_paise >= 0),
  gateway_adjustment_paise bigint not null default 0 check (gateway_adjustment_paise >= 0),
  total_paise bigint not null check (total_paise > 0),
  reason text,
  provider_refund_id text not null,
  provider_payment_id text not null,
  provider_invoice_id text not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_platform_billing_credit_total_check
    check (total_paise=taxable_base_paise+gst_paise+gateway_adjustment_paise)
);

create index whatsapp_platform_billing_invoices_tenant_idx on public.whatsapp_platform_billing_invoices(tenant_id,invoice_date desc);
create index whatsapp_platform_billing_invoices_subscription_idx on public.whatsapp_platform_billing_invoices(subscription_id,invoice_date desc);
create index whatsapp_platform_billing_invoices_provider_idx on public.whatsapp_platform_billing_invoices(provider_invoice_id,provider_payment_id);
create index whatsapp_platform_billing_refunds_tenant_idx on public.whatsapp_platform_billing_refunds(tenant_id,created_at desc);
create index whatsapp_platform_billing_refunds_payment_idx on public.whatsapp_platform_billing_refunds(payment_id,created_at desc);
create index whatsapp_platform_billing_credit_notes_tenant_idx on public.whatsapp_platform_billing_credit_notes(tenant_id,credit_note_date desc);
create index whatsapp_platform_billing_credit_notes_invoice_idx on public.whatsapp_platform_billing_credit_notes(invoice_id,credit_note_date desc);

alter table public.whatsapp_platform_billing_invoices enable row level security;
alter table public.whatsapp_platform_billing_refunds enable row level security;
alter table public.whatsapp_platform_billing_credit_notes enable row level security;
revoke all on public.whatsapp_platform_billing_invoices,public.whatsapp_platform_billing_refunds,public.whatsapp_platform_billing_credit_notes from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_platform_billing_invoices,public.whatsapp_platform_billing_refunds,public.whatsapp_platform_billing_credit_notes to service_role;

create or replace function public.whatsapp_platform_issue_billing_invoice(p_payment_id uuid)
returns public.whatsapp_platform_billing_invoices
language plpgsql security definer set search_path=public as $$
declare
  v_payment public.whatsapp_platform_billing_payments;
  v_subscription public.whatsapp_platform_billing_subscriptions;
  v_existing public.whatsapp_platform_billing_invoices;
  v_result public.whatsapp_platform_billing_invoices;
  v_quote public.whatsapp_platform_billing_checkout_quotes;
  v_upgrade public.whatsapp_platform_billing_upgrade_intents;
  v_addon public.whatsapp_platform_billing_addon_change_intents;
  v_tenant public.whatsapp_platform_tenants;
  v_verification public.whatsapp_platform_business_verifications;
  v_issuer jsonb := '{}'::jsonb;
  v_line_items jsonb := '[]'::jsonb;
  v_environment text;
  v_invoice_no text;
  v_base bigint := 0;
  v_discount bigint := 0;
  v_taxable bigint := 0;
  v_gst bigint := 0;
  v_gateway bigint := 0;
  v_rate integer := 1800;
  v_prior bigint := 0;
  v_package_name text;
begin
  if auth.role()<>'service_role' and pg_trigger_depth()=0 then raise exception 'Billing invoices are server-only' using errcode='42501'; end if;
  select * into v_payment from public.whatsapp_platform_billing_payments where id=p_payment_id for update;
  if not found then raise exception 'Billing payment not found'; end if;
  select * into v_existing from public.whatsapp_platform_billing_invoices where payment_id=v_payment.id;
  if found then return v_existing; end if;
  if not v_payment.captured or v_payment.amount_paise<1 or nullif(v_payment.provider_invoice_id,'') is null then return null; end if;
  select * into v_subscription from public.whatsapp_platform_billing_subscriptions where id=v_payment.subscription_id;
  if not found then return null; end if;
  select * into v_tenant from public.whatsapp_platform_tenants where id=v_payment.tenant_id;
  select * into v_verification from public.whatsapp_platform_business_verifications where tenant_id=v_payment.tenant_id;
  select name into v_package_name from public.whatsapp_platform_package_master where code=v_subscription.package_code;
  v_environment:=case when v_subscription.safe_metadata->>'mode'='live' then 'live' else 'test' end;
  v_rate:=coalesce(v_subscription.gst_rate_bps,1800);

  select * into v_upgrade from public.whatsapp_platform_billing_upgrade_intents
    where provider_payment_id=v_payment.provider_payment_id and replacement_subscription_id=v_subscription.id limit 1;
  if found then
    v_base:=v_upgrade.net_upgrade_base_paise; v_taxable:=v_base; v_gst:=v_upgrade.package_gst_paise; v_gateway:=v_upgrade.gateway_adjustment_paise;
    v_line_items:=jsonb_build_array(jsonb_build_object('type','prorated_upgrade','description','Prorated upgrade to '||coalesce(v_package_name,v_subscription.package_code),'quantity',1,'basePaise',v_base,'gstPaise',v_gst));
  else
    select * into v_addon from public.whatsapp_platform_billing_addon_change_intents
      where provider_payment_id=v_payment.provider_payment_id and replacement_subscription_id=v_subscription.id limit 1;
    if found then
      v_base:=v_addon.prorated_base_paise; v_taxable:=v_base; v_gst:=v_addon.gst_paise; v_gateway:=v_addon.gateway_adjustment_paise;
      v_line_items:=jsonb_build_array(jsonb_build_object('type','prorated_addon','description','Prorated add-on capacity increase','quantity',1,'basePaise',v_base,'gstPaise',v_gst,'selections',v_addon.target_selections));
    else
      select count(*) into v_prior from public.whatsapp_platform_billing_invoices where subscription_id=v_subscription.id;
      if v_prior=0 and nullif(v_subscription.safe_metadata->>'checkout_quote_id','') is not null then
        select * into v_quote from public.whatsapp_platform_billing_checkout_quotes where id=(v_subscription.safe_metadata->>'checkout_quote_id')::uuid;
      end if;
      if v_quote.id is not null and v_quote.checkout_amount_paise=v_payment.amount_paise then
        v_base:=v_quote.base_subtotal_paise; v_discount:=v_quote.discount_paise; v_taxable:=v_quote.taxable_base_paise; v_gst:=v_quote.package_gst_paise; v_gateway:=v_quote.gateway_adjustment_paise; v_rate:=v_quote.gst_rate_bps;
        v_line_items:=jsonb_build_array(jsonb_build_object('type','subscription','description',coalesce(v_quote.quote_snapshot->>'package_name',v_package_name,v_subscription.package_code),'quantity',1,'basePaise',coalesce((v_quote.quote_snapshot->>'package_base_paise')::bigint,v_taxable),'discountPaise',v_discount,'addons',coalesce(v_quote.addon_selections,'[]'::jsonb)));
      else
        v_taxable:=greatest(0,coalesce(v_subscription.recurring_base_paise,0));
        v_base:=v_taxable;
        v_gst:=round(v_taxable*v_rate/10000.0)::bigint;
        if v_taxable+v_gst>v_payment.amount_paise then
          v_taxable:=floor(v_payment.amount_paise/(1+(v_rate/10000.0)))::bigint;
          v_base:=v_taxable; v_gst:=v_payment.amount_paise-v_taxable;
        end if;
        v_gateway:=v_payment.amount_paise-v_taxable-v_gst;
        v_line_items:=jsonb_build_array(jsonb_build_object('type','subscription','description',coalesce(v_package_name,v_subscription.package_code)||' subscription','quantity',1,'basePaise',v_taxable));
      end if;
    end if;
  end if;
  if v_taxable+v_gst+v_gateway<>v_payment.amount_paise then
    v_gateway:=greatest(0,v_payment.amount_paise-v_taxable-v_gst);
    if v_taxable+v_gst+v_gateway<>v_payment.amount_paise then v_taxable:=v_payment.amount_paise;v_base:=v_taxable;v_discount:=0;v_gst:=0;v_gateway:=0; end if;
  end if;
  select jsonb_build_object('legalName',p.legal_name,'tradeName',p.trade_name,'pan',p.pan,'cin',p.cin,'registeredAddress',p.registered_address,'city',p.city,'stateCode',p.state_code,'pincode',p.pincode,'gstin',g.gstin,'gstRegistrationName',g.registration_name,'gstStateName',g.state_name)
    into v_issuer from public.company_tax_profiles p left join lateral (select * from public.company_gst_registrations where company_key=p.company_key and is_active=true order by is_primary desc,created_at limit 1) g on true where p.company_key='PRIMARY';
  v_issuer:=coalesce(v_issuer,'{}'::jsonb);
  v_invoice_no:=case when v_environment='live' then public.next_central_document_number('invoice',coalesce(v_payment.paid_at::date,current_date)) else 'TEST/INV/'||to_char(coalesce(v_payment.paid_at,current_timestamp),'YYYYMMDD')||'/'||upper(left(replace(v_payment.provider_payment_id,'pay_',''),12)) end;
  insert into public.whatsapp_platform_billing_invoices(tenant_id,subscription_id,payment_id,invoice_number,document_environment,invoice_date,currency,base_subtotal_paise,discount_paise,taxable_base_paise,gst_rate_bps,gst_paise,gateway_adjustment_paise,total_paise,provider_invoice_id,provider_payment_id,package_code,billing_interval,billing_name,billing_email,billing_gstin,billing_address,issuer_snapshot,line_items,safe_metadata)
  values(v_payment.tenant_id,v_subscription.id,v_payment.id,v_invoice_no,v_environment,coalesce(v_payment.paid_at::date,current_date),v_payment.currency,v_base,v_discount,v_taxable,v_rate,v_gst,v_gateway,v_payment.amount_paise,v_payment.provider_invoice_id,v_payment.provider_payment_id,v_subscription.package_code,v_subscription.billing_interval,v_tenant.name,v_tenant.owner_email,v_verification.gstin,v_verification.registered_address,v_issuer,v_line_items,jsonb_build_object('paymentMethod',v_payment.payment_method,'providerFeePaise',v_payment.fee_paise,'providerTaxPaise',v_payment.tax_paise)) returning * into v_result;
  return v_result;
end; $$;

create or replace function public.whatsapp_platform_record_billing_refund(p_provider_refund_id text,p_provider_payment_id text,p_amount_paise bigint,p_currency text,p_status text,p_reason text default null,p_safe_metadata jsonb default '{}'::jsonb)
returns public.whatsapp_platform_billing_refunds
language plpgsql security definer set search_path=public as $$
declare v_payment public.whatsapp_platform_billing_payments;v_invoice public.whatsapp_platform_billing_invoices;v_refund public.whatsapp_platform_billing_refunds;v_note public.whatsapp_platform_billing_credit_notes;v_total_refunded bigint;v_taxable bigint;v_gst bigint;v_gateway bigint;v_number text;v_environment text;v_status text:=lower(trim(coalesce(p_status,'pending')));
begin
  if auth.role()<>'service_role' then raise exception 'Billing refunds are server-only' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_provider_refund_id,'')),'') is null or nullif(trim(coalesce(p_provider_payment_id,'')),'') is null or p_amount_paise<1 then raise exception 'Refund payload is invalid'; end if;
  if v_status not in ('pending','processed','failed','cancelled') then v_status:='pending'; end if;
  select * into v_payment from public.whatsapp_platform_billing_payments where provider_payment_id=p_provider_payment_id;
  if not found then raise exception 'Original billing payment was not found'; end if;
  select * into v_invoice from public.whatsapp_platform_billing_invoices where payment_id=v_payment.id;
  insert into public.whatsapp_platform_billing_refunds(tenant_id,payment_id,invoice_id,provider_refund_id,provider_payment_id,amount_paise,currency,status,reason,safe_metadata,processed_at)
  values(v_payment.tenant_id,v_payment.id,v_invoice.id,p_provider_refund_id,p_provider_payment_id,p_amount_paise,upper(coalesce(p_currency,v_payment.currency)),v_status,nullif(trim(coalesce(p_reason,'')),''),coalesce(p_safe_metadata,'{}'::jsonb),case when v_status='processed' then now() else null end)
  on conflict(provider_refund_id) do update set status=excluded.status,reason=coalesce(excluded.reason,public.whatsapp_platform_billing_refunds.reason),safe_metadata=excluded.safe_metadata,processed_at=case when excluded.status='processed' then coalesce(public.whatsapp_platform_billing_refunds.processed_at,now()) else public.whatsapp_platform_billing_refunds.processed_at end,updated_at=now() returning * into v_refund;
  if v_status='processed' and v_invoice.id is not null and not exists(select 1 from public.whatsapp_platform_billing_credit_notes where refund_id=v_refund.id) then
    select coalesce(sum(amount_paise),0) into v_total_refunded from public.whatsapp_platform_billing_refunds where invoice_id=v_invoice.id and status='processed';
    if v_total_refunded>v_invoice.total_paise then raise exception 'Refunds exceed the original invoice total'; end if;
    v_taxable:=least(p_amount_paise,round(v_invoice.taxable_base_paise*(p_amount_paise::numeric/v_invoice.total_paise))::bigint);
    v_gst:=least(p_amount_paise-v_taxable,round(v_invoice.gst_paise*(p_amount_paise::numeric/v_invoice.total_paise))::bigint);
    v_gateway:=p_amount_paise-v_taxable-v_gst;
    v_environment:=v_invoice.document_environment;
    v_number:=case when v_environment='live' then public.next_central_document_number('credit_note',current_date) else 'TEST/CN/'||to_char(current_date,'YYYYMMDD')||'/'||upper(left(replace(p_provider_refund_id,'rfnd_',''),12)) end;
    insert into public.whatsapp_platform_billing_credit_notes(tenant_id,invoice_id,refund_id,credit_note_number,document_environment,credit_note_date,currency,taxable_base_paise,gst_paise,gateway_adjustment_paise,total_paise,reason,provider_refund_id,provider_payment_id,provider_invoice_id,safe_metadata)
    values(v_payment.tenant_id,v_invoice.id,v_refund.id,v_number,v_environment,current_date,v_refund.currency,v_taxable,v_gst,v_gateway,p_amount_paise,coalesce(v_refund.reason,'Razorpay refund'),p_provider_refund_id,p_provider_payment_id,v_invoice.provider_invoice_id,jsonb_build_object('againstInvoiceNumber',v_invoice.invoice_number)) returning * into v_note;
    update public.whatsapp_platform_billing_invoices set status=case when v_total_refunded>=total_paise then 'refunded' else 'partially_refunded' end,updated_at=now() where id=v_invoice.id;
  end if;
  return v_refund;
end; $$;

create or replace function public.trg_whatsapp_platform_issue_billing_invoice()
returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.captured and new.amount_paise>0 and nullif(new.provider_invoice_id,'') is not null then perform public.whatsapp_platform_issue_billing_invoice(new.id); end if;
  return new;
end; $$;
create trigger trg_whatsapp_platform_issue_billing_invoice after insert or update of captured,status,provider_invoice_id,amount_paise on public.whatsapp_platform_billing_payments for each row execute function public.trg_whatsapp_platform_issue_billing_invoice();

revoke all on function public.whatsapp_platform_issue_billing_invoice(uuid) from public,anon,authenticated;
revoke all on function public.whatsapp_platform_record_billing_refund(text,text,bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_platform_issue_billing_invoice(uuid) to service_role;
grant execute on function public.whatsapp_platform_record_billing_refund(text,text,bigint,text,text,text,jsonb) to service_role;

comment on table public.whatsapp_platform_billing_invoices is 'Immutable customer tax-document snapshots linked to central EMS numbering and Razorpay invoice/payment references.';
comment on table public.whatsapp_platform_billing_credit_notes is 'Central-numbered credit notes created only from verified processed Razorpay refunds.';
comment on table public.whatsapp_platform_billing_refunds is 'Idempotent Razorpay refund ledger; processed rows issue exactly one credit note when an invoice exists.';

notify pgrst,'reload schema';
