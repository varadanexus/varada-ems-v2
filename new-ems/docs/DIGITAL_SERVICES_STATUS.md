# Digital Services module — build status & goal

**GOAL: complete this module after the usage limit is restored.**

## Done
- Schema + full workflow (leads → clients → projects → deliverables), all invoice types.
- Central Accounts posting bridge for invoices (`bridge_ds_invoice_to_central_accounts`).
- Central invoice register `INV/GB/<FY>/NNN` shared by Transport + Interiors + Digital Services.
- Retainers/subscriptions + daily `pg_cron` auto-invoicing (`ds-daily-retainer-invoicing`).
- Email invoice to client (branded + PDF attached, archived to Drive), WhatsApp via Twilio, EMS notifications.
- Premium **HTML→PDF** invoice (html2canvas): logo/signature/stamp, GST/CGST-SGST/IGST, Place of Supply, amount in words, non-GST (0-tax) = Bill of Supply. In-app PDF viewer + download.
- Seller GSTIN `37AAKCV7495B1ZV` (from transporter bill) + IGST-vs-CGST/SGST by state.
- Edit + admin-only (`admin@varadanexus.com`) hard delete for invoices & retainers; deleting the latest reclaims its number.
- **Credit Notes** with unified central register `CR/<FY>/NNN` (shared w/ Transport), CA bridge, admin delete + reclaim, credit-note PDF.
- **Credit note ↔ invoice linking**: issuing a CN against an invoice reduces outstanding via `amount_credited`; invoice marked `paid` when payments+credits clear the total (`ds_apply_invoice_credit`).
- Vendor costs (subcontractors) + ITC + per-project margin + dashboard KPIs (Vendor Cost, Gross Margin, ITC, Net GST Payable).

- **Payables bridge (DONE)**: vendor cost → Central Accounts purchase bill (`ds_post_cost_to_payables`), auto-creates the accounting vendor, splits CGST/SGST or IGST, ITC to the input-tax account (or loaded to expense when not ITC-eligible), created as `submitted` for review/posting in the Payables screen. Configurable default accounts in DS Settings (`ds_payables_defaults`). "→ Payables" button on each vendor cost.

## Remaining (finish these)
1. **Interiors credit-note numbering** → N/A: Interiors has no credit-note number generator (nothing to unify). Only Transport + DS share the central CR register.
2. **Deploy the last migration**: `npm run db:push` for `20260707190000_sprint17j_ds_payables_bridge` (renamed from 120000 to sit after the meetings migration on remote; all earlier DS migrations are already applied). Redeploy `email-integrations` if invoice-email PDF attachment isn't live. Hard-refresh (caches: billing `ds-12`, projects `ds-3`, settings `ds-2`, dashboard `ds-2`).
3. **Configure** DS Settings → Payables Defaults (Expense + Payable accounts, optional Input-GST/ITC) before using "→ Payables".
4. **End-to-end QA** of every flow.
5. Optional polish: WhatsApp approved invoice template, bank details on PDF, Interiors margin parity.

## Key files
- Migrations: `supabase/migrations/20260706200000_*` … `20260707110000_*`
- API: `shared/digital-services-api.js`
- PDF: `shared/ds-invoice-pdf.js`
- Pages: `shared/page-digital-services-{dashboard,leads,clients,projects,billing,settings}.js`
- Edge (email): `supabase/functions/email-integrations/index.ts`
