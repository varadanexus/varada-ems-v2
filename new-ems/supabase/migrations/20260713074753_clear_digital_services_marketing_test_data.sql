-- Authorized one-time cleanup: remove transactional/test records from the
-- unified Digital Services & Marketing workspace while retaining module
-- configuration, service types, permissions, roles, and accounting defaults.

do $$
begin
  if exists (
    select 1
    from public.financial_documents
    where lower(source_module) in ('digital-services', 'digital_services', 'marketing')
  ) then
    raise exception 'Digital Services cleanup aborted: linked Central Accounts documents exist';
  end if;
end;
$$;

-- Remove any portal credentials that belong exclusively to these test masters.
create temporary table ds_marketing_test_portal_users on commit drop as
select distinct portal_user_id
from public.external_portal_access
where lower(source_module) in ('digital-services', 'digital_services', 'marketing')
   or record_type in ('ds_clients', 'marketing_clients', 'marketing_vendors');

delete from public.external_portal_access
where lower(source_module) in ('digital-services', 'digital_services', 'marketing')
   or record_type in ('ds_clients', 'marketing_clients', 'marketing_vendors');

delete from public.external_portal_users u
using ds_marketing_test_portal_users test_user
where u.id = test_user.portal_user_id
  and not exists (
    select 1 from public.external_portal_access a where a.portal_user_id = u.id
  );

-- White-label delivery records. Child rows are listed explicitly so the scope
-- remains clear even though several foreign keys also cascade.
delete from public.marketing_message_authorship;
delete from public.marketing_query_messages;
delete from public.marketing_queries;
delete from public.marketing_deliverables;
delete from public.marketing_project_assignments;
delete from public.marketing_project_finance;
delete from public.marketing_projects;
delete from public.marketing_vendors;
delete from public.marketing_clients;

-- Digital Services operational and billing records.
delete from public.ds_credit_note_items;
delete from public.ds_credit_notes;
delete from public.ds_payments;
delete from public.ds_invoice_items;
delete from public.ds_invoices;
delete from public.ds_project_costs;
delete from public.ds_deliverables;
delete from public.ds_subscriptions;
delete from public.ds_projects;
delete from public.ds_leads;
delete from public.ds_clients;
