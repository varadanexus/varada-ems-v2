import {
  createPdfDocument,
  formatPdfCurrency,
  formatPdfDate,
  loadImageAsDataUrl,
  savePdf
} from "./pdf-utils.js";

const LOGO_URL = "/new-ems/assets/pdf/vn-logo.png";
const COLORS = {
  ink: [10, 12, 17],
  gold: [202, 164, 72],
  paleGold: [248, 241, 219],
  muted: [98, 101, 109],
  line: [211, 205, 188],
  white: [255, 255, 255]
};

function clean(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function fileSafe(value) {
  return clean(value, "BOQ-Estimate")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "BOQ-Estimate";
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function formatUom(value) {
  const text = String(value ?? "").trim();
  return !text || text === "0" ? "-" : text;
}

function titleCaseStatus(value) {
  return clean(value, "draft").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addPageFurniture(doc, logo, header, pageNumber, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  if (logo) {
    try { doc.addImage(logo, "PNG", 14, 8, 15, 11, undefined, "FAST"); } catch {}
  }
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("VARADA NEXUS", 33, 12.5);
  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(5.8);
  doc.text("PRIVATE LIMITED", 33, 16.5);

  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(`${clean(header.boqCode)}  /  REV-${clean(header.revisionNo, "1")}`, pageWidth - 14, 12.5, { align: "right" });
  doc.text("INTERIORS - BOQ ESTIMATE", pageWidth - 14, 17, { align: "right" });
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.45);
  doc.line(14, 22, pageWidth - 14, 22);

  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("connect@varadanexus.com  |  www.varadanexus.com", 14, pageHeight - 10);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: "right" });
}

function addEstimateSummary(doc, payload) {
  const { header, project } = payload;
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("BOQ ESTIMATE", 14, 34);
  doc.setTextColor(...COLORS.gold);
  doc.setFontSize(8);
  doc.text(clean(header.boqName).toUpperCase(), 14, 40);

  const rows = [
    ["Project", [clean(project.projectCode), clean(project.projectTitle || project.projectName)].filter((value) => value !== "-").join(" - ") || "-", "BOQ Code", clean(header.boqCode)],
    ["Client", clean(project.clientName), "Revision", clean(header.revisionNo, "1")],
    ["Status", titleCaseStatus(header.status), "Generated", formatPdfDate(new Date().toISOString())]
  ];
  doc.autoTable({
    startY: 45,
    body: rows,
    theme: "grid",
    margin: { left: 14, right: 14 },
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 2.1, lineColor: COLORS.line, lineWidth: 0.2, textColor: COLORS.ink },
    alternateRowStyles: { fillColor: [250, 249, 246] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 18 },
      1: { cellWidth: 79 },
      2: { fontStyle: "bold", cellWidth: 18 },
      3: { cellWidth: 67 }
    }
  });
  return (doc.lastAutoTable?.finalY || 66) + 5;
}

function addClosingSection(doc, payload, startY) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const total = Number(payload.header.totalAmount || 0);
  let y = startY;
  if (y > pageHeight - 70) {
    doc.addPage();
    y = 31;
  }

  doc.setFillColor(...COLORS.paleGold);
  doc.setDrawColor(...COLORS.gold);
  doc.roundedRect(118, y, pageWidth - 132, 17, 1.5, 1.5, "FD");
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("ESTIMATED BOQ TOTAL", 122, y + 6);
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(13);
  doc.text(formatPdfCurrency(total), pageWidth - 18, y + 12.5, { align: "right" });

  y += 24;
  if (payload.header.description) {
    doc.setTextColor(...COLORS.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SCOPE NOTE", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const description = doc.splitTextToSize(clean(payload.header.description), 180);
    doc.text(description, 14, y + 5, { lineHeightFactor: 1.25 });
    y += 7 + (description.length * 3.7);
  }

  doc.setFillColor(247, 247, 246);
  doc.setDrawColor(...COLORS.line);
  const disclaimer = "Estimate disclaimer: This BOQ is an indicative project estimate based on the saved quantities, rates and scope at the stated revision. It is not a tax invoice, final contract value or payment demand. Taxes, statutory charges, site conditions, client changes, approved variations and actual measurements may change the final amount. Verify the approved scope before procurement or execution.";
  const lines = doc.splitTextToSize(disclaimer, 174);
  const boxHeight = Math.max(18, 8 + (lines.length * 3.5));
  doc.roundedRect(14, y, pageWidth - 28, boxHeight, 1.3, 1.3, "FD");
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(lines, 18, y + 6, { lineHeightFactor: 1.25 });
}

export async function generateInteriorsBoqPdf(payload) {
  if (!payload?.header) throw new Error("Select a BOQ before downloading the estimate.");
  if (!Array.isArray(payload.lines) || !payload.lines.length) throw new Error("Add at least one BOQ line before downloading the estimate.");

  const [doc, logo] = await Promise.all([createPdfDocument(), loadImageAsDataUrl(LOGO_URL)]);
  doc.setProperties({
    title: `${clean(payload.header.boqCode)} - ${clean(payload.header.boqName)} BOQ Estimate`,
    subject: "Interior project bill of quantities estimate",
    author: "Varada Nexus Private Limited",
    creator: "Varada Nexus EMS"
  });

  const firstTableY = addEstimateSummary(doc, payload);
  const body = payload.lines.map((line) => [
    clean(line.lineNo),
    clean(line.scopeItem),
    clean(line.description, ""),
    formatUom(line.uom),
    formatQuantity(line.quantity),
    Number(line.wastagePercent || 0) ? `${formatQuantity(line.wastagePercent)}%` : "-",
    formatPdfCurrency(line.unitRate),
    formatPdfCurrency(line.lineAmount),
    clean(line.remarks, "")
  ]);

  doc.autoTable({
    startY: firstTableY,
    head: [["NO", "SCOPE ITEM", "DESCRIPTION", "UOM", "QTY", "WASTE", "RATE", "AMOUNT", "REMARKS"]],
    body,
    theme: "grid",
    margin: { top: 29, right: 14, bottom: 22, left: 14 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 6.5, cellPadding: 1.55, lineColor: COLORS.line, lineWidth: 0.18, textColor: COLORS.ink, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: COLORS.ink, textColor: COLORS.white, fontStyle: "bold", fontSize: 6.2 },
    alternateRowStyles: { fillColor: [249, 248, 244] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: 31 },
      3: { cellWidth: 11, halign: "center" },
      4: { cellWidth: 13, halign: "right" },
      5: { cellWidth: 13, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 25, halign: "right", fontStyle: "bold" },
      8: { cellWidth: 21 }
    }
  });

  addClosingSection(doc, payload, (doc.lastAutoTable?.finalY || firstTableY) + 7);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    addPageFurniture(doc, logo, payload.header, page, pageCount);
  }

  const filename = `${fileSafe(payload.header.boqCode)}-Rev-${fileSafe(payload.header.revisionNo || 1)}-BOQ-Estimate.pdf`;
  savePdf(doc, filename);
  return { filename, pageCount };
}
