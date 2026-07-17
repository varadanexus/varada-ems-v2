import { ensurePdfLib, loadImageAsDataUrl } from "/new-ems/shared/pdf-utils.js";

const COLORS = {
  page: [8, 11, 17],
  panel: [16, 20, 29],
  panelAlt: [20, 24, 34],
  border: [55, 59, 68],
  gold: [218, 183, 95],
  goldSoft: [239, 211, 139],
  text: [242, 239, 231],
  muted: [160, 164, 172],
  green: [86, 211, 141],
};

const REPORT_DISCLAIMER = "This calculator and report are informational tools only. All figures are based solely on data entered by the user and do not represent, bind, certify or create any obligation for Varada Nexus Private Limited. Varada Nexus Private Limited accepts no liability for decisions, losses, tax treatment, contractual claims or other outcomes arising from use of this tool or report. Verify all inputs and obtain appropriate professional advice before acting.";

const money = (value) => `INR ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const number = (value, digits = 2) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });

function setText(doc, color = COLORS.text) {
  doc.setTextColor(...color);
}

function drawPageBase(doc, logo, compact = false) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFillColor(...COLORS.page);
  doc.rect(0, 0, width, height, "F");
  doc.setFillColor(...COLORS.panel);
  doc.rect(0, 0, width, compact ? 30 : 43, "F");
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.45);
  doc.line(12, compact ? 29 : 42, width - 12, compact ? 29 : 42);
  if (logo) {
    try { doc.addImage(logo, "PNG", 13, compact ? 6 : 8, compact ? 19 : 24, compact ? 16 : 20, undefined, "FAST"); } catch {}
  }
  const companyX = logo ? (compact ? 36 : 41) : 14;
  setText(doc, COLORS.goldSoft);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 10 : 12);
  doc.text("VARADA NEXUS PRIVATE LIMITED", companyX, compact ? 12 : 15);
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text("CIN: U43121AP2025PTC117741  |  GST: 37AAKCV7495B1ZV", companyX, compact ? 17 : 21);
  if (!compact) doc.text("80-17-28, K B Nagar, A V A Road, Rajahmundry, Andhra Pradesh - 533101", companyX, 26);
  doc.text("connect@varadanexus.com  |  www.varadanexus.com", width - 13, compact ? 17 : 21, { align: "right" });
  if (!compact) doc.text("Professional Transportation & Logistics Report", width - 13, 27, { align: "right" });
}

function drawKpis(doc, items, startY) {
  const left = 13;
  const gap = 4;
  const cardWidth = (184 - (gap * 2)) / 3;
  const cardHeight = 22;
  items.slice(0, 6).forEach((item, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = left + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + 4);
    doc.setFillColor(...COLORS.panel);
    doc.setDrawColor(...(item.positive ? COLORS.green : COLORS.border));
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.text(String(item.label), x + 3, y + 6);
    setText(doc, item.positive ? COLORS.green : COLORS.goldSoft);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(String(item.value), x + 3, y + 15);
  });
  return startY + (items.length > 3 ? 48 : 22);
}

function sectionHeading(doc, title, y) {
  setText(doc, COLORS.gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(String(title).toUpperCase(), 13, y);
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.25);
  doc.line(13, y + 2, 197, y + 2);
}

function ensureRoom(doc, logo, paintedPages, y, needed = 28) {
  if (y + needed < 278) return y;
  doc.addPage();
  const page = doc.getNumberOfPages();
  drawPageBase(doc, logo, true);
  paintedPages.add(page);
  return 37;
}

function addReportTable(doc, logo, paintedPages, table, startY) {
  let y = ensureRoom(doc, logo, paintedPages, startY, 34);
  sectionHeading(doc, table.title, y);
  doc.autoTable({
    startY: y + 5,
    head: [table.head],
    body: table.body,
    foot: table.foot?.length ? [table.foot] : undefined,
    margin: { left: 13, right: 13, top: 35, bottom: 18 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.4, textColor: COLORS.text, fillColor: COLORS.panel, lineColor: COLORS.border, lineWidth: 0.15, overflow: "linebreak" },
    headStyles: { fillColor: [27, 31, 42], textColor: COLORS.goldSoft, fontStyle: "bold", lineColor: COLORS.border },
    alternateRowStyles: { fillColor: COLORS.panelAlt },
    footStyles: { fillColor: [38, 34, 24], textColor: COLORS.goldSoft, fontStyle: "bold", lineColor: COLORS.gold },
    willDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      if (!paintedPages.has(page)) {
        drawPageBase(doc, logo, true);
        paintedPages.add(page);
      }
    },
  });
  return (doc.lastAutoTable?.finalY || y + 20) + 8;
}

export async function downloadTransportReport(report) {
  const JsPdf = await ensurePdfLib();
  const doc = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadImageAsDataUrl("/images/logo.png") || await loadImageAsDataUrl("/new-ems/assets/pdf/vn-logo.png");
  const paintedPages = new Set([1]);
  drawPageBase(doc, logo, false);
  doc.setProperties({ title: report.title, subject: report.subtitle, author: "Varada Nexus Private Limited", creator: "Varada Nexus Professional Tools" });

  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(String(report.title), 13, 54);
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.text(String(report.subtitle || "Monthly calculation report"), 13, 60);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 197, 54, { align: "right" });
  doc.text("Currency: Indian Rupees (INR)", 197, 60, { align: "right" });

  let y = drawKpis(doc, report.kpis || [], 67) + 8;
  if (report.highlights?.length) {
    y = addReportTable(doc, logo, paintedPages, { title: "Operational summary", head: ["Metric", "Value"], body: report.highlights.map((row) => [row.label, row.value]) }, y);
  }
  for (const table of report.tables || []) y = addReportTable(doc, logo, paintedPages, table, y);
  if (report.details?.length) {
    y = addReportTable(doc, logo, paintedPages, { title: "Calculation details", head: ["Metric", "Value"], body: report.details.map((row) => [row.label, row.value]) }, y);
  }
  y = addReportTable(doc, logo, paintedPages, { title: "Important disclaimer", head: ["Use of this report"], body: [[report.disclaimer || REPORT_DISCLAIMER]] }, y);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...COLORS.gold);
    doc.line(13, height - 14, 197, height - 14);
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Varada Nexus Private Limited | Rajahmundry, Andhra Pradesh | connect@varadanexus.com | www.varadanexus.com", 13, height - 9);
    doc.text(`Page ${page} of ${pageCount}`, 197, height - 9, { align: "right" });
  }
  doc.save(report.filename || "varada-nexus-transport-report.pdf");
}

export const pdfFormat = { money, number };
