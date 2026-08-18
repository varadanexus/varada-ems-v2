import {
  addClientInvoiceSignatureBlock,
  addDetailsSection,
  addDocumentFooter,
  addDocumentHeader,
  addSummarySection,
  createPdfDocument,
  formatPdfCurrency,
  formatPdfDate,
  formatPdfFilename,
  formatPdfQuantity
} from "./pdf-utils.js";

export const DEFAULT_QUOTATION_TERMS = [
  "1. Prices quoted are in INR. GST is shown separately against each item unless marked as GST-included.",
  "2. This quotation is valid until the date mentioned above; prices may change after expiry.",
  "3. Delivery / completion timelines will be confirmed on receipt of a formal purchase order and advance payment, if applicable.",
  "4. Payment terms are as mutually agreed in the resulting purchase order / work order.",
  "5. Any statutory levies, duties or taxes introduced after the date of this quotation will be charged extra at actuals.",
  "6. This quotation does not constitute a tax invoice."
].join("\n");

const CONTENT_LEFT = 14;
const CONTENT_WIDTH = 182;

const value = (input) => (input === null || input === undefined || input === "" ? "—" : input);

function quotationLineAmounts(line) {
  const quantity = Number(line.quantity) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  const discount = Number(line.discount_amount) || 0;
  const gstRate = Number(line.gst_rate) || 0;
  const entered = Math.max(0, (quantity * unitPrice) - discount);
  const included = line.gst_included === true || line.gst_included === "true";
  const taxable = Number.isFinite(Number(line.taxable_amount)) && Number(line.taxable_amount) > 0
    ? Number(line.taxable_amount)
    : (included && gstRate > 0 ? (entered * 100) / (100 + gstRate) : entered);
  const tax = included ? entered - taxable : (taxable * gstRate) / 100;
  return { entered, taxable, tax, total: taxable + tax };
}

// Item name and description are kept as separate columns (not merged into one
// cell) so they render with distinct styles - bold item name, smaller grey
// description - and so column widths stay explicit and predictable.
function quotationColumnStyles(hasDiscount) {
  const widths = hasDiscount
    ? [7, 22, 32, 16, 14, 20, 18, 22, 31]
    : [7, 26, 40, 18, 16, 24, 24, 27];
  const styles = {};
  widths.forEach((cellWidth, index) => {
    styles[index] = { cellWidth, valign: "top" };
  });
  const itemCol = 1, descCol = 2;
  styles[itemCol] = { ...styles[itemCol], fontStyle: "bold", valign: "top" };
  styles[descCol] = { ...styles[descCol], textColor: [100, 105, 115], fontSize: 6.4, valign: "top" };
  const rightAlignFrom = hasDiscount ? 4 : 4;
  for (let i = rightAlignFrom; i < widths.length; i += 1) {
    styles[i] = { ...styles[i], halign: "right" };
  }
  return styles;
}

async function addQuotationSignatureBlock(doc, startY, includeSignature) {
  if (includeSignature) {
    return addClientInvoiceSignatureBlock(doc, startY);
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 105, 115);
  doc.text("This is a system-generated quotation and does not require a physical signature or company stamp.", CONTENT_LEFT, startY + 6, { maxWidth: pageWidth - (CONTENT_LEFT * 2) });
  doc.setTextColor(17, 24, 39);
  return startY + 14;
}

export async function buildHospitalQuotationPdf(quotation, project, client, lines = []) {
  const doc = await createPdfDocument();
  const hasDiscount = (lines || []).some((line) => Number(line.discount_amount) > 0);
  const includeSignature = quotation.include_signature !== false;

  let y = await addDocumentHeader(doc, {
    title: "QUOTATION",
    fields: [
      { label: "Quotation No.", value: quotation.quotation_number },
      { label: "Date", value: formatPdfDate(quotation.quotation_date) },
      { label: "Valid until", value: formatPdfDate(quotation.valid_until) },
      { label: "Status", value: String(quotation.status || "draft").toUpperCase() }
    ]
  });

  y = addDetailsSection(doc, "QUOTED TO & PROJECT", [
    { label: "Client", value: client?.hospital_name },
    { label: "Client code", value: client?.client_code },
    { label: "Project", value: `${value(project?.project_code)} · ${value(project?.title)}` },
    { label: "Location", value: project?.location },
    { label: "GSTIN", value: client?.gstin || "N/A" },
    { label: "Place of supply", value: quotation.place_of_supply || project?.location || "—" },
    { label: "Subject", value: quotation.subject },
    { label: "Prepared for", value: client?.contact_name || client?.authorized_representative_name }
  ], y + 2);

  const head = ["#", "Item", "Description", "HSN/SAC", "Qty", "Unit price", ...(hasDiscount ? ["Discount"] : []), "GST", "Total inc. GST"];
  const body = (lines || []).map((line, index) => {
    const amount = quotationLineAmounts(line);
    return [
      index + 1,
      line.item_name || "",
      line.description || "",
      value(line.hsn_sac),
      `${formatPdfQuantity(line.quantity)} ${value(line.unit)}`,
      formatPdfCurrency(line.unit_price),
      ...(hasDiscount ? [formatPdfCurrency(line.discount_amount)] : []),
      `${formatPdfCurrency(amount.tax)} (${Number(line.gst_rate || 0)}%)`,
      formatPdfCurrency(amount.total)
    ];
  });

  doc.autoTable({
    startY: y + 3,
    margin: { left: CONTENT_LEFT, right: CONTENT_LEFT },
    tableWidth: CONTENT_WIDTH,
    head: [head],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 6.9, cellPadding: 1.4, textColor: [17, 24, 39], lineColor: [165, 165, 165], lineWidth: 0.18, overflow: "linebreak" },
    headStyles: { fillColor: [17, 55, 130], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    columnStyles: quotationColumnStyles(hasDiscount)
  });
  y = doc.lastAutoTable?.finalY || (y + 3);

  const taxable = (lines || []).reduce((sum, line) => sum + quotationLineAmounts(line).taxable, 0);
  const tax = (lines || []).reduce((sum, line) => sum + quotationLineAmounts(line).tax, 0);
  const roundOff = Number(quotation.round_off || 0);
  const grandTotal = taxable + tax + roundOff;

  y = addSummarySection(doc, "QUOTATION SUMMARY", [
    { label: "Taxable value", value: formatPdfCurrency(taxable) },
    { label: "GST", value: formatPdfCurrency(tax) },
    ...(roundOff ? [{ label: "Round off", value: formatPdfCurrency(roundOff) }] : []),
    { label: "GRAND TOTAL", value: formatPdfCurrency(grandTotal) }
  ], y + 4);

  const termsText = quotation.terms_conditions || DEFAULT_QUOTATION_TERMS;
  if (termsText) {
    // Set the real render font/size BEFORE measuring, otherwise splitTextToSize
    // wraps for the wrong font metrics and the table ends up far narrower than
    // its declared width.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.9);
    const wrapped = doc.splitTextToSize(termsText, CONTENT_WIDTH - 4.4);
    const pageHeight = doc.internal.pageSize.getHeight();
    const termsHeight = 13 + (wrapped.length * 3.2);
    if (y + termsHeight + 48 > pageHeight - 14) {
      doc.addPage();
      y = 20;
    }
    doc.autoTable({
      startY: y + 4,
      margin: { left: CONTENT_LEFT, right: CONTENT_LEFT },
      tableWidth: CONTENT_WIDTH,
      head: [["TERMS & CONDITIONS"]],
      body: [[termsText]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 6.9, cellPadding: 2.2, textColor: [75, 85, 99], lineColor: [165, 165, 165], lineWidth: 0.2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold", fontSize: 7.2, halign: "left" },
      columnStyles: { 0: { cellWidth: CONTENT_WIDTH } }
    });
    y = doc.lastAutoTable?.finalY || (y + termsHeight);
  }

  if (quotation.notes) {
    doc.autoTable({
      startY: y + 3,
      margin: { left: CONTENT_LEFT, right: CONTENT_LEFT },
      tableWidth: CONTENT_WIDTH,
      head: [["NOTES"]],
      body: [[quotation.notes]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7, cellPadding: 2, textColor: [75, 85, 99], lineColor: [165, 165, 165], lineWidth: 0.2, overflow: "linebreak" },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold", fontSize: 7.2, halign: "left" },
      columnStyles: { 0: { cellWidth: CONTENT_WIDTH } }
    });
    y = doc.lastAutoTable?.finalY || y;
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - (includeSignature ? 58 : 40)) {
    doc.addPage();
    y = 20;
  }
  await addQuotationSignatureBlock(doc, y + 8, includeSignature);

  await addDocumentFooter(doc, includeSignature
    ? "System-generated Hospital Projects quotation. This is not a tax invoice."
    : "System-generated Hospital Projects quotation. This is not a tax invoice and does not require a signature or stamp.");
  return doc;
}

export async function downloadHospitalQuotationPdf(quotation, project, client, lines = []) {
  const doc = await buildHospitalQuotationPdf(quotation, project, client, lines);
  doc.save(formatPdfFilename("HSP-QUOTATION", quotation.quotation_number));
}
