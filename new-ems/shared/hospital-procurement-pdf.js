import {
  addDetailsSection,
  addDocumentFooter,
  addDocumentHeader,
  addSignatureSection,
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
  const taxable = Number.isFinite(Number(charge.taxableAmount))
    ? Number(charge.taxableAmount)
    : charge.gstIncluded && gstRate > 0 ? amount * 100 / (100 + gstRate) : amount;
  const gst = charge.gstIncluded ? amount - taxable : taxable * gstRate / 100;
  return { amount, gst, totalIncGst: taxable + gst };
}

function procurementItemColumnStyles(hasDiscount) {
  const widths = hasDiscount
    ? [6, 34, 13, 15, 20, 21, 18, 25, 30]
    : [6, 42, 14, 17, 22, 23, 28, 30];
  return Object.fromEntries(widths.map((cellWidth, index) => [
    index,
    {
      cellWidth,
      valign: "middle",
      ...(index >= 4 ? { halign: "right" } : {})
    }
  ]));
}

function addContinuationHeader(doc, title, documentNumber) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VARADA NEXUS PRIVATE LIMITED", 14, 16);
  doc.setFontSize(8);
  doc.text(`${title} - CONTINUED`, pageWidth - 14, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(String(documentNumber || ""), pageWidth - 14, 19, { align: "right" });
  doc.setDrawColor(165, 165, 165);
  doc.line(14, 22, pageWidth - 14, 22);
  return 28;
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
    options: {
      fontSize: 6.7,
      cellPadding: 1.35,
      columnStyles: procurementItemColumnStyles(hasDiscount)
    }
  });

  if ((snapshot.charges || []).length) {
    y = addTable(doc, {
      startY: y + 3,
      head: ["Package charge", "Description", "HSN/SAC", "Amount", "GST", "Total inc. GST"],
      body: snapshot.charges.map((charge) => {
        const amount = chargeAmounts(charge);
        return [charge.type, charge.description, value(charge.hsnSac), formatPdfCurrency(amount.amount), `${formatPdfCurrency(amount.gst)} (${Number(charge.gstRate || 0)}%)`, formatPdfCurrency(amount.totalIncGst)];
      }),
      options: {
        fontSize: 7.1,
        columnStyles: {
          0: { cellWidth: 34, valign: "middle" },
          1: { cellWidth: 38, valign: "middle" },
          2: { cellWidth: 18, valign: "middle" },
          3: { cellWidth: 28, halign: "right", valign: "middle" },
          4: { cellWidth: 32, halign: "right", valign: "middle" },
          5: { cellWidth: 32, halign: "right", valign: "middle" }
        }
      }
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

  const termsText = [snapshot.terms, isPurchaseOrder ? packageInfo.notes : null].filter(Boolean).join("\n\n");
  if (termsText) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const lines = doc.splitTextToSize(termsText, 174);
    const termsHeight = 13 + (lines.length * 3.2);
    if (y + termsHeight + 48 > pageHeight - 14) {
      doc.addPage();
      y = addContinuationHeader(doc, title, documentNumber);
    }
    doc.autoTable({
      startY: y + 4,
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      head: [["TERMS & CONDITIONS"]],
      body: [[lines.join("\n")]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 6.7, cellPadding: 2.2, textColor: [75, 85, 99], lineColor: [165, 165, 165], lineWidth: 0.2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold", fontSize: 7.2, halign: "left" }
    });
    y = doc.lastAutoTable?.finalY || (y + termsHeight);
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 58) {
    doc.addPage();
    y = addContinuationHeader(doc, title, documentNumber);
  }
  await addSignatureSection(doc, y + 8);

  await addDocumentFooter(doc, isPurchaseOrder
    ? "System-generated purchase order linked to an approved client procurement revision."
    : "System-generated procurement proposal.");
  return doc;
}

export async function downloadHospitalProcurementProposal(snapshot) {
  const doc = await buildProcurementPdf(snapshot, "proposal");
  const filename = formatPdfFilename("HSP-PROCUREMENT", snapshot.approvalNumber || snapshot.package?.number);
  savePdf(doc, filename, {
    hospitalProject: true,
    projectId: snapshot.project?.id,
    documentType: "Procurement Proposals",
    documentNo: snapshot.approvalNumber || snapshot.package?.number,
    date: snapshot.generatedAt,
    mimeType: "application/pdf"
  });
}

export async function downloadHospitalPurchaseOrder(snapshot) {
  const doc = await buildProcurementPdf(snapshot, "purchase_order");
  const filename = formatPdfFilename("HSP-PO", snapshot.poNumber);
  savePdf(doc, filename, {
    hospitalProject: true,
    projectId: snapshot.project?.id,
    documentType: "Purchase Orders",
    documentNo: snapshot.poNumber,
    date: snapshot.poDate,
    mimeType: "application/pdf"
  });
}
