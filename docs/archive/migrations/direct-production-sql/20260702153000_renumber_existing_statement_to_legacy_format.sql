-- ARCHIVED DIRECT-PRODUCTION SQL: not part of the active migration chain.
-- Sprint 13E.8b (applied to remote via MCP: renumber_existing_statement_to_legacy_format)
-- Renumber the existing transporter statement to the legacy format.
-- TS/26-27/0006 (2026-06-30) -> TSTAT/260630/001, including its financial_documents reference.
update public.transport_transporter_statements
set statement_no = 'TSTAT/' || to_char(statement_date, 'YYMMDD') || '/001',
    updated_at = now()
where statement_no = 'TS/26-27/0006' and deleted_at is null;

update public.financial_documents
set source_document_no = 'TSTAT/260630/001'
where source_document_no = 'TS/26-27/0006';
