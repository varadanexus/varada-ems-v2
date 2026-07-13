-- Teach Nexus the EMS workflows. Navigation actions are permission-filtered in
-- the client; save/post/approve operations continue to require user confirmation.

alter function public.chat_ai_answer(text, uuid, text) rename to chat_ai_status_answer;

create or replace function public.chat_ai_answer(p_actor_type text, p_actor_id uuid, p_body text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := lower(trim(coalesce(p_body, '')));
begin
  if p_actor_type = 'staff' and v_body ~ '(create|add|new|how).*(trip)|trip.*(create|add|new)' then
    return E'To create a trip:\n1. Open Create Trip.\n2. Select the client, transporter, truck, driver, route, and commodity.\n3. Enter trip date and quantity; rates are resolved from the rate master.\n4. Save the draft, attach required documents, then move it through dispatch and completion.\n\nI can open the permitted Create Trip workspace below. Final saving remains under your confirmation.';
  elsif p_actor_type = 'staff' and v_body ~ '(create|generate|new|how).*(bill|invoice)|bill.*(create|generate|new)' then
    return E'To generate a client bill:\n1. Complete the relevant trips and required documents.\n2. Open Client Billing and choose the client and billing date.\n3. Select eligible completed trips.\n4. Choose GST or non-GST treatment, review totals, generate, and submit for finance approval.\n\nI can open Client Billing below; you review the figures before generation.';
  elsif p_actor_type = 'staff' and v_body ~ '(record|add|new|how).*(receipt|collection)' then
    return E'To record a client receipt:\n1. Open Client Receipts.\n2. Select the client and bill.\n3. Enter receipt date, amount, mode, and bank/reference number.\n4. Verify the outstanding balance and save.\n\nI can open the receipt workspace below. Saving requires your confirmation.';
  elsif p_actor_type = 'staff' and v_body ~ '(create|generate|new|how).*(statement)|statement.*(create|generate|new)' then
    return E'To create a transporter statement:\n1. Ensure the trips are completed and costs are final.\n2. Open Transporter Statements and select the transporter.\n3. Select eligible trips, review deductions, penalties, GST input, and net payable.\n4. Generate and send it for approval before payment.';
  elsif p_actor_type = 'staff' and v_body ~ '(record|make|new|how).*(payment)|payment.*(record|make|new)' then
    return E'To record a transporter payment:\n1. Use an approved transporter statement.\n2. Open Transporter Payments.\n3. Enter payment date, amount, payment mode, and reference number.\n4. Reconcile the remaining payable and save.\n\nNexus will not post money movements without your final confirmation.';
  elsif p_actor_type = 'staff' and v_body ~ '(file|prepare|how|open).*(gst|gstr)|gst.*(file|prepare|return)' then
    return E'For GST filing:\n1. Open Central Accounts → GST Compliance.\n2. Choose the filing period and reconcile outward invoices, credit notes, receipts, and eligible input GST.\n3. Review exceptions and source-document PDFs.\n4. Lock the reviewed period, export the filing pack, and record the acknowledgement after filing.\n\nI can open GST Compliance below. A CA should review and confirm the filing.';
  elsif p_actor_type = 'staff' and v_body ~ '(annual tax|income tax|itr)' then
    return E'For annual tax work, open Central Accounts → Annual Tax. Select the financial year, reconcile the trial balance with GST/TDS and fixed assets, record adjustments, assemble the audit and return workpapers, and track filing acknowledgements. Nexus can guide the checklist, but the CA remains the final reviewer.';
  elsif p_actor_type = 'staff' and v_body ~ '(tds|withholding)' then
    return E'For TDS, open Central Accounts → TDS. Review deductee transactions, sections and rates, reconcile deductions and challans, prepare the quarterly return, resolve validation errors, and record filing certificates. Nexus can open the workspace below.';
  elsif p_actor_type = 'staff' and v_body ~ '(role|permission|access matrix)' then
    return E'To change access, open Roles & Permissions, choose the role, and grant View/Create/Edit/Delete per page. View controls page visibility; the action grants control what the user can do. Save the matrix, then have the affected user sign in again.';
  elsif p_actor_type = 'staff' and v_body ~ '(portal access|client login|transporter login|agent login)' then
    return E'To provide portal access, open Portal Access, select the portal type and linked business entity, create or select the portal user, set the access level, and activate the mapping. The portal user will only see data linked to that entity.';
  elsif p_actor_type = 'staff' and v_body ~ '(interior|project).*(create|new|how)' then
    return E'To start an interiors project, create or select the client, open Interiors Projects, enter the project scope and dates, then build spaces, design packages, BOQ/estimate, quotation, approvals, execution updates, billing, and closure. Nexus can open the project workspace below.';
  end if;

  return public.chat_ai_status_answer(p_actor_type, p_actor_id, p_body);
end;
$$;

grant execute on function public.chat_ai_status_answer(text, uuid, text) to anon, authenticated;
grant execute on function public.chat_ai_answer(text, uuid, text) to anon, authenticated;
