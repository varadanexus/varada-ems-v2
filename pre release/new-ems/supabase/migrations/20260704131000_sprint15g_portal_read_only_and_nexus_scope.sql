-- Portal business-data policy:
-- * no portal-created operational/financial records
-- * approval decisions only where an approve-tier grant already exists
-- * Nexus never provides an internal workflow or cross-entity data to a portal actor

drop policy if exists interior_client_approvals_insert_client_portal on public.interior_client_approvals;

revoke execute on function public.transport_agent_portal_request_withdrawal(text, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.transport_agent_portal_cancel_withdrawal(text, uuid) from public, anon, authenticated;

alter function public.chat_ai_answer(text, uuid, text) rename to chat_ai_operator_answer;

create or replace function public.chat_ai_answer(p_actor_type text, p_actor_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := lower(trim(coalesce(p_body, '')));
  v_count bigint := 0;
  v_open bigint := 0;
  v_amount numeric := 0;
begin
  if p_actor_type = 'staff'
     and v_body ~ '(create|add|new).*(trip)|trip.*(create|add|new)'
     and not (public.is_super_admin() or public.has_permission('transport-create-trip', 'create')) then
    return 'You do not have Create permission for the Create Trip page. Nexus can still help you view permitted trip information, but it will not prepare or submit a trip.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(create|generate|new).*(bill|invoice)'
     and not (public.is_super_admin() or public.has_permission('transport-client-billing', 'create')) then
    return 'You do not have Create permission for Client Billing. Nexus will not prepare or generate a bill for this account.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(record|add|new).*(receipt|collection)'
     and not (public.is_super_admin() or public.has_permission('transport-client-receipts', 'create')) then
    return 'You do not have Create permission for Client Receipts. Nexus will not prepare or record a receipt.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(create|generate|new).*(statement)'
     and not (public.is_super_admin() or public.has_permission('transport-transporter-statements', 'create')) then
    return 'You do not have Create permission for Transporter Statements. Nexus will not prepare or generate a statement.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(record|make|new).*(payment)'
     and not (public.is_super_admin() or public.has_permission('transport-transporter-payments', 'create')) then
    return 'You do not have Create permission for Transporter Payments. Nexus will not prepare or record a payment.';
  end if;

  if p_actor_type <> 'staff'
     and v_body ~ '(create|add|generate|record|post|delete|edit|change).*(trip|bill|invoice|receipt|statement|payment|expense|project|withdrawal)' then
    return E'Portal access is read-only for business records. You cannot create or change trips, bills, invoices, receipts, statements, payments, expenses, projects, or withdrawals.\n\nYou may view only records linked to your own permitted client, transporter, agent, vendor, or project. If an existing approval has been assigned to you with approval access, you may approve, reject, or request revision from that approval item.';
  end if;

  if p_actor_type <> 'staff'
     and v_body ~ '(other client|other transporter|other agent|internal financial|margin|company margin|profit|all clients|all transporters|rate paid|transporter rate|client rate)' then
    return 'That information is restricted. Portal users can only access their own linked records and the financial values intended for their portal type. Internal margins, opposite-party rates, company accounts, and other entities are not available.';
  end if;

  if p_actor_type <> 'staff' and v_body ~ '(approve|approval|reject|revision)' then
    return 'You can act only on an existing pending approval linked to your permitted account or project, and only when approval access was granted. Open the Approvals section, review the attached details, then choose Approve, Reject, or Request Revision. Nexus will not create a new operational or financial record.';
  end if;

  if p_actor_type = 'transport_portal'
     and exists (select 1 from public.transport_agent_portal_access a where a.portal_user_id = p_actor_id and a.is_active)
     and not exists (select 1 from public.transport_client_portal_access a where a.portal_user_id = p_actor_id and a.is_active)
     and not exists (select 1 from public.transport_transporter_portal_access a where a.portal_user_id = p_actor_id and a.is_active)
     and v_body ~ '(trip|dispatch|transit|delivery|commission)' then
    select count(distinct t.id),
           count(distinct t.id) filter (where lower(coalesce(t.status, '')) not in ('completed', 'cancelled')),
           coalesce(sum(
             case
               when m.commission_type = 'per_mt' then coalesce(m.commission_value, 0) * coalesce(t.quantity_mt, 0)
               when m.commission_type = 'percentage_margin' then coalesce(t.company_margin, 0) * coalesce(m.commission_value, 0) / 100
               else coalesce(m.commission_value, 0)
             end
           ), 0)
      into v_count, v_open, v_amount
    from public.transport_trips t
    join lateral (
      select m.commission_type, m.commission_value
      from public.transport_truck_agent_commission_mapping m
      join public.transport_agent_portal_access a
        on a.transport_agent_id = m.transport_agent_id
       and a.portal_user_id = p_actor_id
       and a.is_active
      where m.truck_id = t.truck_id
        and m.is_active
        and m.deleted_at is null
        and (m.effective_from is null or m.effective_from <= t.trip_date)
        and (m.effective_to is null or m.effective_to >= t.trip_date)
      order by m.effective_from desc nulls last, m.created_at desc
      limit 1
    ) m on true
    where t.deleted_at is null;

    return format(
      'Your linked agent account has %s trip(s): %s open and %s completed/cancelled. Your calculated commission across those linked trips is ₹%s. No client billing, transporter settlement, company margin, or other agent data is included.',
      v_count, v_open, v_count - v_open, to_char(v_amount, 'FM99,99,99,99,990.00')
    );
  end if;

  return public.chat_ai_operator_answer(p_actor_type, p_actor_id, p_body);
end;
$$;

grant execute on function public.chat_ai_operator_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.chat_ai_answer(text, uuid, text) to anon, authenticated;
