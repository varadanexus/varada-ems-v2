-- Centralised Onboarding — per-division document checklists + versioned T&C seed.
--
-- The T&C below are professional commercial templates (India law) curated per
-- division. They are a strong starting point and MUST be reviewed and approved by
-- the Company's advocate before going live. Update by inserting a new version row
-- (is_active = true) — the unique partial index keeps exactly one active per division.

begin;

-- ─── Document checklists ─────────────────────────────────────────────────────
insert into public.onboarding_document_checklists (division_code, document_key, label, description, is_required, sort_order)
values
  -- Common (all divisions)
  ('hospital-projects','letter_of_authorization','Letter of Authorization','Authorisation on entity letterhead naming the signatory acting on the entity''s behalf.',true,10),
  ('hospital-projects','entity_registration','Certificate of Incorporation / Registration','Incorporation certificate, partnership deed, trust deed or registration proof as applicable.',true,20),
  ('hospital-projects','entity_pan','Entity PAN','PAN card of the onboarding entity.',true,30),
  ('hospital-projects','gst_certificate','GST Registration Certificate','GST certificate, if registered.',false,40),
  ('hospital-projects','signatory_id','Authorised Signatory ID','Government photo ID of the authorised signatory.',true,50),
  ('hospital-projects','address_proof','Registered Office Address Proof','Utility bill / lease / registration showing the registered address.',true,60),
  ('hospital-projects','cancelled_cheque','Cancelled Cheque / Bank Details','For banking and settlement verification.',true,70),
  -- Hospital-specific
  ('hospital-projects','hospital_license','Hospital / Establishment Licence','Clinical establishment or hospital operating licence, where applicable.',false,80),
  ('hospital-projects','site_documents','Site / Land Ownership or Lease','Ownership or lease documents for the hospital project site.',false,90),

  ('interiors','letter_of_authorization','Letter of Authorization','Authorisation on entity letterhead naming the signatory acting on the entity''s behalf.',true,10),
  ('interiors','entity_registration','Certificate of Incorporation / Registration','Incorporation certificate, partnership deed, trust deed or registration proof as applicable.',true,20),
  ('interiors','entity_pan','Entity / Individual PAN','PAN of the onboarding client.',true,30),
  ('interiors','gst_certificate','GST Registration Certificate','GST certificate, if registered.',false,40),
  ('interiors','signatory_id','Authorised Signatory ID','Government photo ID of the authorised signatory.',true,50),
  ('interiors','address_proof','Address Proof','Address proof of the client / project premises.',true,60),
  ('interiors','cancelled_cheque','Cancelled Cheque / Bank Details','For banking and settlement verification.',false,70),
  ('interiors','site_ownership','Site Ownership / Lease / NOC','Ownership, lease or no-objection for the premises to be designed.',true,80),
  ('interiors','floor_plan','Existing Floor Plan / Drawings','Available architectural drawings or measurements.',false,90),

  ('transport','letter_of_authorization','Letter of Authorization','Authorisation on entity letterhead naming the signatory acting on the entity''s behalf.',true,10),
  ('transport','entity_registration','Certificate of Incorporation / Registration','Incorporation certificate, partnership deed, trust deed or registration proof as applicable.',true,20),
  ('transport','entity_pan','Entity PAN','PAN card of the onboarding entity.',true,30),
  ('transport','gst_certificate','GST Registration Certificate','GST certificate, if registered.',true,40),
  ('transport','signatory_id','Authorised Signatory ID','Government photo ID of the authorised signatory.',true,50),
  ('transport','address_proof','Registered Office Address Proof','Utility bill / lease / registration showing the registered address.',true,60),
  ('transport','cancelled_cheque','Cancelled Cheque / Bank Details','For banking and settlement verification.',true,70),
  ('transport','consignor_details','Consignor / Consignee Details','Key loading/unloading points and material description.',false,80),

  ('digital-services','letter_of_authorization','Letter of Authorization','Authorisation on entity letterhead naming the signatory acting on the entity''s behalf.',true,10),
  ('digital-services','entity_registration','Certificate of Incorporation / Registration','Incorporation certificate, partnership deed, trust deed or registration proof as applicable.',true,20),
  ('digital-services','entity_pan','Entity / Individual PAN','PAN of the onboarding client.',true,30),
  ('digital-services','gst_certificate','GST Registration Certificate','GST certificate, if registered.',false,40),
  ('digital-services','signatory_id','Authorised Signatory ID','Government photo ID of the authorised signatory.',true,50),
  ('digital-services','address_proof','Address Proof','Address proof of the client.',true,60),
  ('digital-services','cancelled_cheque','Cancelled Cheque / Bank Details','For banking and settlement verification.',false,70),
  ('digital-services','brand_assets','Brand Assets','Logo, brand guidelines and existing creative assets, if any.',false,80),
  ('digital-services','account_access','Website / Social Handles & Access','Handles/URLs and, where applicable, delegated access for managed channels.',false,90)
on conflict (division_code, document_key) do update
set label = excluded.label,
    description = excluded.description,
    is_required = excluded.is_required,
    sort_order = excluded.sort_order,
    is_active = true;

-- ─── Terms & Conditions (one active version per division) ────────────────────
insert into public.onboarding_terms (division_code, version, title, body, content_hash, effective_at, is_active)
values
(
  'hospital-projects', '2026-08-05-v1',
  'Varada Nexus — Hospital Projects Client Onboarding Terms & Conditions',
  $onb$
<h2>Hospital Projects — Client Engagement Terms &amp; Conditions</h2>
<p>These Terms and Conditions (&ldquo;Terms&rdquo;) govern the engagement between Varada Nexus Private Limited (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) and the client entity completing this onboarding (&ldquo;Client&rdquo;, &ldquo;you&rdquo;) in relation to hospital construction, project management and medical-equipment procurement services (the &ldquo;Services&rdquo;). By accepting these Terms and submitting your onboarding, you confirm that you are duly authorised to bind the Client and that all information and documents provided are true, complete and current.</p>
<h3>1. Definitions</h3>
<p>&ldquo;Project&rdquo; means the hospital or healthcare-infrastructure works described in the applicable proposal, work order or agreement. &ldquo;Deliverables&rdquo; means the works, goods, equipment and reports to be provided. &ldquo;Confidential Information&rdquo; means non-public information disclosed by either party.</p>
<h3>2. Scope of Services</h3>
<p>The Company will provide the Services described in each mutually agreed proposal, work order or agreement (&ldquo;Order&rdquo;). These Terms apply to every Order and prevail in case of conflict, unless an Order expressly states otherwise and is signed by both parties. Procurement of medical equipment is subject to manufacturer/supplier availability, specifications and lead times.</p>
<h3>3. Client Obligations</h3>
<p>The Client shall: (a) provide timely site access, approvals, drawings, licences and clearances; (b) nominate an authorised representative for decisions; (c) obtain and maintain all statutory permissions applicable to the healthcare establishment; and (d) ensure the accuracy of all information and documents furnished during onboarding and thereafter.</p>
<h3>4. Fees, Invoicing and Payment</h3>
<p>Fees are as set out in the applicable Order. Unless stated otherwise, invoices are payable within fifteen (15) days of the invoice date. Overdue amounts may attract interest at 1.5% per month or the maximum permitted by law, whichever is lower. Amounts are exclusive of taxes.</p>
<h3>5. Taxes</h3>
<p>All fees are exclusive of GST and other applicable taxes, duties and levies, which the Client shall bear. Each party is responsible for taxes on its own income.</p>
<h3>6. Change Orders</h3>
<p>Any change to scope, specifications, timelines or quantities shall be documented and may alter fees and schedules. No variation is binding unless recorded in writing.</p>
<h3>7. Confidentiality</h3>
<p>Each party shall keep the other&rsquo;s Confidential Information secret, use it only for the engagement, and protect it with reasonable care. This clause survives termination.</p>
<h3>8. Intellectual Property</h3>
<p>Pre-existing intellectual property remains with its owner. Project-specific deliverables prepared for the Client transfer on full payment, save for the Company&rsquo;s tools, know-how and templates, which remain the Company&rsquo;s property.</p>
<h3>9. Data Protection</h3>
<p>The Company processes personal data and documents provided during onboarding solely to deliver the Services, verify identity, and meet legal obligations, in accordance with applicable Indian data-protection law. Documents are stored securely and shared only with personnel and partners who need them for the engagement.</p>
<h3>10. Warranties</h3>
<p>Each party warrants it has authority to enter into these Terms. Works and equipment are warranted as stated in the applicable Order and by the relevant manufacturer; save as expressly stated, all other warranties are excluded to the extent permitted by law.</p>
<h3>11. Indemnity</h3>
<p>The Client shall indemnify the Company against claims arising from the Client&rsquo;s breach, misstatement, or failure to obtain required permissions.</p>
<h3>12. Limitation of Liability</h3>
<p>Neither party is liable for indirect or consequential loss. The Company&rsquo;s aggregate liability under an Order shall not exceed the fees paid by the Client for that Order in the preceding twelve (12) months, except for liability that cannot be limited by law.</p>
<h3>13. Term and Termination</h3>
<p>The engagement continues until the Order is completed or terminated. Either party may terminate for material breach not cured within thirty (30) days of notice. Accrued fees and costs remain payable on termination.</p>
<h3>14. Force Majeure</h3>
<p>Neither party is liable for delay or failure caused by events beyond its reasonable control.</p>
<h3>15. Governing Law and Dispute Resolution</h3>
<p>These Terms are governed by the laws of India. Disputes shall be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at the Company&rsquo;s registered office, with the courts there having exclusive jurisdiction subject to arbitration.</p>
<h3>16. General</h3>
<p>These Terms, with the applicable Order, form the entire agreement. If any provision is unenforceable, the remainder stands. No waiver is implied by delay.</p>
  $onb$,
  'onb-hospital-projects-2026-08-05-v1', '2026-08-05 00:00:00+05:30', true
),
(
  'interiors', '2026-08-05-v1',
  'Varada Nexus — Interiors Client Onboarding Terms & Conditions',
  $onb$
<h2>Interiors — Client Engagement Terms &amp; Conditions</h2>
<p>These Terms and Conditions (&ldquo;Terms&rdquo;) govern the engagement between Varada Nexus Private Limited (&ldquo;Company&rdquo;) and the client completing this onboarding (&ldquo;Client&rdquo;) for interior design, fit-out and related services (the &ldquo;Services&rdquo;). By accepting these Terms you confirm you are authorised to bind the Client and that the information and documents provided are true, complete and current.</p>
<h3>1. Definitions</h3>
<p>&ldquo;Project&rdquo; means the interiors scope described in the applicable proposal, quotation or work order. &ldquo;Deliverables&rdquo; means designs, drawings, specifications, materials and installation works agreed with the Client.</p>
<h3>2. Scope of Services</h3>
<p>The Company provides design and/or execution Services described in each mutually agreed proposal, quotation or work order (&ldquo;Order&rdquo;). These Terms apply to every Order and prevail in case of conflict unless an Order signed by both parties states otherwise. Visuals and samples are indicative; natural variation in materials and finishes is not a defect.</p>
<h3>3. Client Obligations</h3>
<p>The Client shall provide timely site access, approvals, existing drawings, and decisions; obtain society/landlord/statutory permissions where required; and ensure the accuracy of information and documents furnished during onboarding.</p>
<h3>4. Fees, Invoicing and Payment</h3>
<p>Fees, milestones and advances are as set out in the applicable Order. Unless stated otherwise, milestone invoices are payable within seven (7) days. Work may be paused for overdue payments. Overdue amounts may attract interest at 1.5% per month or the maximum permitted by law.</p>
<h3>5. Taxes</h3>
<p>Fees are exclusive of GST and other applicable taxes, which the Client shall bear.</p>
<h3>6. Variations and Change Orders</h3>
<p>Changes to design, materials, quantities or scope shall be recorded in writing and may alter fees and timelines. Bespoke and made-to-order items are non-cancellable once production begins.</p>
<h3>7. Confidentiality</h3>
<p>Each party shall keep the other&rsquo;s Confidential Information secret and use it only for the engagement. This clause survives termination.</p>
<h3>8. Intellectual Property</h3>
<p>Design concepts, drawings and documents remain the Company&rsquo;s intellectual property until full payment, upon which a licence to use them for the Project is granted. The Company may photograph completed work for its portfolio unless the Client objects in writing.</p>
<h3>9. Data Protection</h3>
<p>Personal data and documents provided during onboarding are processed solely to deliver the Services, verify identity, and meet legal obligations, in accordance with applicable Indian data-protection law, and stored securely.</p>
<h3>10. Warranties</h3>
<p>Workmanship is warranted as stated in the applicable Order. Materials carry the relevant manufacturer&rsquo;s warranty. Save as expressly stated, other warranties are excluded to the extent permitted by law.</p>
<h3>11. Indemnity</h3>
<p>The Client shall indemnify the Company against claims arising from the Client&rsquo;s breach, misstatement, or failure to obtain required permissions.</p>
<h3>12. Limitation of Liability</h3>
<p>Neither party is liable for indirect or consequential loss. The Company&rsquo;s aggregate liability under an Order shall not exceed the fees paid for that Order, except for liability that cannot be limited by law.</p>
<h3>13. Term and Termination</h3>
<p>The engagement continues until the Order is completed or terminated for material breach not cured within thirty (30) days of notice. Costs incurred and works completed remain payable.</p>
<h3>14. Force Majeure</h3>
<p>Neither party is liable for delay or failure caused by events beyond its reasonable control.</p>
<h3>15. Governing Law and Dispute Resolution</h3>
<p>These Terms are governed by the laws of India. Disputes shall be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at the Company&rsquo;s registered office, with courts there having exclusive jurisdiction subject to arbitration.</p>
<h3>16. General</h3>
<p>These Terms with the applicable Order form the entire agreement. Severability and non-waiver apply.</p>
  $onb$,
  'onb-interiors-2026-08-05-v1', '2026-08-05 00:00:00+05:30', true
),
(
  'transport', '2026-08-05-v1',
  'Varada Nexus — Transport Client Onboarding Terms & Conditions',
  $onb$
<h2>Transport &amp; Logistics — Client Engagement Terms &amp; Conditions</h2>
<p>These Terms and Conditions (&ldquo;Terms&rdquo;) govern the engagement between Varada Nexus Private Limited (&ldquo;Company&rdquo;) and the client completing this onboarding (&ldquo;Client&rdquo;) for transportation and logistics services (the &ldquo;Services&rdquo;). By accepting these Terms you confirm you are authorised to bind the Client and that the information and documents provided are true, complete and current.</p>
<h3>1. Definitions</h3>
<p>&ldquo;Consignment&rdquo; means goods tendered for carriage. &ldquo;Trip&rdquo; means a movement of a Consignment between agreed points. &ldquo;Freight&rdquo; means the charges for the Services.</p>
<h3>2. Scope of Services</h3>
<p>The Company arranges and/or provides carriage of goods as described in each agreed rate contract, work order or booking (&ldquo;Order&rdquo;). These Terms apply to every Order and prevail in case of conflict unless a signed Order states otherwise.</p>
<h3>3. Client Obligations</h3>
<p>The Client shall: (a) accurately declare the nature, weight and value of goods; (b) ensure proper packing, lawful documentation (including e-way bills and invoices) and permits; (c) not tender prohibited or hazardous goods without prior written disclosure and consent; and (d) ensure the accuracy of information and documents furnished during onboarding.</p>
<h3>4. Freight, Invoicing and Payment</h3>
<p>Freight and charges are as set out in the applicable Order. Detention, loading/unloading, and statutory charges are payable as incurred. Unless stated otherwise, invoices are payable within fifteen (15) days. Overdue amounts may attract interest at 1.5% per month or the maximum permitted by law. The Company may exercise a lien over goods for unpaid dues.</p>
<h3>5. Taxes</h3>
<p>Fees are exclusive of GST and other applicable taxes, which the Client shall bear. GST on transportation shall be handled in accordance with applicable law.</p>
<h3>6. Delivery, Risk and Claims</h3>
<p>Estimated transit times are indicative and not guaranteed. Risk in the goods remains with the Client save to the extent of the Company&rsquo;s liability below. Any claim for loss, shortage or damage must be notified in writing within seven (7) days of delivery or scheduled delivery, failing which claims are waived.</p>
<h3>7. Confidentiality</h3>
<p>Each party shall keep the other&rsquo;s Confidential Information secret and use it only for the engagement. This clause survives termination.</p>
<h3>8. Insurance</h3>
<p>Unless expressly agreed in writing, the Company does not insure the goods. The Client is responsible for arranging transit insurance for the full value of the Consignment.</p>
<h3>9. Data Protection</h3>
<p>Personal data and documents provided during onboarding are processed solely to deliver the Services, verify identity, and meet legal obligations, in accordance with applicable Indian data-protection law, and stored securely.</p>
<h3>10. Warranties and Representations</h3>
<p>The Client warrants it is entitled to tender the goods and that all declarations are accurate. Save as expressly stated, other warranties are excluded to the extent permitted by law.</p>
<h3>11. Indemnity</h3>
<p>The Client shall indemnify the Company against claims, penalties and losses arising from misdeclaration, unlawful or hazardous goods, defective packing, or breach of these Terms.</p>
<h3>12. Limitation of Liability</h3>
<p>Neither party is liable for indirect or consequential loss. Save for wilful misconduct, the Company&rsquo;s liability for loss of or damage to goods is limited to the amount of Freight for the relevant Trip or the declared and agreed value, whichever is lower, except where liability cannot be limited by law.</p>
<h3>13. Term and Termination</h3>
<p>The engagement continues until terminated. Either party may terminate for material breach not cured within thirty (30) days of notice. Accrued Freight and charges remain payable.</p>
<h3>14. Force Majeure</h3>
<p>Neither party is liable for delay or failure caused by events beyond its reasonable control, including road closures, strikes and natural events.</p>
<h3>15. Governing Law and Dispute Resolution</h3>
<p>These Terms are governed by the laws of India. Disputes shall be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at the Company&rsquo;s registered office, with courts there having exclusive jurisdiction subject to arbitration.</p>
<h3>16. General</h3>
<p>These Terms with the applicable Order form the entire agreement. Severability and non-waiver apply.</p>
  $onb$,
  'onb-transport-2026-08-05-v1', '2026-08-05 00:00:00+05:30', true
),
(
  'digital-services', '2026-08-05-v1',
  'Varada Nexus — Digital Marketing & Services Client Onboarding Terms & Conditions',
  $onb$
<h2>Digital Marketing &amp; Services — Client Engagement Terms &amp; Conditions</h2>
<p>These Terms and Conditions (&ldquo;Terms&rdquo;) govern the engagement between Varada Nexus Private Limited (&ldquo;Company&rdquo;) and the client completing this onboarding (&ldquo;Client&rdquo;) for digital marketing, creative, and related services (the &ldquo;Services&rdquo;). By accepting these Terms you confirm you are authorised to bind the Client and that the information and documents provided are true, complete and current.</p>
<h3>1. Definitions</h3>
<p>&ldquo;Deliverables&rdquo; means the campaigns, content, creatives, reports and services agreed with the Client. &ldquo;Client Materials&rdquo; means brand assets, credentials and content the Client provides.</p>
<h3>2. Scope of Services</h3>
<p>The Company provides the Services described in each agreed proposal, retainer or work order (&ldquo;Order&rdquo;). These Terms apply to every Order and prevail in case of conflict unless a signed Order states otherwise. The Company may engage vendors and platforms to deliver the Services.</p>
<h3>3. Client Obligations</h3>
<p>The Client shall provide timely approvals, accurate brand information, lawful Client Materials, and any necessary account access; ensure it holds rights to all Client Materials; and ensure the accuracy of information and documents furnished during onboarding.</p>
<h3>4. Fees, Invoicing and Payment</h3>
<p>Fees, retainers and media/ad-spend are as set out in the applicable Order. Ad spend and third-party costs are billed at cost or as agreed and are payable in advance where stated. Unless stated otherwise, invoices are payable within seven (7) days. Overdue amounts may attract interest at 1.5% per month or the maximum permitted by law, and Services may be paused.</p>
<h3>5. Taxes</h3>
<p>Fees are exclusive of GST and other applicable taxes, which the Client shall bear.</p>
<h3>6. Performance and No-Guarantee</h3>
<p>The Company will apply reasonable skill and care. The Client acknowledges that outcomes of marketing (reach, rankings, leads, conversions) depend on many factors outside the Company&rsquo;s control, and no specific results are guaranteed unless expressly stated in an Order.</p>
<h3>7. Confidentiality</h3>
<p>Each party shall keep the other&rsquo;s Confidential Information secret and use it only for the engagement. This clause survives termination.</p>
<h3>8. Intellectual Property and Licence</h3>
<p>Client Materials remain the Client&rsquo;s property. Deliverables created for the Client transfer on full payment, save for the Company&rsquo;s tools, methods and pre-existing materials, which remain the Company&rsquo;s property. The Client grants the Company a licence to use Client Materials to deliver the Services and, unless the Client objects in writing, to reference the engagement as a portfolio credential.</p>
<h3>9. Third-Party Platforms and Compliance</h3>
<p>The Client is responsible for compliance with the terms and advertising policies of third-party platforms. The Company is not liable for platform actions such as account suspensions or policy changes.</p>
<h3>10. Data Protection</h3>
<p>Personal data, credentials and documents provided during onboarding are processed solely to deliver the Services, verify identity, and meet legal obligations, in accordance with applicable Indian data-protection law, and stored securely. Access credentials are handled on a need-to-know basis.</p>
<h3>11. Warranties</h3>
<p>Each party warrants it has authority to enter into these Terms. Save as expressly stated, other warranties are excluded to the extent permitted by law.</p>
<h3>12. Indemnity</h3>
<p>The Client shall indemnify the Company against claims arising from Client Materials, the Client&rsquo;s instructions, or the Client&rsquo;s breach of these Terms, including intellectual-property and advertising-law claims.</p>
<h3>13. Limitation of Liability</h3>
<p>Neither party is liable for indirect or consequential loss. The Company&rsquo;s aggregate liability under an Order shall not exceed the fees (excluding pass-through ad spend) paid for that Order in the preceding three (3) months, except for liability that cannot be limited by law.</p>
<h3>14. Term and Termination</h3>
<p>Retainers continue for the agreed term and renew as stated. Either party may terminate for material breach not cured within thirty (30) days of notice. On termination, accrued fees and committed costs remain payable and access/credentials are returned.</p>
<h3>15. Force Majeure</h3>
<p>Neither party is liable for delay or failure caused by events beyond its reasonable control.</p>
<h3>16. Governing Law and Dispute Resolution</h3>
<p>These Terms are governed by the laws of India. Disputes shall be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated at the Company&rsquo;s registered office, with courts there having exclusive jurisdiction subject to arbitration.</p>
<h3>17. General</h3>
<p>These Terms with the applicable Order form the entire agreement. Severability and non-waiver apply.</p>
  $onb$,
  'onb-digital-services-2026-08-05-v1', '2026-08-05 00:00:00+05:30', true
)
on conflict (division_code, version) do update
set title = excluded.title,
    body = excluded.body,
    content_hash = excluded.content_hash,
    effective_at = excluded.effective_at,
    is_active = true;

commit;

notify pgrst, 'reload schema';
