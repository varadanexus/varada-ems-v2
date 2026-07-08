-- Sprint 14H: close checklist period locks.

create or replace function public.close_accounting_checklist(p_checklist_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.accounting_close_checklists%rowtype;
  u uuid := public.current_app_user_id();
  v_open_tasks integer;
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-close-controls','approve')) then raise exception 'Not authorized to close accounting periods'; end if;
  select * into c from public.accounting_close_checklists where id=p_checklist_id for update;
  if c.id is null then raise exception 'Close checklist not found'; end if;
  select count(*) into v_open_tasks
  from public.accounting_close_tasks
  where checklist_id=c.id
    and status not in ('reviewed','not_applicable');
  if v_open_tasks > 0 then raise exception 'All close tasks must be reviewed or marked not applicable before locking the period'; end if;
  update public.accounting_close_checklists
  set status='closed', reviewed_by=u, locked_at=now(), updated_at=now()
  where id=c.id;
  if c.period_id is not null then
    update public.accounting_periods
    set status='closed', closed_at=now(), updated_at=now()
    where id=c.period_id and status in ('open','reopened');
  end if;
  update public.gst_return_periods
  set books_locked=true, reviewed_by=u, reviewed_at=coalesce(reviewed_at,now()), updated_at=now()
  where period_code=c.close_month;
  insert into public.accounting_control_evidence(control_code,control_area,period_code,entity_table,entity_id,checker_app_user_id,checker_action,evidence_payload,evidence_status)
  values('CA-PERIOD-CLOSE-LOCK','Close Controls',c.close_month,'accounting_close_checklists',c.id,u,'period_locked',jsonb_build_object('period_id',c.period_id,'locked_at',now()),'reviewed');
end;
$$;

create or replace function public.reopen_accounting_checklist(p_checklist_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.accounting_close_checklists%rowtype;
  u uuid := public.current_app_user_id();
begin
  if not (public.is_super_admin() or public.has_role_code('admin') or public.has_permission('central-accounts-close-controls','approve')) then raise exception 'Not authorized to reopen accounting periods'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'Reopen reason is required'; end if;
  select * into c from public.accounting_close_checklists where id=p_checklist_id for update;
  if c.id is null then raise exception 'Close checklist not found'; end if;
  update public.accounting_close_checklists
  set status='reopened', reviewed_by=u, locked_at=null, notes=concat_ws(E'\n',notes,'Reopened: '||p_reason), updated_at=now()
  where id=c.id;
  if c.period_id is not null then
    update public.accounting_periods
    set status='reopened', reopened_at=now(), updated_at=now()
    where id=c.period_id and status='closed';
  end if;
  update public.gst_return_periods
  set books_locked=false, updated_at=now()
  where period_code=c.close_month;
  insert into public.accounting_control_evidence(control_code,control_area,period_code,entity_table,entity_id,checker_app_user_id,checker_action,evidence_payload,evidence_status)
  values('CA-PERIOD-CLOSE-REOPEN','Close Controls',c.close_month,'accounting_close_checklists',c.id,u,'period_reopened',jsonb_build_object('period_id',c.period_id,'reason',p_reason,'reopened_at',now()),'exception');
end;
$$;

grant execute on function public.close_accounting_checklist(uuid) to authenticated;
grant execute on function public.reopen_accounting_checklist(uuid,text) to authenticated;
