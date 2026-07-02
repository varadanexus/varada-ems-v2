import {
  addBankDetailsSection,
  addDeclarationSection,
  addDetailsSection,
  addDocumentFooter,
  addDocumentHeader,
  addOldEmsBankDetailsBlock,
  addOldEmsCompanyHeader,
  addOldEmsDeclarationBlock,
  addOldEmsSignatureStampBlock,
  addOldEmsTaxSummaryBlock,
  addSignatureSection,
  addSummarySection,
  addTable,
  createPdfDocument,
  formatPdfCurrency,
  formatPdfDate,
  savePdf
} from "./pdf-utils.js";

function sanitizeDocumentNo(value, fallback = "DOCUMENT") {
  return String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || fallback;
}

export function formatPortalPdfFilename(documentType, documentNo) {
  const type = sanitizeDocumentNo(documentType, "DOCUMENT");
  const no = sanitizeDocumentNo(documentNo, "DOCUMENT");
  return `VARADA_${type}_${no}.pdf`;
}

export async function exportPortalTransporterStatementPdf({ statement, transporterName }) {
  const doc = await createPdfDocument();
  const penaltyAmount = Number(statement?.penalty_amount || 0);
  let y = await addOldEmsCompanyHeader(doc, {
    title: "Transporter Statement",
    verifiedText: "Digitally Verified"
  });

  y = addDetailsSection(doc, "TRANSPORTER / DOCUMENT DETAILS", [
    { label: "Transporter", value: transporterName || statement?.transporter_name || "N/A" },
    { label: "Statement No", value: statement?.statement_no || "—" },
    { label: "Status", value: String(statement?.status || "—").toUpperCase() },
    { label: "Statement Date", value: formatPdfDate(statement?.statement_date) },
    { label: "Portal", value: "Transporter Portal" },
    { label: "Document Type", value: "Payable Statement" }
  ], y + 3);

  y = addTable(doc, {
    startY: y + 5,
    head: ["Statement No", "Date", "Gross Payable", "Deductions", "Penalties", "Net Payable"],
    body: [[
      statement?.statement_no || "—",
      formatPdfDate(statement?.statement_date),
      formatPdfCurrency(statement?.gross_payable_total || 0),
      formatPdfCurrency(statement?.support_deduction_total || 0),
      formatPdfCurrency(penaltyAmount),
      formatPdfCurrency(statement?.net_payable_total || 0)
    ]],
    options: { headFillColor: [0, 102, 204] }
  });

  const summaryStartY = y + 5;
  const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
    startY: summaryStartY,
    marginLeft: 110,
    tableWidth: 85,
    title: "Statement Summary",
    rows: [
      { label: "Gross Payable", value: formatPdfCurrency(statement?.gross_payable_total || 0) },
      { label: "Deductions", value: formatPdfCurrency(statement?.support_deduction_total || 0) },
      { label: "Penalties", value: formatPdfCurrency(penaltyAmount) },
      ...(statement?.penalty_reason ? [{ label: "Penalty Reason", value: statement.penalty_reason }] : []),
      [{ content: "Net Payable", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(statement?.net_payable_total || 0), styles: { fontStyle: "bold" } }]
    ]
  });
  const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
  y = Math.max(summaryEndY, bankEndY) + 8;

  addOldEmsDeclarationBlock(doc, {
    startY: y,
    text: "This is a system-generated transporter payable statement issued from the Varada Nexus Transporter Portal.",
    width: 90
  });
  await addOldEmsSignatureStampBlock(doc, { startY: 248 });
  savePdf(doc, formatPortalPdfFilename("STATEMENT", statement?.statement_no));
}

export async function exportPortalClientBillPdf({ bill, clientName }) {
  const doc = await createPdfDocument();
  const isGst = String(bill?.billing_type || "").toUpperCase() === "GST";
  const supportDeductions = Number(bill?.support_deduction_total || 0);
  const hasPenaltyAmount = bill?.penalty_amount != null && bill?.penalty_amount !== "";
  const penaltyAmount = hasPenaltyAmount ? Number(bill?.penalty_amount || 0) : null;
  let y = await addOldEmsCompanyHeader(doc, {
    title: isGst ? "GST Invoice" : "Client Bill",
    verifiedText: "Digitally Verified"
  });

  y = addDetailsSection(doc, "CLIENT / DOCUMENT DETAILS", [
    { label: "Client", value: clientName || bill?.client_name || "N/A" },
    { label: "Bill No", value: bill?.bill_no || "—" },
    { label: "Billing Type", value: bill?.billing_type || "—" },
    { label: "Bill Date", value: formatPdfDate(bill?.bill_date) },
    { label: "Status", value: String(bill?.status || "—").toUpperCase() },
    { label: "Portal", value: "Client Portal" }
  ], y + 3);

  y = addTable(doc, {
    startY: y + 5,
    head: [
      "Bill No",
      "Date",
      "Type",
      "Gross Total",
      "Deductions",
      ...(hasPenaltyAmount ? ["Penalties"] : []),
      "Net Receivable"
    ],
    body: [[
      bill?.bill_no || "—",
      formatPdfDate(bill?.bill_date),
      bill?.billing_type || "—",
      formatPdfCurrency(bill?.gross_total || 0),
      formatPdfCurrency(supportDeductions),
      ...(hasPenaltyAmount ? [formatPdfCurrency(penaltyAmount || 0)] : []),
      formatPdfCurrency(bill?.net_receivable || 0)
    ]],
    options: { headFillColor: [0, 102, 204] }
  });

  const summaryRows = [
    { label: "Gross Total", value: formatPdfCurrency(bill?.gross_total || 0) },
    { label: "Deductions", value: formatPdfCurrency(supportDeductions) },
    { label: "Net Receivable", value: formatPdfCurrency(bill?.net_receivable || 0) }
  ];
  if (hasPenaltyAmount) {
    summaryRows.splice(2, 0, { label: "Penalties", value: formatPdfCurrency(penaltyAmount || 0) });
  }
  if (isGst) {
    summaryRows.splice(1, 0,
      { label: "Taxable Value", value: formatPdfCurrency(bill?.taxable_value || 0) },
      { label: `GST (${bill?.gst_percentage ?? 0}%)`, value: formatPdfCurrency(bill?.gst_amount || 0) }
    );
    summaryRows.push([{ content: "Invoice Total", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(bill?.invoice_total || 0), styles: { fontStyle: "bold" } }]);
  }

  const summaryStartY = y + 5;
  const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
    startY: summaryStartY,
    marginLeft: 110,
    tableWidth: 85,
    title: isGst ? "Invoice Summary" : "Bill Summary",
    rows: summaryRows
  });
  const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
  y = Math.max(summaryEndY, bankEndY) + 8;

  addOldEmsDeclarationBlock(doc, {
    startY: y,
    text: "This is a system-generated client billing document issued from the Varada Nexus Client Portal.",
    width: 90
  });
  await addOldEmsSignatureStampBlock(doc, { startY: 248 });
  savePdf(doc, formatPortalPdfFilename(isGst ? "INVOICE" : "CLIENT_BILL", bill?.bill_no));
}

export async function exportPortalClientGstInvoicePdf({ invoice, clientName }) {
  const doc = await createPdfDocument();
  let y = await addDocumentHeader(doc, {
    title: "GST Invoice",
    fields: [
      { label: "Invoice No", value: invoice?.invoice_no || "—" },
      { label: "Invoice Date", value: formatPdfDate(invoice?.invoice_date) },
      { label: "Portal", value: "Client Portal" },
      { label: "Status", value: invoice?.status || "—" }
    ]
  });

  y = addDetailsSection(doc, "CLIENT DETAILS", [
    { label: "Client", value: clientName || invoice?.client_name || "N/A" },
    { label: "Invoice No", value: invoice?.invoice_no || "—" },
    { label: "Document", value: "GST Invoice" },
    { label: "Date", value: formatPdfDate(invoice?.invoice_date) }
  ], y + 2);

  y = addSummarySection(doc, "TAX SUMMARY", [
    { label: "Taxable Value", value: formatPdfCurrency(invoice?.taxable_value || 0) },
    { label: "GST %", value: `${invoice?.gst_percentage ?? 0}%` },
    { label: "GST Amount", value: formatPdfCurrency(invoice?.gst_amount || 0) },
    { label: "Invoice Total", value: formatPdfCurrency(invoice?.invoice_total || 0) }
  ], y + 2);

  y = addBankDetailsSection(doc, y + 2);
  y = addDeclarationSection(doc, "PURE AGENT DECLARATION", [
    "This GST invoice is generated from the Varada Nexus Client Portal.",
    "Amounts and tax values follow the approved EMS billing records.",
    "No manual recalculation is performed in the portal export layer."
  ], y + 2);
  await addSignatureSection(doc, y + 2);
  await addDocumentFooter(doc);
  savePdf(doc, formatPortalPdfFilename("GST_INVOICE", invoice?.invoice_no));
}