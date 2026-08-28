-- Verify the production cleanup and the first numbers without consuming them.
do $$
declare
  v_invoice text;
  v_credit_note text;
begin
  if (select count(*) from public.central_invoice_number_sequences) <> 1
     or not exists(
       select 1 from public.central_invoice_number_sequences
       where financial_year_label='26-27' and last_number=2
     ) then
    raise exception 'Central invoice counter is not reset to the reserved 26-27 baseline of 002';
  end if;

  if (select count(*) from public.central_credit_note_sequences) <> 1
     or not exists(
       select 1 from public.central_credit_note_sequences
       where financial_year_label='GLOBAL' and last_number=1
     ) then
    raise exception 'Central credit-note counter is not reset to the reserved baseline of CN/001';
  end if;

  v_invoice:=public.next_central_document_number('invoice','2026-08-27'::date);
  v_credit_note:=public.next_central_document_number('credit_note','2026-08-27'::date);

  if v_invoice <> 'INVGB/26-27/003' then
    raise exception 'Unexpected first EMS invoice number: %',v_invoice;
  end if;
  if v_credit_note <> 'CN/002' then
    raise exception 'Unexpected first EMS credit-note number: %',v_credit_note;
  end if;

  -- The probe must not consume either reserved first number.
  update public.central_invoice_number_sequences set last_number=2,updated_at=now()
  where financial_year_label='26-27';
  update public.central_credit_note_sequences set last_number=1,updated_at=now()
  where financial_year_label='GLOBAL';

  -- The live WhatsApp invoice that prompted this cleanup must remain intact.
  if not exists(
    select 1 from public.whatsapp_platform_billing_invoices
    where invoice_number='INV/GB/26-27/008'
  ) then
    raise exception 'Protected WhatsApp Platform invoice INV/GB/26-27/008 is missing';
  end if;
end;
$$;
