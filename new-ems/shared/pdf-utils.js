let pdfLibPromise = null;
let pdfAssetPromise = null;

const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
const AUTOTABLE_URL = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js";
const PDF_ASSET_PATHS = {
  logo: "/new-ems/assets/pdf/vn-logo.png",
  stamp: "/new-ems/assets/pdf/vn-stamp.png",
  signature: "/new-ems/assets/pdf/vn-signature.png"
};
const COMPANY_NAME = "VARADA NEXUS PRIVATE LIMITED";
const COMPANY_GST = "GST: 37AAKCV7495B1ZV";
const COMPANY_ADDRESS_LINE_1 = "Address: 80-17-28, K B Nagar, A V A Road,";
const COMPANY_ADDRESS_LINE_2 = "Rajahmundry, Andhra Pradesh - 533101";
const COMPANY_CIN = "CIN: U43121AP2025PTC117741";
const COMPANY_PHONE = "Phone: N/A";
const COMPANY_EMAIL = "Email: accounts@varadanexus.com";
const COMPANY_WEBSITE = "Website: www.varadanexus.com";
const BANK_DETAILS = {
  bankName: "Axis Bank",
  accountNumber: "924020062188598",
  ifsc: "UTIB0000107",
  branch: "Rajahmundry, AP",
  upiId: "N/A"
};

export async function ensurePdfLib() {
  if (window.jspdf?.jsPDF && typeof window.jspdf.jsPDF === "function" && typeof window.jspdf.jsPDF.API?.autoTable === "function") {
    return window.jspdf.jsPDF;
  }
  if (!pdfLibPromise) {
    pdfLibPromise = (async () => {
      await loadScript(JSPDF_URL);
      await loadScript(AUTOTABLE_URL);
      if (!window.jspdf?.jsPDF) throw new Error("jsPDF failed to load");
      if (typeof window.jspdf.jsPDF.API?.autoTable !== "function") throw new Error("jsPDF autoTable failed to load");
      return window.jspdf.jsPDF;
    })().catch((error) => {
      pdfLibPromise = null;
      throw error;
    });
  }
  return await pdfLibPromise;
}

export async function createPdfDocument() {
  const JsPdf = await ensurePdfLib();
  return new JsPdf({ orientation: "portrait", unit: "mm", format: "a4" });
}

export async function addDocumentHeader(doc, { title, fields = [] } = {}) {
  const assets = await ensurePdfAssets();
  const pageWidth = doc.internal.pageSize.getWidth();
  if (assets.logo) {
    try {
      doc.addImage(assets.logo, "PNG", 14, 12, 20, 18);
    } catch {}
  }
  const headerTextX = assets.logo ? 38 : 14;
  drawWatermark(doc, pageWidth, doc.internal.pageSize.getHeight(), assets.logo);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(COMPANY_NAME, headerTextX, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(COMPANY_GST, headerTextX, 21);
  doc.text(COMPANY_ADDRESS_LINE_1, headerTextX, 25);
  doc.text(COMPANY_ADDRESS_LINE_2, headerTextX, 29);
  doc.text(COMPANY_CIN, headerTextX, 33);

  doc.setTextColor(0, 120, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("✔ Digitally Verified", pageWidth - 14, 16, { align: "right" });
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(String(title || "Document").toUpperCase(), pageWidth - 14, 30, { align: "right" });

  const infoStartY = 37;
  const infoLeft = 132;
  const infoWidth = pageWidth - infoLeft - 14;
  const infoRows = fields.map((field) => [field.label || "", String(field.value ?? "—")]);
  if (infoRows.length) {
    doc.autoTable({
      startY: infoStartY,
      margin: { left: infoLeft },
      tableWidth: infoWidth,
      body: infoRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, textColor: [17, 24, 39] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 22 },
        1: { cellWidth: infoWidth - 22 }
      }
    });
  }

  const dividerY = Math.max(doc.lastAutoTable?.finalY || 0, 58);
  doc.setDrawColor(180, 180, 180);
  doc.line(14, dividerY + 2, pageWidth - 14, dividerY + 2);
  return dividerY + 6;
}

export async function addClientInvoiceHeader(doc, { title, fields = [], verifiedText = "DIGITALLY VERIFIED" } = {}) {
  const assets = await ensurePdfAssets();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const outerMargin = 10;
  const contentLeft = 13;
  const contentRight = pageWidth - 13;

  drawWatermark(doc, pageWidth, pageHeight, assets.logo);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.rect(outerMargin, outerMargin, pageWidth - (outerMargin * 2), pageHeight - (outerMargin * 2));

  const logoX = contentLeft + 1;
  const logoY = 14.2;
  const logoW = 31;
  const logoH = 31;

  doc.setDrawColor(210, 214, 220);
  doc.setLineWidth(0.15);
  doc.roundedRect(contentLeft, 13.6, 34, 33.5, 0.8, 0.8);

  if (assets.logo) {
    try {
      doc.addImage(assets.logo, "PNG", logoX, logoY, logoW, logoH);
    } catch {}
  }

  const companyX = assets.logo ? 51 : contentLeft;
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.2);
  doc.text(COMPANY_NAME, companyX, 17.7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(COMPANY_CIN, companyX, 23.6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.text(COMPANY_ADDRESS_LINE_1.replace(/^Address:\s*/i, ""), companyX, 29.6);
  doc.text(COMPANY_ADDRESS_LINE_2, companyX, 34.4);

  doc.setTextColor(16, 55, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.8);
  doc.text(String(title || "Document").toUpperCase(), contentRight - 15.5, 17.8, { align: "right" });
  doc.setTextColor(17, 24, 39);

  const badgeX = contentLeft;
  const badgeY = 43.8;
  const badgeW = 41;
  const badgeH = 7;
  doc.setFillColor(17, 55, 130);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, "F");
  doc.setFillColor(34, 197, 94);
  doc.circle(badgeX + 4.4, badgeY + 3.5, 2.0, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.line(badgeX + 3.45, badgeY + 3.55, badgeX + 4.05, badgeY + 4.15);
  doc.line(badgeX + 4.05, badgeY + 4.15, badgeX + 5.35, badgeY + 2.85);
  doc.setTextColor(255, 255, 255);
  doc.text(verifiedText, badgeX + 7.5, badgeY + 4.45);
  doc.setTextColor(17, 24, 39);

  const dividerY = badgeY + badgeH + 0.7;
  doc.setDrawColor(130, 130, 130);
  doc.line(contentLeft, dividerY, contentRight, dividerY);
  return dividerY + 2.2;
}

export async function addOldEmsInvoiceHeader(doc, { title = "INVOICE", verifiedText = "DIGITALLY VERIFIED" } = {}) {
  const assets = await ensurePdfAssets();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const companyNameY = 18;
  const companyLineGap = 4.25;
  const verifiedCircleX = pageWidth - 41;
  const verifiedCircleY = 17.2;

  drawWatermark(doc, pageWidth, pageHeight, assets.logo);

  if (assets.logo) {
    try {
      doc.addImage(assets.logo, "PNG", 15, 13.4, 28, 20.2);
    } catch {}
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(COMPANY_NAME, 45, companyNameY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(COMPANY_GST, 45, companyNameY + companyLineGap);
  doc.text(COMPANY_ADDRESS_LINE_1, 45, companyNameY + (companyLineGap * 2));
  doc.text(COMPANY_ADDRESS_LINE_2, 45, companyNameY + (companyLineGap * 3));
  doc.text(COMPANY_CIN, 45, companyNameY + (companyLineGap * 4));

  doc.setFillColor(34, 197, 94);
  doc.circle(verifiedCircleX, verifiedCircleY, 1.85, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.line(verifiedCircleX - 0.8, verifiedCircleY + 0.05, verifiedCircleX - 0.2, verifiedCircleY + 0.65);
  doc.line(verifiedCircleX - 0.2, verifiedCircleY + 0.65, verifiedCircleX + 0.95, verifiedCircleY - 0.55);
  doc.setTextColor(0, 120, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.text(String(verifiedText || "Digitally Verified"), pageWidth - 18, 18, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(String(title || "INVOICE").toUpperCase(), 184, 47, { align: "right" });

  doc.setTextColor(17, 24, 39);
  return 40;
}

export async function addOldEmsCompanyHeader(doc, { title = "INVOICE", verifiedText = "Digitally Verified" } = {}) {
  return addOldEmsInvoiceHeader(doc, { title, verifiedText });
}

export function addOldEmsClientDetailsBlock(doc, {
  client = {},
  invoice = {},
  startY = 47,
  leftX = 15,
  rightX = 145,
  addressWidth = 110,
  showDivider = true,
  rightBlockTopOffset = 21,
  rightBlockRowGap = 7
} = {}) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Invoice No: ${invoice.billNo || invoice.invoiceNo || "N/A"}`, rightX, startY + rightBlockTopOffset);
  doc.text(`Date: ${invoice.billDate || invoice.date || "N/A"}`, rightX, startY + rightBlockTopOffset + rightBlockRowGap);

  doc.setFont("helvetica", "bold");
  doc.text("Client Details", leftX, startY + 15);

  doc.setFont("helvetica", "normal");
  doc.text(`Name: ${client.name || invoice.clientName || "N/A"}`, leftX, startY + 23);

  const address = `Address: ${client.address || invoice.clientAddress || "N/A"}`;
  const splitAddress = doc.splitTextToSize(address, addressWidth);
  doc.text(splitAddress, leftX, startY + 30);
  const addressHeight = splitAddress.length * 5;

  const gstY = startY + 30 + addressHeight + 3;
  doc.text(`GSTIN: ${client.gstin || invoice.gstin || "N/A"}`, leftX, gstY);

  doc.text(`Place of Supply: ${invoice.placeOfSupply || "Andhra Pradesh"}`, rightX, startY + rightBlockTopOffset + (rightBlockRowGap * 2));
  doc.text(`State Code: ${invoice.stateCode || "37"}`, rightX, startY + rightBlockTopOffset + (rightBlockRowGap * 3));
  doc.text(`Invoice Type: ${invoice.invoiceType || "N/A"}`, rightX, startY + rightBlockTopOffset + (rightBlockRowGap * 4));

  const lineY = gstY + 6;
  if (showDivider) {
    doc.line(15, lineY, 195, lineY);
  }
  return lineY;
}

export function addOldEmsClientInvoiceSections(doc, { client = {}, invoice = {}, startY = 47 } = {}) {
  return addOldEmsClientDetailsBlock(doc, { client, invoice, startY });
}

export function addOldEmsBankDetailsBlock(doc, {
  startY = 40,
  marginLeft = 15,
  tableWidth = 90,
  details = BANK_DETAILS,
  headTitle = "Bank Details"
} = {}) {
  doc.autoTable({
    startY,
    margin: { left: marginLeft },
    tableWidth,
    head: [[headTitle, ""]],
    body: [
      ["Bank", details.bankName || details.bank || "N/A"],
      ["A/C No", details.accountNumber || details.accountNo || "N/A"],
      ["IFSC", details.ifsc || "N/A"],
      ["Branch", details.branch || "N/A"]
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.65, textColor: [17, 24, 39] },
    headStyles: { fillColor: [0, 102, 204], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 23 }, 1: { cellWidth: 67 } }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addOldEmsBankDetailsSection(doc, startY = 40) {
  return addOldEmsBankDetailsBlock(doc, {
    startY,
    details: {
      bankName: "Axis Bank",
      accountNumber: "924020062188598",
      ifsc: "UTIB0000107",
      branch: "Rajahmundry, AP"
    }
  });
}

export function addOldEmsTaxSummaryBlock(doc, {
  startY = 40,
  marginLeft = 110,
  tableWidth = 85,
  title = "Tax Summary",
  rows = []
} = {}) {
  doc.autoTable({
    startY,
    margin: { left: marginLeft },
    tableWidth,
    head: [[title, ""]],
    body: rows.map((row) => {
      if (Array.isArray(row)) return row;
      return [row.label || "", String(row.value ?? "")];
    }),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.65, textColor: [17, 24, 39] },
    headStyles: { fillColor: [0, 102, 204], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 57 },
      1: { cellWidth: 28, halign: "right" }
    }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addOldEmsCreditNotesSection(doc, creditNotes = [], startY = 40, options = {}) {
  if (!Array.isArray(creditNotes) || !creditNotes.length) return startY;
  const marginLeft = options.marginLeft ?? 110;
  const tableWidth = options.tableWidth ?? 85;
  const col1Width = options.col1Width ?? 34;
  const col2Width = options.col2Width ?? 36;
  const col3Width = options.col3Width ?? 20;

  doc.autoTable({
    startY,
    margin: { left: marginLeft, right: options.marginRight ?? (doc.internal.pageSize.getWidth() - marginLeft - tableWidth) },
    tableWidth,
    head: [["Credit Note No", "Reason", "Amount"]],
    body: creditNotes.map((note) => [
      note.credit_note_no || "—",
      note.reason || "Adjustment",
      note.amount || "Rs. 0.00"
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.45, textColor: [17, 24, 39] },
    headStyles: { fillColor: [200, 0, 0], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: col1Width },
      1: { cellWidth: col2Width },
      2: { halign: "right", cellWidth: col3Width }
    }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addOldEmsLegalDeclaration(doc, startY = 200, text = "") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Legal Declaration:", 15, startY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const splitLegal = doc.splitTextToSize(String(text || ""), 90);
  doc.text(splitLegal, 15, startY + 5, { lineHeightFactor: 1.3 });
  doc.setTextColor(17, 24, 39);
  return startY + 5 + (splitLegal.length * 3.4);
}

export function addOldEmsDeclarationBlock(doc, {
  startY = 200,
  title = "Legal Declaration:",
  text = "",
  width = 90
} = {}) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(title, 15, startY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const splitLegal = doc.splitTextToSize(String(text || ""), width);
  doc.text(splitLegal, 15, startY + 5, { lineHeightFactor: 1.3 });
  doc.setTextColor(17, 24, 39);
  return startY + 5 + (splitLegal.length * 3.4);
}

export async function addOldEmsSignatureBlock(doc, startY = 235) {
  const assets = await ensurePdfAssets();
  if (assets.signature) {
    try {
      doc.addImage(assets.signature, "PNG", 136, startY - 13, 40, 15);
    } catch {}
  }
  if (assets.stamp) {
    try {
      doc.addImage(assets.stamp, "PNG", 165, startY - 20, 30, 30);
    } catch {}
  }
  doc.setDrawColor(0, 0, 0);
  doc.line(130, startY, 195, startY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Authorized Signatory", 162, startY + 5, { align: "center" });
  return startY + 10;
}

export async function addOldEmsSignatureStampBlock(doc, {
  startY = 235,
  signatureX = 136,
  signatureY = startY - 13,
  signatureWidth = 40,
  signatureHeight = 15,
  stampX = 165,
  stampY = startY - 20,
  stampWidth = 30,
  stampHeight = 30,
  lineStartX = 130,
  lineEndX = 195,
  labelX = 162,
  label = "Authorized Signatory"
} = {}) {
  const assets = await ensurePdfAssets();
  if (assets.signature) {
    try {
      doc.addImage(assets.signature, "PNG", signatureX, signatureY, signatureWidth, signatureHeight);
    } catch {}
  }
  if (assets.stamp) {
    try {
      doc.addImage(assets.stamp, "PNG", stampX, stampY, stampWidth, stampHeight);
    } catch {}
  }
  doc.setDrawColor(0, 0, 0);
  doc.line(lineStartX, startY, lineEndX, startY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(label, labelX, startY + 5, { align: "center" });
  return startY + 10;
}

export function addSummarySection(doc, title, fields = [], startY = 40, options = {}) {
  const marginLeft = options.marginLeft ?? 110;
  const tableWidth = options.tableWidth ?? 86;
  doc.autoTable({
    startY,
    margin: { left: marginLeft },
    tableWidth,
    head: [[title, ""]],
    body: fields.map((field) => [field.label, String(field.value ?? "—")]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: options.fontSize ?? 7.8, cellPadding: options.cellPadding ?? 1.65, textColor: [17, 24, 39], lineColor: options.lineColor ?? [165, 165, 165], lineWidth: options.lineWidth ?? 0.2 },
    headStyles: { fillColor: options.headFillColor ?? [17, 55, 130], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: options.alternateRowFill ?? [245, 245, 245] },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, ...(options.columnStyles || {}) }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addDetailsSection(doc, title, fields = [], startY = 40, options = {}) {
  const body = [];
  for (let index = 0; index < fields.length; index += 2) {
    const left = fields[index] || { label: "", value: "" };
    const right = fields[index + 1] || { label: "", value: "" };
    body.push([
      left.label || "",
      String(left.value ?? "N/A"),
      right.label || "",
      String(right.value ?? "N/A")
    ]);
  }
  doc.autoTable({
    startY,
    head: [[title, "", "", ""]],
    body,
    theme: "grid",
    margin: { left: 14, right: 14 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, textColor: [17, 24, 39] },
    headStyles: { fillColor: [0, 102, 204], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: options.leftLabelWidth || 28 },
      1: { cellWidth: options.leftValueWidth || 58 },
      2: { fontStyle: "bold", cellWidth: options.rightLabelWidth || 28 },
      3: { cellWidth: options.rightValueWidth || 58 }
    }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addTable(doc, { head = [], body = [], startY = 40, foot = [], options = {} } = {}) {
  doc.autoTable({
    startY,
    head: [head],
    body,
    foot: foot.length ? [foot] : undefined,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: options.fontSize ?? 7.7,
      textColor: [17, 24, 39],
      cellPadding: options.cellPadding ?? 1.45,
      lineColor: options.lineColor ?? [165, 165, 165],
      lineWidth: options.lineWidth ?? 0.18,
      overflow: "linebreak"
    },
    headStyles: {
      fillColor: options.headFillColor ?? [17, 55, 130],
      textColor: [255, 255, 255],
      fontStyle: "bold"
    },
    footStyles: {
      fillColor: options.footFillColor ?? [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: options.alternateRowFill ?? [245, 245, 245]
    },
    margin: { left: options.marginLeft ?? 14, right: options.marginRight ?? 14 },
    columnStyles: options.columnStyles || {}
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addClientInvoiceDetailsSection(doc, {
  startY = 40,
  leftTitle = "CLIENT / INVOICE DETAILS",
  leftFields = [],
  rightFields = [],
  leftWidth = 104,
  rightWidth = 86,
  gap = 4
} = {}) {
  const leftX = 14;
  const rightX = leftX + leftWidth + gap;

  const leftRows = leftFields.map((field) => [field.label || "", String(field.value ?? "—")]);
  doc.autoTable({
    startY,
    margin: { left: leftX },
    tableWidth: leftWidth,
    head: [[leftTitle, ""]],
    body: leftRows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.0, cellPadding: 2.0, lineColor: [165, 165, 165], lineWidth: 0.2, textColor: [17, 24, 39], valign: "top" },
    headStyles: { fillColor: [17, 55, 130], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 28 },
      1: { cellWidth: leftWidth - 28 }
    }
  });
  const leftEndY = doc.lastAutoTable?.finalY || startY;

  const rightRows = rightFields.map((field) => [field.label || "", String(field.value ?? "—")]);
  doc.autoTable({
    startY: startY + 5.0,
    margin: { left: rightX },
    tableWidth: rightWidth,
    body: rightRows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.0, cellPadding: 2.35, lineColor: [165, 165, 165], lineWidth: 0.2, textColor: [17, 24, 39], valign: "middle" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 29 },
      1: { cellWidth: rightWidth - 29 }
    }
  });
  const rightEndY = doc.lastAutoTable?.finalY || startY;
  return Math.max(leftEndY, rightEndY);
}

export function addClientInvoiceFooter(doc, { declarationLines = [] } = {}) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const textLines = Array.isArray(declarationLines) ? declarationLines.filter(Boolean) : [String(declarationLines || "")];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.0);
  doc.setTextColor(17, 24, 39);
  doc.text("This is a system generated document. No signature required.", 14, pageHeight - 6.2);
  doc.setFont("helvetica", "italic");
  doc.text("Page 1 of 1", pageWidth - 14, pageHeight - 6.2, { align: "right" });

  if (!textLines.length) return;

  const declarationTop = pageHeight - 39.2;
  doc.setDrawColor(130, 130, 130);
  doc.rect(14, declarationTop, 108, 24.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.9);
  doc.text("PURE AGENT DECLARATION", 16, declarationTop + 4.2);
  doc.setFontSize(7.2);
  let y = declarationTop + 10.4;
  textLines.forEach((line) => {
    doc.text(String(line), 16, y);
    y += 3.6;
  });
}

export async function addDocumentFooter(doc, footerText = "This is a system generated document. No signature required.") {
  const assets = await ensurePdfAssets();
  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    drawWatermark(doc, pageWidth, pageHeight, assets.logo);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(75, 85, 99);
    doc.text(footerText, 14, pageHeight - 10);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }
}

export function savePdf(doc, filename, driveMeta = null) {
  const name = filename || "document.pdf";
  doc.save(name);
  // Optional: also archive the generated PDF to Google Drive. Best-effort and
  // fully non-blocking — a failed/unconfigured Drive upload never affects the
  // local download. Pass a driveMeta object (see drive-api.js) to enable.
  if (driveMeta && typeof driveMeta === "object") {
    queueDriveArchive(doc, name, driveMeta);
  }
}

async function queueDriveArchive(doc, filename, driveMeta) {
  try {
    const mod = await import("./drive-api.js");
    if (!mod.isDriveAutoSaveEnabled()) return;
    const base64 = mod.pdfDocToBase64(doc);
    await mod.uploadDocumentToDrive({ ...driveMeta, fileName: driveMeta.fileName || filename }, base64);
  } catch (error) {
    console.warn("Drive auto-save skipped:", error?.message || error);
  }
}

export function formatPdfCurrency(value) {
  const amount = Number(value || 0);
  return `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPdfQuantity(value, scale = 3) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: scale, maximumFractionDigits: scale });
}

export function formatPdfDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-IN");
}

export function formatPdfFilename(prefix, documentNo) {
  const cleaned = String(documentNo || "document")
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_/g, "-");
  const normalizedPrefix = String(prefix || "DOC").replace(/[^A-Za-z0-9-]/g, "") || "DOC";
  const base = cleaned.replace(new RegExp(`^${normalizedPrefix}[-_]?`, "i"), "");
  return `${normalizedPrefix}-${base}.pdf`;
}

export function addBankDetailsSection(doc, startY = 40, options = {}) {
  const marginLeft = options.marginLeft ?? 14;
  const tableWidth = options.tableWidth ?? 90;
  doc.autoTable({
    startY,
    margin: { left: marginLeft },
    tableWidth,
    head: [["BANK DETAILS", ""]],
    body: [
      ["Bank", BANK_DETAILS.bankName],
      ["A/C No", BANK_DETAILS.accountNumber],
      ["IFSC", BANK_DETAILS.ifsc],
      ["Branch", BANK_DETAILS.branch],
      ["UPI", BANK_DETAILS.upiId]
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: options.fontSize ?? 7.8, cellPadding: options.cellPadding ?? 1.65, textColor: [17, 24, 39], lineColor: options.lineColor ?? [165, 165, 165], lineWidth: options.lineWidth ?? 0.2 },
    headStyles: { fillColor: options.headFillColor ?? [17, 55, 130], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: options.alternateRowFill ?? [245, 245, 245] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 23 }, 1: { cellWidth: tableWidth - 23 } }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export function addDeclarationSection(doc, title, lines = [], startY = 40) {
  const textLines = Array.isArray(lines) ? lines : [String(lines || "")];
  doc.autoTable({
    startY,
    head: [[title]],
    body: [[textLines.join("\n")]],
    theme: "grid",
    margin: { left: 14, right: 14 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.2, textColor: [90, 90, 90], overflow: "linebreak" },
    headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold", halign: "left" }
  });
  return doc.lastAutoTable?.finalY || startY;
}

export async function addSignatureSection(doc, startY = 40) {
  const assets = await ensurePdfAssets();
  const pageWidth = doc.internal.pageSize.getWidth();
  const x1 = 132;
  const x2 = pageWidth - 14;
  const safeY = Math.min(startY + 14, doc.internal.pageSize.getHeight() - 28);
  if (assets.signature) {
    try {
      doc.addImage(assets.signature, "PNG", 143, safeY - 17, 34, 12);
    } catch {}
  }
  if (assets.stamp) {
    try {
      doc.addImage(assets.stamp, "PNG", 166, safeY - 20, 22, 22);
    } catch {}
  }
  doc.setDrawColor(0, 0, 0);
  doc.line(x1, safeY, x2, safeY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FOR VARADA NEXUS PRIVATE LIMITED", x2, safeY - 7, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("Authorized Signatory", x2, safeY + 5, { align: "right" });
  return safeY + 10;
}

export async function addClientInvoiceSignatureBlock(doc, startY = 40) {
  const assets = await ensurePdfAssets();
  const pageWidth = doc.internal.pageSize.getWidth();
  const blockX = 122;
  const blockWidth = pageWidth - blockX - 14;
  const topY = startY;
  const bottomLineY = topY + 20.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.0);
  doc.setTextColor(17, 24, 39);
  doc.text("FOR VARADA NEXUS PRIVATE LIMITED", blockX + (blockWidth / 2), topY + 4.2, { align: "center" });

  if (assets.signature) {
    try {
      doc.addImage(assets.signature, "PNG", blockX + 10, topY + 8.5, 22, 9.5);
    } catch {}
  }
  if (assets.stamp) {
    try {
      doc.addImage(assets.stamp, "PNG", blockX + 41, topY + 7.2, 18, 18);
    } catch {}
  }

  doc.setDrawColor(0, 0, 0);
  doc.line(blockX + 8, bottomLineY, blockX + blockWidth - 8, bottomLineY);
  doc.text("Authorized Signatory", blockX + (blockWidth / 2), bottomLineY + 4.1, { align: "center" });
  return bottomLineY + 6;
}

async function ensurePdfAssets() {
  if (!pdfAssetPromise) {
    pdfAssetPromise = Promise.all([
      loadImageAsDataUrl(PDF_ASSET_PATHS.logo),
      loadImageAsDataUrl(PDF_ASSET_PATHS.stamp),
      loadImageAsDataUrl(PDF_ASSET_PATHS.signature)
    ]).then(([logo, stamp, signature]) => ({ logo, stamp, signature }))
      .catch(() => ({ logo: null, stamp: null, signature: null }));
  }
  return await pdfAssetPromise;
}

export async function loadImageAsDataUrl(path) {
  try {
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawWatermark(doc, pageWidth, pageHeight, logoDataUrl = null) {
  try {
    if (logoDataUrl && doc.setGState) {
      doc.setGState(new doc.GState({ opacity: 0.035 }));
      doc.addImage(logoDataUrl, "PNG", (pageWidth / 2) - 34, (pageHeight / 2) - 35, 68, 68);
      doc.setGState(new doc.GState({ opacity: 1 }));
      return;
    }
  } catch {}
  doc.setTextColor(230, 236, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.text("VN", pageWidth / 2, pageHeight / 2, { align: "center", angle: 30 });
  doc.setTextColor(0, 0, 0);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pdf-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.pdfSrc = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}