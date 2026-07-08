-- Sprint 14F: maker-checker evidence for manual voucher lifecycle.

create or replace function public.create_accounting_voucher(
  p_voucher_type text, p_voucher_date date, p_division_id uuid,
  p_narration text, p_reference_no text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := public.current_app_user_id();
  v_id uuid := gen_random_uuid();
  v_month text := to_char(p_voucher_date,'YYYYMM');
  v_number integer;
  v_no text;
  v_debit numeric;
  v_credit numeric;
  v_count integer;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-vouchers','create')) then raise exception 'Not authorized to create vouchers'; end if;
  if v_user is null then raise exception 'Current application user not found'; end if;
  if p_narration is null or btrim(p_narration)='' then raise exception 'Narration is required'; end if;
  select count(*),coalesce(sum((x->>'debit_amount')::numeric),0),coalesce(sum((x->>'credit_amount')::numeric),0)
  into v_count,v_debit,v_credit from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) x;
  if v_count < 2 or v_debit <= 0 or v_debit <> v_credit then raise exception 'Voucher requires at least two balanced lines'; end if;
  insert into public.accounting_voucher_sequences(voucher_month,last_number) values(v_month,1)
  on conflict(voucher_month) do update set last_number=accounting_voucher_sequences.last_number+1,updated_at=now()
  returning last_number into v_number;
  v_no := 'JV-'||v_month||'-'||lpad(v_number::text,5,'0');
  insert into public.accounting_vouchers(id,voucher_no,voucher_type,voucher_date,division_id,narration,reference_no,status,total_debit,total_credit,created_by)
  values(v_id,v_no,p_voucher_type,p_voucher_date,p_division_id,p_narration,p_reference_no,'submitted',v_debit,v_credit,v_user);
  insert into public.accounting_voucher_lines(voucher_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo)
  select v_id,ord,(x->>'ledger_account_id')::uuid,coalesce((nullif(x->>'division_id',''))::uuid,p_division_id),
    (nullif(x->>'counterparty_dimension_id',''))::uuid,(nullif(x->>'project_dimension_id',''))::uuid,(nullif(x->>'profit_center_dimension_id',''))::uuid,
    coalesce((x->>'debit_amount')::numeric,0),coalesce((x->>'credit_amount')::numeric,0),nullif(x->>'line_memo','')
  from jsonb_array_elements(p_lines) with ordinality q(x,ord);

  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,maker_action,evidence_payload)
  values('CA-VOUCHER-MAKER','Manual Voucher','accounting_vouchers',v_id,v_user,'created_and_submitted',jsonb_build_object('voucher_no',v_no,'voucher_type',p_voucher_type,'total_debit',v_debit,'total_credit',v_credit,'line_count',v_count));

  return v_id;
end;$$;

create or replace function public.approve_accounting_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v public.accounting_vouchers%rowtype; u uuid:=public.current_app_user_id();
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-vouchers','approve')) then raise exception 'Not authorized to approve vouchers'; end if;
  select * into v from public.accounting_vouchers where id=p_voucher_id for update;
  if v.status <> 'submitted' then raise exception 'Only submitted vouchers can be approved'; end if;
  if v.created_by=u and not public.is_super_admin() then raise exception 'Maker cannot approve the same voucher'; end if;
  update public.accounting_vouchers set status='approved',approved_by=u,approved_at=now(),updated_at=now() where id=p_voucher_id;

  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-VOUCHER-CHECKER','Manual Voucher','accounting_vouchers',p_voucher_id,v.created_by,u,'submitted','approved',jsonb_build_object('voucher_no',v.voucher_no,'status_before',v.status,'approved_at',now()),'reviewed');
end;$$;

create or replace function public.post_accounting_voucher(p_voucher_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v public.accounting_vouchers%rowtype; u uuid:=public.current_app_user_id(); period_id uuid; fy_id uuid;
  journal_id uuid:=gen_random_uuid(); posting_no text;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-vouchers','post')) then raise exception 'Not authorized to post vouchers'; end if;
  select * into v from public.accounting_vouchers where id=p_voucher_id for update;
  if v.status <> 'approved' then raise exception 'Only approved vouchers can be posted'; end if;
  period_id:=public.get_central_accounts_period_id(v.voucher_date);
  if period_id is null then raise exception 'No open accounting period for voucher date'; end if;
  select fiscal_year_id into fy_id from public.accounting_periods where id=period_id;
  posting_no:=public.generate_central_accounts_posting_sequence(v.voucher_date);
  insert into public.journal_entries(id,journal_no,posting_sequence,accounting_period_id,fiscal_year_id,entry_date,source_module,source_document_id,source_document_family,division_id,status,created_by,posted_by,posted_at)
  values(journal_id,v.voucher_no,posting_no,period_id,fy_id,v.voucher_date,'central_accounts',v.id,'MANUAL_VOUCHER',v.division_id,'posted',v.created_by,u,now());
  insert into public.journal_lines(journal_entry_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo)
  select journal_id,line_no,ledger_account_id,division_id,counterparty_dimension_id,project_dimension_id,profit_center_dimension_id,debit_amount,credit_amount,line_memo
  from public.accounting_voucher_lines where voucher_id=v.id order by line_no;
  update public.accounting_vouchers set status='posted',posted_by=u,posted_at=now(),journal_entry_id=journal_id,updated_at=now() where id=v.id;

  insert into public.accounting_control_evidence(control_code,control_area,entity_table,entity_id,maker_app_user_id,checker_app_user_id,maker_action,checker_action,evidence_payload,evidence_status)
  values('CA-VOUCHER-POSTING','Manual Voucher','accounting_vouchers',p_voucher_id,v.created_by,u,'approved','posted',jsonb_build_object('voucher_no',v.voucher_no,'journal_entry_id',journal_id,'posting_sequence',posting_no,'posted_at',now()),'reviewed');

  return journal_id;
end;$$;

grant execute on function public.create_accounting_voucher(text,date,uuid,text,text,jsonb) to authenticated;
grant execute on function public.approve_accounting_voucher(uuid) to authenticated;
grant execute on function public.post_accounting_voucher(uuid) to authenticated;
