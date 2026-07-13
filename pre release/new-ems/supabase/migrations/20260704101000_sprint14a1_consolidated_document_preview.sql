-- Secure source-document preview for Consolidated Books.
create or replace function public.get_consolidated_source_document(p_financial_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fd public.financial_documents%rowtype;
  result jsonb;
begin
  if not (
    public.is_super_admin()
    or public.has_role_code('admin')
    or public.has_permission('central-accounts-consolidated', 'view')
  ) then
    raise exception 'Not authorized to preview consolidated documents';
  end if;

  select * into fd from public.financial_documents where id = p_financial_document_id and deleted_at is null;
  if not found then raise exception 'Financial document not found'; end if;
  if fd.division_id is not null and not public.has_division_access_by_id(fd.division_id)
     and not public.is_super_admin() and not public.has_role_code('admin') then
    raise exception 'Division access denied';
  end if;

  if fd.source_table = 'transport_client_bills' then
    select jsonb_build_object(
      'kind','client_bill','financial_document',to_jsonb(fd),'header',to_jsonb(b),
      'party',to_jsonb(c),
      'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.trip_date,l.trip_no) from public.transport_client_bill_trips l where l.bill_id=b.id and l.deleted_at is null),'[]'::jsonb)
    ) into result
    from public.transport_client_bills b left join public.transport_clients c on c.id=b.transport_client_id
    where b.id=fd.source_document_id;
  elsif fd.source_table = 'transport_transporter_statements' then
    select jsonb_build_object(
      'kind','transporter_statement','financial_document',to_jsonb(fd),'header',to_jsonb(s),
      'party',to_jsonb(t),
      'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.trip_date,l.trip_no) from public.transport_transporter_statement_trips l where l.statement_id=s.id and l.deleted_at is null),'[]'::jsonb)
    ) into result
    from public.transport_transporter_statements s left join public.transport_transporters t on t.id=s.transport_transporter_id
    where s.id=fd.source_document_id;
  elsif fd.source_table = 'transport_client_credit_notes' then
    select jsonb_build_object(
      'kind','credit_note','financial_document',to_jsonb(fd),'header',to_jsonb(n),
      'party',to_jsonb(c),'lines','[]'::jsonb
    ) into result
    from public.transport_client_credit_notes n left join public.transport_clients c on c.id=n.transport_client_id
    where n.id=fd.source_document_id;
  elsif fd.source_table = 'interior_billing_headers' then
    select jsonb_build_object(
      'kind','interior_bill','financial_document',to_jsonb(fd),'header',to_jsonb(h),
      'party',jsonb_build_object('name',coalesce(p.project_name,p.project_code)),
      'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.interior_billing_lines l where l.billing_header_id=h.id),'[]'::jsonb)
    ) into result
    from public.interior_billing_headers h left join public.projects p on p.id=h.project_id
    where h.id=fd.source_document_id;
  else
    result := jsonb_build_object('kind','generic','financial_document',to_jsonb(fd),'header',to_jsonb(fd),'party','{}'::jsonb,'lines','[]'::jsonb);
  end if;
  return coalesce(result, jsonb_build_object('kind','generic','financial_document',to_jsonb(fd),'header',to_jsonb(fd),'party','{}'::jsonb,'lines','[]'::jsonb));
end;
$$;
revoke all on function public.get_consolidated_source_document(uuid) from public;
grant execute on function public.get_consolidated_source_document(uuid) to authenticated;
