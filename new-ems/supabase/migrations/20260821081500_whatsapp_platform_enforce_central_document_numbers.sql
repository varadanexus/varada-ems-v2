-- Every WhatsApp Platform invoice and credit note uses the same continuous
-- EMS-wide register as the other divisions. Provider test mode remains visible
-- through document_environment, but must not create a separate number format.

create or replace function public.whatsapp_platform_enforce_central_document_number()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_table_name='whatsapp_platform_billing_invoices' then
    if new.invoice_number is null or new.invoice_number !~ '^INV/GB/[0-9]{2}-[0-9]{2}/[0-9]{3,}$' then
      new.invoice_number:=public.next_central_document_number('invoice',coalesce(new.invoice_date,current_date));
    end if;
  elsif tg_table_name='whatsapp_platform_billing_credit_notes' then
    if new.credit_note_number is null or new.credit_note_number !~ '^CR/[0-9]{2}-[0-9]{2}/[0-9]{3,}$' then
      new.credit_note_number:=public.next_central_document_number('credit_note',coalesce(new.credit_note_date,current_date));
    end if;
  else
    raise exception 'Unsupported WhatsApp billing document table: %',tg_table_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_platform_central_invoice_number on public.whatsapp_platform_billing_invoices;
create trigger trg_whatsapp_platform_central_invoice_number
before insert or update of invoice_number on public.whatsapp_platform_billing_invoices
for each row execute function public.whatsapp_platform_enforce_central_document_number();

drop trigger if exists trg_whatsapp_platform_central_credit_note_number on public.whatsapp_platform_billing_credit_notes;
create trigger trg_whatsapp_platform_central_credit_note_number
before insert or update of credit_note_number on public.whatsapp_platform_billing_credit_notes
for each row execute function public.whatsapp_platform_enforce_central_document_number();

-- Correct previously issued WhatsApp documents in chronological order so the
-- replacement numbers continue the current company register deterministically.
do $$
declare v_document record;
begin
  for v_document in
    select id,invoice_date
    from public.whatsapp_platform_billing_invoices
    where invoice_number !~ '^INV/GB/[0-9]{2}-[0-9]{2}/[0-9]{3,}$'
    order by invoice_date,issued_at,created_at,id
  loop
    update public.whatsapp_platform_billing_invoices
    set invoice_number=public.next_central_document_number('invoice',v_document.invoice_date),updated_at=now()
    where id=v_document.id;
  end loop;

  for v_document in
    select id,credit_note_date
    from public.whatsapp_platform_billing_credit_notes
    where credit_note_number !~ '^CR/[0-9]{2}-[0-9]{2}/[0-9]{3,}$'
    order by credit_note_date,issued_at,created_at,id
  loop
    update public.whatsapp_platform_billing_credit_notes
    set credit_note_number=public.next_central_document_number('credit_note',v_document.credit_note_date),updated_at=now()
    where id=v_document.id;
  end loop;

  if exists(select 1 from public.whatsapp_platform_billing_invoices where invoice_number !~ '^INV/GB/[0-9]{2}-[0-9]{2}/[0-9]{3,}$') then
    raise exception 'WhatsApp invoice number correction is incomplete';
  end if;
  if exists(select 1 from public.whatsapp_platform_billing_credit_notes where credit_note_number !~ '^CR/[0-9]{2}-[0-9]{2}/[0-9]{3,}$') then
    raise exception 'WhatsApp credit-note number correction is incomplete';
  end if;
end $$;

revoke all on function public.whatsapp_platform_enforce_central_document_number() from public,anon,authenticated;
grant execute on function public.whatsapp_platform_enforce_central_document_number() to service_role;

comment on function public.whatsapp_platform_enforce_central_document_number() is
  'Enforces the EMS-wide invoice and credit-note sequences for every WhatsApp billing document, including Razorpay test-mode records.';

notify pgrst,'reload schema';
