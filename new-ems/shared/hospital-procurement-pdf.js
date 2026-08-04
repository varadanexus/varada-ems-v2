import {
  addDetailsSection,
  addDocumentFooter,
  addDocumentHeader,
  addSummarySection,
  addTable,
  createPdfDocument,
  formatPdfCurrency,
  formatPdfDate,
  formatPdfFilename,
  formatPdfQuantity,
  savePdf
} from "./pdf-utils.js";

const value = (input) => input ?? "—";

async function buildProcurementPdf(snapshot, type) {
  const isPurchaseOrder = type === "purchase_order";
  const doc = await createPdfDocument();
  const documentNumber = isPurchaseOrder ? snapshot.poNumber : snapshot.approvalNumber;
  const title = isPurchaseOrder ? "PURCHASE ORDER" : "PROCUREMENT PROPOSAL";
  const party = isPurchaseOrder ? snapshot.vendor || {} : snapshot.client || {};
  const packageInfo = snapshot.package || {};
  const project = snapshot.project || {};
  const totals = snapshot.totals || {};

  let y = await addDocumentHeader(doc, {
    title,
    fields: [
      { label: isPurchaseOrder ? "PO No." : "Proposal No.", value: documentNumber },
      { label: isPurchaseOrder ? "PO Date" : "Revision", value: isPurchaseOrder ? formatPdfDate(snapshot.poDate) : `Rev ${snapshot.revisionNo || 1}` },
      { label: "Package", value: packageInfo.number },
      { label: "Valid Until", value: formatPdfDate(packageInfo.validUntil) }
    ]
  });

  y = addDetailsSection(doc, isPurchaseOrder ? "VENDOR & PROJECT" : "CLIENT & PROJECT", [
    { label: isPurchaseOrder ? "Vendor" : "Client", value: party.name },
    { label: "Code", value: party.code },
    { label: "Project", value: `${value(project.code)} · ${value(project.title)}` },
    { label: "Location", value: project.location },
    { label: "GSTIN", value: party.gstin },
    { label: "Place of supply", value: packageInfo.placeOfSupply },
    { label: "Expected delivery", value: formatPdfDate(packageInfo.expectedDelivery) },
    { label: "Approved proposal", value: snapshot.approvalNumber }
  ], y + 2);

  y = addTable(doc, {
    startY: y + 3,
    head: ["#", "Item / specification", "HSN/SAC", "Qty", "Unit price", "Discount", "GST", "Taxable"],
    body: (snapshot.items || []).map((item, index) => [
      index + 1,
      [item.name, item.makeModel, item.specification].filter(Boolean).join("\n"),
      value(item.hsnSac),
      `${formatPdfQuantity(item.quantity)} ${value(item.unit)}`,
      formatPdfCurrency(item.unitPrice),
      formatPdfCurrency(item.discount),
      `${Number(item.gstRate || 0)}%`,
      formatPdfCurrency(item.taxableAmount)
    ]),
    options: { fontSize: 6.9, columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 49 }, 2: { cellWidth: 19 }, 3: { cellWidth: 20 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } } }
  });

  if ((snapshot.charges || []).length) {
    y = addTable(doc, {
      startY: y + 3,
      head: ["Package charge", "Description", "HSN/SAC", "GST", "Amount"],
      body: snapshot.charges.map((charge) => [charge.type, charge.description, value(charge.hsnSac), `${Number(charge.gstRate || 0)}%`, formatPdfCurrency(charge.amount)]),
      options: { columnStyles: { 4: { halign: "right" } } }
    });
  }

  if ((snapshot.otherTaxes || []).length) {
    y = addTable(doc, {
      startY: y + 3,
      head: ["Other tax / deduction", "Effect", "Base", "Rate", "Amount"],
      body: snapshot.otherTaxes.map((tax) => [tax.name, tax.effect, formatPdfCurrency(tax.taxableBase), `${Number(tax.rate || 0)}%`, formatPdfCurrency(tax.amount)]),
      options: { columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } }
    });
  }

  y = addSummarySection(doc, "COMMERCIAL SUMMARY", [
    { label: "Items subtotal", value: formatPdfCurrency(totals.itemsSubtotal) },
    { label: "Package charges", value: formatPdfCurrency(totals.chargesSubtotal) },
    { label: "GST", value: formatPdfCurrency(totals.gst) },
    { label: "Other additions", value: formatPdfCurrency(totals.additions) },
    { label: "Deductions", value: formatPdfCurrency(totals.deductions) },
    { label: "Round off", value: formatPdfCurrency(totals.roundOff) },
    { label: "GRAND TOTAL", value: formatPdfCurrency(totals.grandTotal) }
  ], y + 4);

  if (snapshot.terms || packageInfo.notes) {
    const text = [snapshot.terms, packageInfo.notes].filter(Boolean).join("\n\n");
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 48) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Terms and notes", 14, y + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(doc.splitTextToSize(text, 182), 14, y + 12);
  }

  await addDocumentFooter(doc, isPurchaseOrder
    ? "System-generated purchase order linked to an approved client procurement revision."
    : "Client-facing proposal. Vendor cost and internal commercial information are excluded.");
  return doc;
}

export async function downloadHospitalProcurementProposal(snapshot) {
  const doc = await buildProcurementPdf(snapshot, "proposal");
  savePdf(doc, formatPdfFilename("HSP-PROCUREMENT", snapshot.approvalNumber || snapshot.package?.number));
}

export async function downloadHospitalPurchaseOrder(snapshot) {
  const doc = await buildProcurementPdf(snapshot, "purchase_order");
  savePdf(doc, formatPdfFilename("HSP-PO", snapshot.poNumber));
}
