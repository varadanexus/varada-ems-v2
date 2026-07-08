-- Sprint 14J: align Central Accounts table RLS with page action permissions.
-- If a role is granted create/approve/post for a page, supporting table writes
-- must not silently fail because the policy only checks edit.

do $$
declare
  r record;
begin
  for r in select * from (values
    ('accounting_vendors','central-accounts-payables'),
    ('purchase_bills','central-accounts-payables'),
    ('vendor_advances','central-accounts-payables'),
    ('vendor_settlements','central-accounts-payables'),
    ('bank_statement_imports','central-accounts-treasury'),
    ('bank_statement_lines','central-accounts-treasury'),
    ('bank_reconciliation_certificates','central-accounts-treasury'),
    ('gst_return_periods','central-accounts-gst-compliance'),
    ('gst_document_classifications','central-accounts-gst-compliance'),
    ('gst_2b_import_batches','central-accounts-gst-compliance'),
    ('gst_2b_items','central-accounts-gst-compliance'),
    ('statutory_filing_records','central-accounts-annual-tax'),
    ('annual_tax_workpapers','central-accounts-annual-tax'),
    ('tds_sections','central-accounts-tds'),
    ('tds_deductees','central-accounts-tds'),
    ('tds_deductions','central-accounts-tds'),
    ('fixed_assets','central-accounts-fixed-assets'),
    ('fixed_asset_movements','central-accounts-fixed-assets'),
    ('fixed_asset_depreciation_runs','central-accounts-fixed-assets'),
    ('accounting_close_checklists','central-accounts-close-controls'),
    ('accounting_close_tasks','central-accounts-close-controls'),
    ('accounting_budgets','central-accounts-budgets'),
    ('accounting_budget_lines','central-accounts-budgets'),
    ('profitability_snapshots','central-accounts-budgets'),
    ('audit_workspace_requests','central-accounts-audit'),
    ('accounting_control_evidence','central-accounts-audit')
  ) as x(table_name,module_code) loop
    execute format('drop policy if exists %I on public.%I', r.table_name || '_write', r.table_name);
    execute format('drop policy if exists %I on public.%I', r.table_name || '_write_aligned', r.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (
        public.is_super_admin()
        or public.has_role_code(''admin'')
        or public.has_permission(%L,''edit'')
        or public.has_permission(%L,''create'')
        or public.has_permission(%L,''approve'')
        or public.has_permission(%L,''post'')
      ) with check (
        public.is_super_admin()
        or public.has_role_code(''admin'')
        or public.has_permission(%L,''edit'')
        or public.has_permission(%L,''create'')
        or public.has_permission(%L,''approve'')
        or public.has_permission(%L,''post'')
      )',
      r.table_name || '_write_aligned',
      r.table_name,
      r.module_code, r.module_code, r.module_code, r.module_code,
      r.module_code, r.module_code, r.module_code, r.module_code
    );
  end loop;
end$$;
