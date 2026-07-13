-- Add module-wide operating knowledge while preserving the access/privacy guard.

alter function public.chat_ai_answer(text, uuid, text) rename to chat_ai_access_answer;

create or replace function public.chat_ai_answer(p_actor_type text, p_actor_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := lower(trim(coalesce(p_body, '')));
begin
  if p_actor_type = 'staff'
     and v_body ~ '(work[[:space:]]*flow|process|how.*work|module)'
     and v_body ~ 'transp[o]+rt' then
    return E'Transportation workflow:\n1. Masters — create clients, transporters, commodities, routes, trucks, drivers, agents, mappings, and rates.\n2. Trip planning — create a draft trip; select parties, vehicle, route, commodity, quantity, and effective rates.\n3. Operations — assign and dispatch, update the status timeline, attach challans/weight bills, add trip expenses, and complete delivery.\n4. Client commercial — group eligible completed trips into a client bill, apply GST when required, approve the invoice, issue credit notes when needed, and record receipts.\n5. Transporter settlement — generate statements from completed trips, apply deductions/penalties and GST input, approve the statement, and record payments.\n6. Agent settlement — calculate mapped truck commission and let authorised EMS staff process withdrawals and penalties.\n7. Finance control — review approvals, ledger entries, outstanding balances, and posting into Central Accounts.\n8. Reporting — monitor trip status, billing, collections, payables, margin, documents, and audit history.\n\nEach step is limited by the signed-in user’s View/Create/Edit/Delete/Approve/Post permissions. Nexus will only offer actions allowed by those grants.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(work[[:space:]]*flow|process|how.*work|module)'
     and v_body ~ '(central account|accounting|finance|gst|tax)' then
    return E'Central Accounts workflow:\n1. Consolidate approved bills, invoices, credit notes, receipts, statements, payments, and expenses from every division.\n2. Validate documents in the posting queue and resolve exceptions.\n3. Approve and post balanced entries into journals and ledgers.\n4. Reconcile receivables, payables, bank/treasury, GST, TDS, and inter-division balances.\n5. Manage vouchers, fixed assets, budgets, close controls, and period locks.\n6. Prepare GST returns, annual-tax workpapers, audit evidence, and management reports.\n7. Record filing acknowledgements and preserve the audit trail.\n\nNexus follows the user’s page and action permissions; posting, approval, filing, and payment actions always require explicit confirmation.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(work[[:space:]]*flow|process|how.*work|module)'
     and v_body ~ '(interior|project)' then
    return E'Interiors workflow:\n1. Capture the lead and create the client/project.\n2. Define spaces, design packages, finish schedules, and material specifications.\n3. Build the BOQ, estimate, and client quotation.\n4. Obtain internal and client approvals; manage revision and variation requests.\n5. Plan workforce/materials, record site progress and photos, and issue approved change orders.\n6. Create milestone bills and send approved accounting events to Central Accounts.\n7. Complete snagging, handover, warranty records, client sign-off, and project closure.\n\nPortal clients only see their assigned project information and may decide existing approvals when approve access is granted.';
  end if;

  if p_actor_type = 'staff'
     and v_body ~ '(work[[:space:]]*flow|process|how.*work|module)'
     and v_body ~ '(admin|role|permission|portal access|user)' then
    return E'Administration workflow:\n1. Create staff identities and assign divisions.\n2. Configure roles and page-level View/Create/Edit/Delete/Approve/Post/Export grants.\n3. Provision client, transporter, agent, vendor, or interiors portal access and link only the permitted business entity.\n4. Configure company, tax, document, and integration settings.\n5. Review sessions, audit events, access changes, and security exceptions.\n\nPortal identities remain business-record read-only except for decisions on specifically assigned approvals.';
  end if;

  return public.chat_ai_access_answer(p_actor_type, p_actor_id, p_body);
end;
$$;

grant execute on function public.chat_ai_access_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.chat_ai_answer(text, uuid, text) to anon, authenticated;
