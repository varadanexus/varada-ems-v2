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
function itemAmounts(item) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discount = Number(item.discount) || 0;
  const gstRate = Number(item.gstRate) || 0;
  const unitsTotal = quantity * unitPrice;
  const enteredTotal = unitsTotal - discount;
  const taxable = Number.isFinite(Number(item.taxableAmount))
    ? Number(item.taxableAmount)
    : item.gstIncluded && gstRate > 0 ? enteredTotal * 100 / (100 + gstRate) : enteredTotal;
  const gst = item.gstIncluded ? enteredTotal - taxable : taxable * gstRate / 100;
  return { unitsTotal, gst, totalIncGst: taxable + gst };
}

function chargeAmounts(charge) {
  const amount = Number(charge.amount) || 0;
  const gstRate = Number(charge.gstRate) || 0;
  const gst = amount * gstRate / 100;
  return { amount, gst, totalIncGst: amount + gst };
}

async function buildProcurementPdf(snapshot, type) {
  const isPurchaseOrder = type === "purchase_order";
  const doc = await createPdfDocument();
  const documentNumber = isPurchaseOrder ? snapshot.poNumber : snapshot.approvalNumber;
  const title = isPurchaseOrder ? "PURCHASE ORDER" : "PROCUREMENT PROPOSAL";
  const party = isPurchaseOrder ? snapshot.vendor || {} : snapshot.client || {};
  const packageInfo = snapshot.package || {};
  const project = snapshot.project || {};
  const totals = snapshot.totals || {};
  const hasDiscount = (snapshot.items || []).some((item) => Number(item.discount) > 0);

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
    head: ["#", "Item / specification", "HSN/SAC", "Qty", "Unit price", "Total price", ...(hasDiscount ? ["Discount"] : []), "GST", "Total inc. GST"],
    body: (snapshot.items || []).map((item, index) => {
      const amount = itemAmounts(item);
      return [
        index + 1,
        [item.name, item.makeModel, item.specification].filter(Boolean).join("\n"),
        value(item.hsnSac),
        `${formatPdfQuantity(item.quantity)} ${value(item.unit)}`,
        formatPdfCurrency(item.unitPrice),
        formatPdfCurrency(amount.unitsTotal),
        ...(hasDiscount ? [formatPdfCurrency(item.discount)] : []),
        `${formatPdfCurrency(amount.gst)} (${Number(item.gstRate || 0)}%)`,
        formatPdfCurrency(amount.totalIncGst)
      ];
    }),
    options: { fontSize: 6.4, columnStyles: { 0: { cellWidth: 6 }, 1: { cellWidth: 38 }, 2: { cellWidth: 15 }, 3: { cellWidth: 15 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } } }
  });

  if ((snapshot.charges || []).length) {
    y = addTable(doc, {
      startY: y + 3,
      head: ["Package charge", "Description", "HSN/SAC", "Amount", "GST", "Total inc. GST"],
      body: snapshot.charges.map((charge) => {
        const amount = chargeAmounts(charge);
        return [charge.type, charge.description, value(charge.hsnSac), formatPdfCurrency(amount.amount), `${formatPdfCurrency(amount.gst)} (${Number(charge.gstRate || 0)}%)`, formatPdfCurrency(amount.totalIncGst)];
      }),
      options: { columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } }
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
    : "System-generated procurement proposal.");
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
