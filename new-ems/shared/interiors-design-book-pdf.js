const JSPDF_ESM = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm";
const LOGO_URL = "/new-ems/assets/pdf/vn-logo.png";

const COLORS = {
  ink: [7, 10, 15],
  navy: [13, 31, 57],
  gold: [205, 166, 72],
  paleGold: [238, 214, 145],
  ivory: [248, 246, 239],
  muted: [102, 111, 124],
  line: [221, 214, 194],
  white: [255, 255, 255]
};

function clean(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function safeFileName(value) {
  return clean(value, "Interior-Design-Book")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "Interior-Design-Book";
}

function dataFormat(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl || "");
  const type = String(match?.[1] || "JPEG").toUpperCase();
  return type === "JPG" ? "JPEG" : type;
}

async function fetchAsDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addImageContain(doc, image, x, y, width, height, padding = 0) {
  if (!image?.dataUrl) return false;
  try {
    const props = doc.getImageProperties(image.dataUrl);
    const ratio = Math.min((width - padding * 2) / props.width, (height - padding * 2) / props.height);
    const drawW = props.width * ratio;
    const drawH = props.height * ratio;
    doc.addImage(image.dataUrl, dataFormat(image.dataUrl), x + (width - drawW) / 2, y + (height - drawH) / 2, drawW, drawH, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}

function addImageCover(doc, image, x, y, width, height) {
  if (!image?.dataUrl) return false;
  try {
    const props = doc.getImageProperties(image.dataUrl);
    const ratio = Math.max(width / props.width, height / props.height);
    const drawW = props.width * ratio;
    const drawH = props.height * ratio;
    doc.saveGraphicsState();
    doc.rect(x, y, width, height);
    doc.clip();
    doc.addImage(image.dataUrl, dataFormat(image.dataUrl), x + (width - drawW) / 2, y + (height - drawH) / 2, drawW, drawH, undefined, "FAST");
    doc.restoreGraphicsState();
    return true;
  } catch {
    return false;
  }
}

function setText(doc, color, size, style = "normal", font = "helvetica") {
  doc.setTextColor(...color);
  doc.setFont(font, style);
  doc.setFontSize(size);
}

function addBrandMark(doc, logo, { dark = false, compact = false } = {}) {
  if (logo) doc.addImage(logo, "PNG", 15, 10, compact ? 13 : 17, compact ? 9 : 12, undefined, "FAST");
  setText(doc, dark ? COLORS.ink : COLORS.white, compact ? 8 : 10, "bold");
  doc.text("VARADA NEXUS", compact ? 31 : 36, compact ? 15 : 17);
  setText(doc, dark ? COLORS.gold : COLORS.paleGold, compact ? 5.5 : 6.5, "normal");
  doc.text("PRIVATE LIMITED", compact ? 31 : 36, compact ? 19 : 22);
}

function addHeader(doc, logo, meta, page, pageNumber) {
  doc.setFillColor(...COLORS.ivory);
  doc.rect(0, 0, 210, 25, "F");
  addBrandMark(doc, logo, { dark: true, compact: true });
  setText(doc, COLORS.muted, 6.5, "normal");
  doc.text(clean(meta.documentType, "INTERIOR DESIGN BOOK").toUpperCase(), 195, 13, { align: "right" });
  setText(doc, COLORS.ink, 8, "bold");
  doc.text(`V${clean(meta.revision, "1")}  /  ${String(pageNumber).padStart(2, "0")}`, 195, 19, { align: "right" });
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.45);
  doc.line(15, 25, 195, 25);
  setText(doc, COLORS.gold, 6.5, "bold");
  doc.text(clean(page.type, "DESIGN PAGE").replace(/_/g, " ").toUpperCase(), 15, 32);
}

function addFooter(doc, meta, pageNumber, totalPages) {
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.line(15, 282, 195, 282);
  setText(doc, COLORS.muted, 5.8, "normal");
  const code = [clean(meta.projectCode), `REV-${clean(meta.revision, "1")}`].filter(Boolean).join("  /  ");
  doc.text(code || "INTERIORS DESIGN CONTROL", 15, 288);
  doc.text(meta.confidential === false ? "PROJECT DOCUMENT" : "CONFIDENTIAL - FOR REVIEW ONLY", 105, 288, { align: "center" });
  doc.text(`${pageNumber} / ${totalPages}`, 195, 288, { align: "right" });
}

function addTitle(doc, page, y = 42, width = 180) {
  setText(doc, COLORS.ink, 20, "bold", "times");
  const title = doc.splitTextToSize(clean(page.title, "Untitled Design Page"), width);
  doc.text(title, 15, y);
  let nextY = y + title.length * 8;
  if (clean(page.subtitle)) {
    setText(doc, COLORS.gold, 8, "bold");
    doc.text(clean(page.subtitle).toUpperCase(), 15, nextY + 1);
    nextY += 8;
  }
  return nextY;
}

function addBodyText(doc, text, x, y, width, { size = 9, color = COLORS.muted, maxLines = 18 } = {}) {
  const lines = doc.splitTextToSize(clean(text, "No descriptive note supplied."), width).slice(0, maxLines);
  setText(doc, color, size, "normal");
  doc.setLineHeightFactor(1.45);
  doc.text(lines, x, y);
  return y + lines.length * size * 0.52 * 1.45;
}

function addMetaChips(doc, page, x, y, maxWidth = 180) {
  const chips = [page.space, page.location, ...(page.tags || [])].map((v) => clean(v)).filter(Boolean).slice(0, 5);
  let cursor = x;
  chips.forEach((chip) => {
    const width = Math.min(maxWidth, doc.getTextWidth(chip.toUpperCase()) + 8);
    if (cursor + width > x + maxWidth) return;
    doc.setFillColor(...COLORS.ivory);
    doc.roundedRect(cursor, y, width, 7, 2, 2, "F");
    setText(doc, COLORS.muted, 5.6, "bold");
    doc.text(chip.toUpperCase(), cursor + 4, y + 4.7);
    cursor += width + 3;
  });
}

function addImageFrame(doc, image, x, y, width, height, mode = "cover") {
  doc.setFillColor(235, 232, 222);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, "F");
  const ok = mode === "contain" ? addImageContain(doc, image, x, y, width, height, 3) : addImageCover(doc, image, x, y, width, height);
  if (!ok) {
    setText(doc, COLORS.muted, 8, "normal");
    doc.text("IMAGE PLACEHOLDER", x + width / 2, y + height / 2, { align: "center" });
  }
  doc.setDrawColor(...COLORS.line);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, "S");
}

function renderCover(doc, page, meta, logo) {
  doc.setFillColor(...COLORS.ink);
  doc.rect(0, 0, 210, 297, "F");
  const image = page.images?.[0];
  if (image) {
    addImageCover(doc, image, 0, 0, 210, 297);
    doc.setFillColor(3, 7, 13);
    doc.setGState(new doc.GState({ opacity: 0.66 }));
    doc.rect(0, 0, 210, 297, "F");
    doc.setGState(new doc.GState({ opacity: 1 }));
  }
  addBrandMark(doc, logo);
  doc.setFillColor(...COLORS.gold);
  doc.rect(15, 70, 2, 94, "F");
  setText(doc, COLORS.paleGold, 8, "bold");
  doc.text(clean(meta.documentType, "INTERIOR DESIGN PRESENTATION").toUpperCase(), 25, 79);
  setText(doc, COLORS.white, 31, "bold", "times");
  const title = doc.splitTextToSize(clean(meta.documentTitle || page.title, "Interior Design Book"), 155);
  doc.text(title, 25, 98);
  const titleBottom = 98 + title.length * 12;
  setText(doc, COLORS.white, 11, "normal");
  doc.text(doc.splitTextToSize(clean(meta.projectName, "Project Presentation"), 150), 25, titleBottom + 12);
  setText(doc, COLORS.paleGold, 7, "bold");
  doc.text([clean(meta.clientName, "CLIENT"), clean(meta.projectCode), `REVISION ${clean(meta.revision, "1")}`].filter(Boolean).join("   /   "), 25, titleBottom + 29);
  if (clean(meta.executiveNote)) {
    setText(doc, [207, 212, 220], 7.2, "normal");
    doc.text(doc.splitTextToSize(clean(meta.executiveNote), 155).slice(0, 4), 25, 203);
  }
  if (clean(meta.siteAddress)) {
    setText(doc, COLORS.paleGold, 5.8, "bold");
    doc.text(`SITE  /  ${clean(meta.siteAddress)}`.toUpperCase(), 25, 231, { maxWidth: 160 });
  }
  setText(doc, COLORS.white, 8, "bold");
  doc.text(clean(meta.architectName, "Project Architect"), 25, 245);
  setText(doc, [190, 196, 207], 6.5, "normal");
  const credential = [meta.architectRegistration, meta.architectFirm].map(clean).filter(Boolean).join("  /  ");
  doc.text(credential || "ARCHITECTURAL DESIGN & COORDINATION", 25, 252);
  const contact = [meta.architectEmail, meta.architectPhone].map(clean).filter(Boolean).join("  /  ");
  if (contact) doc.text(contact, 25, 259);
  doc.text([clean(meta.issueDate), clean(meta.purpose)].filter(Boolean).join("  /  "), 25, 266);
  setText(doc, COLORS.paleGold, 5.8, "normal");
  doc.text(meta.confidential === false ? "PROJECT DOCUMENT" : "CONFIDENTIAL - ISSUED FOR REVIEW", 25, 281);
}

function renderHero(doc, page) {
  const y = addTitle(doc, page, 43);
  addImageFrame(doc, page.images?.[0], 15, y + 4, 180, 135, "cover");
  addMetaChips(doc, page, 15, y + 144);
  addBodyText(doc, page.description, 15, y + 160, 180, { maxLines: 10 });
}

function renderSplit(doc, page) {
  const y = addTitle(doc, page, 43);
  addImageFrame(doc, page.images?.[0], 15, y + 5, 100, 185, "cover");
  setText(doc, COLORS.gold, 6.5, "bold");
  doc.text("DESIGN NARRATIVE", 126, y + 10);
  addBodyText(doc, page.description, 126, y + 20, 69, { maxLines: 28 });
  addMetaChips(doc, page, 126, y + 164, 69);
}

function renderGallery(doc, page) {
  const y = addTitle(doc, page, 43);
  const images = (page.images || []).slice(0, 4);
  const slots = [[15, y + 5], [107, y + 5], [15, y + 91], [107, y + 91]];
  slots.forEach(([x, sy], index) => addImageFrame(doc, images[index], x, sy, 88, 80, "cover"));
  addMetaChips(doc, page, 15, y + 177);
  addBodyText(doc, page.description, 15, y + 192, 180, { maxLines: 8 });
}

function renderMaterialBoard(doc, page) {
  const y = addTitle(doc, page, 43);
  const images = (page.images || []).slice(0, 4);
  addImageFrame(doc, images[0], 15, y + 5, 112, 105, "cover");
  addImageFrame(doc, images[1], 131, y + 5, 64, 50, "cover");
  addImageFrame(doc, images[2], 131, y + 60, 64, 50, "cover");
  addImageFrame(doc, images[3], 15, y + 115, 60, 55, "cover");
  doc.setFillColor(...COLORS.ivory);
  doc.roundedRect(79, y + 115, 116, 55, 3, 3, "F");
  setText(doc, COLORS.gold, 6.5, "bold");
  doc.text("PALETTE & MATERIAL DIRECTION", 86, y + 126);
  addBodyText(doc, page.description, 86, y + 137, 102, { size: 8, maxLines: 11 });
  addMetaChips(doc, page, 15, y + 179);
}

function renderDetail(doc, page) {
  const y = addTitle(doc, page, 43);
  addImageFrame(doc, page.images?.[0], 15, y + 5, 180, 120, "contain");
  doc.setFillColor(...COLORS.ivory);
  doc.roundedRect(15, y + 132, 180, 58, 3, 3, "F");
  setText(doc, COLORS.gold, 6.5, "bold");
  doc.text("DETAIL NOTES", 23, y + 145);
  addBodyText(doc, page.description, 23, y + 156, 164, { size: 8.5, maxLines: 12 });
  addMetaChips(doc, page, 15, y + 198);
}

function renderNotes(doc, page) {
  const y = addTitle(doc, page, 43);
  doc.setFillColor(...COLORS.ivory);
  doc.roundedRect(15, y + 5, 180, 190, 4, 4, "F");
  doc.setFillColor(...COLORS.gold);
  doc.rect(15, y + 5, 3, 190, "F");
  setText(doc, COLORS.gold, 6.5, "bold");
  doc.text("DESIGN INTENT / SPECIFICATION NOTES", 27, y + 20);
  addBodyText(doc, page.description, 27, y + 34, 156, { size: 9.5, color: COLORS.ink, maxLines: 34 });
  addMetaChips(doc, page, 27, y + 178, 156);
}

function renderPage(doc, page, meta, logo, pageNumber, totalPages) {
  if (page.type === "cover") {
    renderCover(doc, page, meta, logo);
    return;
  }
  addHeader(doc, logo, meta, page, pageNumber);
  if (page.type === "split") renderSplit(doc, page);
  else if (page.type === "gallery") renderGallery(doc, page);
  else if (page.type === "material_board") renderMaterialBoard(doc, page);
  else if (page.type === "detail_sheet") renderDetail(doc, page);
  else if (page.type === "notes") renderNotes(doc, page);
  else renderHero(doc, page);
  addFooter(doc, meta, pageNumber, totalPages);
}

export async function generateInteriorDesignBookPdf({ meta = {}, pages = [] } = {}) {
  if (!pages.length) throw new Error("Add at least one page to the design book.");
  const [{ jsPDF }, logo] = await Promise.all([import(JSPDF_ESM), fetchAsDataUrl(LOGO_URL)]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  doc.setProperties({
    title: clean(meta.documentTitle, "Interior Design Book"),
    subject: clean(meta.documentType, "Interior design presentation"),
    author: clean(meta.architectName, "Varada Nexus Architect Portal"),
    creator: "Varada Nexus Private Limited - Architect Portal",
    keywords: [clean(meta.projectCode), clean(meta.revision), "interiors", "design"].filter(Boolean).join(", ")
  });
  pages.forEach((page, index) => {
    if (index) doc.addPage("a4", "portrait");
    renderPage(doc, page, meta, logo, index + 1, pages.length);
  });
  const blob = doc.output("blob");
  const fileName = `${safeFileName(meta.projectCode || meta.projectName)}-${safeFileName(meta.documentType || "Design-Book")}-R${safeFileName(meta.revision || "1")}.pdf`;
  return { doc, blob, file: new File([blob], fileName, { type: "application/pdf", lastModified: Date.now() }), fileName };
}

export async function compressDesignBookImage(file, { maxDimension = 1800, quality = 0.84 } = {}) {
  if (!file?.type?.startsWith("image/")) throw new Error(`${file?.name || "File"} is not an image.`);
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Could not process ${file.name}.`));
    element.src = source;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    name: file.name,
    size: file.size,
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL("image/jpeg", quality)
  };
}
