-- Move the retained WhatsApp invoice into the company-wide FY 26-27 sequence.
-- The archived Drive PDF is intentionally marked stale so the billing Edge
-- function regenerates its contents and synchronizes its Drive filename.
do $$
declare
  v_invoice_id uuid;
  v_updated integer;
begin
  select id
    into v_invoice_id
  from public.whatsapp_platform_billing_invoices
  where invoice_number = 'INV/GB/26-27/008'
    and provider_invoice_id = 'inv_TUWft5L7jenjLg'
    and provider_payment_id = 'pay_TUWhUCZQiSrvjN';

  if v_invoice_id is null then
    raise exception 'Expected retained WhatsApp invoice INV/GB/26-27/008 was not found';
  end if;

  if exists (
    select 1 from public.whatsapp_platform_billing_invoices where invoice_number = 'INVGB/26-27/003'
  ) then
    raise exception 'Invoice number INVGB/26-27/003 is already assigned';
  end if;

  update public.whatsapp_platform_billing_invoices
  set invoice_number = 'INVGB/26-27/003',
      pdf_template_version = 1,
      pdf_archive_error = null,
      updated_at = now()
  where id = v_invoice_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'Expected to renumber exactly one WhatsApp invoice, updated %', v_updated;
  end if;

  insert into public.central_invoice_number_sequences(financial_year_label,last_number,updated_at)
  values ('26-27',3,now())
  on conflict(financial_year_label)
  do update set last_number = greatest(public.central_invoice_number_sequences.last_number,3),
                updated_at = now();

  if not exists (
    select 1
    from public.whatsapp_platform_billing_invoices
    where id = v_invoice_id
      and invoice_number = 'INVGB/26-27/003'
      and pdf_template_version = 1
  ) then
    raise exception 'WhatsApp invoice renumber verification failed';
  end if;
end;
$$;
