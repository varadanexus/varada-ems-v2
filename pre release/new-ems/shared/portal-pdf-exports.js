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

export async function exportPortalTransporterTripPdf({ trip, transporterName }) {
  const doc = await createPdfDocument();
  const tripNo = trip?.trip_no || "—";
  const routeText = String(trip?.route_name || "-").trim() || "-";
  const truckText = [trip?.truck_no, trip?.vehicle_no, trip?.registration_no].find((value) => String(value || "").trim()) || "Unknown Truck";
  let y = await addOldEmsCompanyHeader(doc, {
    title: "Transporter Trip",
    verifiedText: "Digitally Verified"
  });

  y = addDetailsSection(doc, "TRANSPORTER / TRIP DETAILS", [
    { label: "Transporter", value: transporterName || trip?.transporter_name || "N/A" },
    { label: "Trip No", value: tripNo },
    { label: "Date", value: formatPdfDate(trip?.trip_date) },
    { label: "Status", value: String(trip?.status || "—").toUpperCase() },
    { label: "Portal", value: "Transporter Portal" },
    { label: "Document Type", value: "Trip Details" }
  ], y + 3);

  y = addTable(doc, {
    startY: y + 5,
    head: ["Trip No", "Date", "Truck", "Qty MT", "Rate/MT", "Gross Amount", "Status"],
    body: [[
      tripNo,
      formatPdfDate(trip?.trip_date),
      truckText,
      Number(trip?.quantity_mt || 0).toFixed(2),
      formatPdfCurrency(trip?.transporter_rate_per_mt || 0),
      formatPdfCurrency(trip?.transporter_gross_amount || 0),
      String(trip?.status || "—").toUpperCase()
    ]],
    options: {
      headFillColor: [0, 102, 204],
      styles: { fontSize: 8.25, cellPadding: 1.7 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 20 },
        2: { cellWidth: 35 },
        3: { cellWidth: 18, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 28, halign: "right" },
        6: { cellWidth: 24 }
      }
    }
  });

  const summaryStartY = y + 5;
  const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
    startY: summaryStartY,
    marginLeft: 110,
    tableWidth: 85,
    title: "Trip Summary",
    rows: [
      { label: "Route", value: routeText },
      { label: "Driver", value: trip?.driver_name || "-" },
      { label: "Commodity", value: trip?.commodity_name || "-" },
      { label: "Quantity", value: `${Number(trip?.quantity_mt || 0).toFixed(2)} MT` },
      { label: "Gross Amount", value: formatPdfCurrency(trip?.transporter_gross_amount || 0) }
    ]
  });
  const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
  y = Math.max(summaryEndY, bankEndY) + 8;

  addOldEmsDeclarationBlock(doc, {
    startY: y,
    text: "This is a system-generated trip details document issued from the Varada Nexus Transporter Portal.",
    width: 90
  });
  await addOldEmsSignatureStampBlock(doc, { startY: 248 });
  savePdf(doc, formatPortalPdfFilename("TRIP", trip?.trip_no));
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
export async function exportPortalClientTripPdf({ trip, clientName }) {
  const doc = await createPdfDocument();
  const tripNo = trip?.trip_no || "—";
  const routeText = String(trip?.route_name || "-").trim() || "-";
  const truckText = [trip?.truck_no, trip?.vehicle_no, trip?.registration_no].find((value) => String(value || "").trim()) || "Unknown Truck";
  let y = await addOldEmsCompanyHeader(doc, {
    title: "Client Trip",
    verifiedText: "Digitally Verified"
  });

  y = addDetailsSection(doc, "CLIENT / TRIP DETAILS", [
    { label: "Client", value: clientName || trip?.client_name || "N/A" },
    { label: "Trip No", value: tripNo },
    { label: "Date", value: formatPdfDate(trip?.trip_date) },
    { label: "Status", value: String(trip?.status || "—").toUpperCase() },
    { label: "Portal", value: "Client Portal" },
    { label: "Document Type", value: "Trip Details" }
  ], y + 3);

  y = addTable(doc, {
    startY: y + 5,
    head: ["Trip No", "Date", "Truck", "Qty MT", "Rate/MT", "Gross Amount", "Status"],
    body: [[
      tripNo,
      formatPdfDate(trip?.trip_date),
      truckText,
      Number(trip?.quantity_mt || 0).toFixed(2),
      formatPdfCurrency(trip?.client_rate_per_mt || 0),
      formatPdfCurrency(trip?.client_gross_amount || 0),
      String(trip?.status || "—").toUpperCase()
    ]],
    options: {
      headFillColor: [0, 102, 204],
      styles: { fontSize: 8.25, cellPadding: 1.7 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 20 },
        2: { cellWidth: 35 },
        3: { cellWidth: 18, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 28, halign: "right" },
        6: { cellWidth: 24 }
      }
    }
  });

  const summaryStartY = y + 5;
  const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
    startY: summaryStartY,
    marginLeft: 110,
    tableWidth: 85,
    title: "Trip Summary",
    rows: [
      { label: "Route", value: routeText },
      { label: "Driver", value: trip?.driver_name || "-" },
      { label: "Commodity", value: trip?.commodity_name || "-" },
      { label: "Quantity", value: `${Number(trip?.quantity_mt || 0).toFixed(2)} MT` },
      { label: "Gross Amount", value: formatPdfCurrency(trip?.client_gross_amount || 0) }
    ]
  });
  const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
  y = Math.max(summaryEndY, bankEndY) + 8;

  addOldEmsDeclarationBlock(doc, {
    startY: y,
    text: "This is a system-generated trip details document issued from the Varada Nexus Client Portal.",
    width: 90
  });
  await addOldEmsSignatureStampBlock(doc, { startY: 248 });
  savePdf(doc, formatPortalPdfFilename("TRIP", trip?.trip_no));
}

export async function exportPortalClientCreditNotePdf({ creditNote, clientName }) {
  const doc = await createPdfDocument();
  let y = await addOldEmsCompanyHeader(doc, {
    title: "Credit Note",
    verifiedText: "Digitally Verified"
  });

  y = addDetailsSection(doc, "CLIENT / DOCUMENT DETAILS", [
    { label: "Client", value: clientName || creditNote?.client_name || "N/A" },
    { label: "Credit Note No", value: creditNote?.credit_note_no || "—" },
    { label: "Against Bill", value: creditNote?.bill_no || creditNote?.transport_client_bills?.bill_no || "—" },
    { label: "Credit Note Date", value: formatPdfDate(creditNote?.credit_note_date) },
    { label: "Status", value: String(creditNote?.status || "—").toUpperCase() },
    { label: "Document Type", value: "Client Credit Note" }
  ], y + 3);

  y = addTable(doc, {
    startY: y + 5,
    head: ["Credit Note No", "Date", "Against Bill", "Reason", "Amount"],
    body: [[
      creditNote?.credit_note_no || "—",
      formatPdfDate(creditNote?.credit_note_date),
      creditNote?.bill_no || creditNote?.transport_client_bills?.bill_no || "—",
      creditNote?.reason || "—",
      formatPdfCurrency(creditNote?.credit_note_amount || 0)
    ]],
    options: { headFillColor: [0, 102, 204] }
  });

  const summaryStartY = y + 5;
  const summaryEndY = addOldEmsTaxSummaryBlock(doc, {
    startY: summaryStartY,
    marginLeft: 110,
    tableWidth: 85,
    title: "Credit Summary",
    rows: [
      { label: "Against Bill", value: creditNote?.bill_no || creditNote?.transport_client_bills?.bill_no || "—" },
      { label: "Reason", value: creditNote?.reason || "—" },
      [{ content: "Credit Amount", styles: { fontStyle: "bold" } }, { content: formatPdfCurrency(creditNote?.credit_note_amount || 0), styles: { fontStyle: "bold" } }]
    ]
  });
  const bankEndY = addOldEmsBankDetailsBlock(doc, { startY: summaryStartY, marginLeft: 15, tableWidth: 90 });
  y = Math.max(summaryEndY, bankEndY) + 8;

  addOldEmsDeclarationBlock(doc, {
    startY: y,
    text: "This is a system-generated credit note reducing the receivable against the referenced client bill.",
    width: 90
  });
  await addOldEmsSignatureStampBlock(doc, { startY: 248 });
  savePdf(doc, formatPortalPdfFilename("CREDIT_NOTE", creditNote?.credit_note_no));
}
