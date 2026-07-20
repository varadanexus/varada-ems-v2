import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import {
  finalizeLegalWordDraft,
  forceSaveLegalWordDocument,
  generateLegalDraft,
  getLegalWordEditorStatus,
  reviseLegalDraft,
  saveLegalDraft,
  startLegalWordEditor
} from "./legal-api.js?v=ems-editor-1";
import { showToast } from "./utils.js";

let currentDraftMode = "ai";
let manualEditorKind = "basic";
let wordEditorInstance = null;
let wordEditorDocumentId = "";
let wordEditorLastSavedAt = "";
let wordEditorScriptUrl = "";
let wordEditorExtractedText = "";
let manualDocxResizeObserver = null;

function buildGeminiPrompt() {
  const value = (key) => document.querySelector(`[data-draft="${key}"]`)?.value || "";
  const checked = (key) => document.querySelector(`[data-draft="${key}"]`)?.checked ? "Yes" : "No";
  return [
    "Act as a legal drafting assistant for an Indian business agreement.",
    "Prepare a structured, high-quality draft for advocate review. Do not state this is final legal advice.",
    `Agreement type: ${value("type") || "Service Agreement"}`,
    `Internal agreement number/reference: ${value("agreementNo") || "To be generated"}`,
    `Jurisdiction: ${value("jurisdiction") || "Rajamahendravaram, Andhra Pradesh, India"}`,
    `Governing law: ${value("governingLaw") || "Indian law"}`,
    "",
    "DRAFTING PURPOSE",
    `Purpose of agreement: ${value("purpose") || "To be filled"}`,
    `Business background/context: ${value("background") || "To be filled"}`,
    `Risk level: ${value("riskLevel") || "Medium"}`,
    "",
    "COMPANY / FIRST PARTY",
    `Company name: ${value("companyName") || "Varada Nexus Private Limited"}`,
    `Company type/registration: ${value("companyRegistration") || "Private Limited Company"}`,
    `Registered office: ${value("companyAddress") || "Rajamahendravaram, Andhra Pradesh, India"}`,
    `GST/PAN/CIN: ${value("companyTax") || "To be filled"}`,
    `Authorized signatory: ${value("companySigner") || "To be filled"}`,
    `Signatory designation: ${value("companySignerRole") || "To be filled"}`,
    `Company email/mobile: ${value("companyContact") || "To be filled"}`,
    "",
    "COUNTERPARTY / SECOND PARTY",
    `Counterparty name: ${value("counterpartyName") || "To be filled"}`,
    `Counterparty type: ${value("counterpartyType") || "Client"}`,
    `Counterparty address: ${value("counterpartyAddress") || "To be filled"}`,
    `Counterparty GST/PAN/CIN: ${value("counterpartyTax") || "To be filled"}`,
    `Counterparty authorized signer: ${value("counterpartySigner") || "To be filled"}`,
    `Counterparty signer designation: ${value("counterpartySignerRole") || "To be filled"}`,
    `Counterparty email/mobile: ${value("counterpartyContact") || "To be filled"}`,
    "",
    "SCOPE AND DELIVERABLES",
    `Scope of work/services/terms: ${value("scope") || "To be filled"}`,
    `Deliverables / obligations of Varada Nexus: ${value("companyObligations") || "To be filled"}`,
    `Deliverables / obligations of counterparty: ${value("counterpartyObligations") || "To be filled"}`,
    `Exclusions / not included: ${value("exclusions") || "To be filled"}`,
    `Dependencies / client inputs required: ${value("dependencies") || "To be filled"}`,
    "",
    "COMMERCIAL TERMS",
    `Agreement value / fees: ${value("amount") || "To be filled"}`,
    `Taxes: ${value("taxes") || "As applicable under law"}`,
    `Payment schedule: ${value("paymentSchedule") || "To be filled"}`,
    `Due date / credit period: ${value("creditPeriod") || "To be filled"}`,
    `Late payment interest / penalties: ${value("latePenalty") || "To be filled"}`,
    `Security deposit / advance / retention: ${value("securityDeposit") || "Not applicable unless stated"}`,
    "",
    "TERM, TERMINATION AND BREACH",
    `Effective date: ${value("effectiveDate") || "Date of acceptance/signing"}`,
    `Agreement duration: ${value("duration") || "To be filled"}`,
    `Renewal terms: ${value("renewal") || "To be filled"}`,
    `Termination notice period: ${value("terminationNotice") || "To be filled"}`,
    `Breach consequences: ${value("breach") || "To be filled"}`,
    "",
    "CONFIDENTIALITY, DATA AND IP",
    `Confidentiality requirements: ${value("confidentiality") || "Standard mutual confidentiality"}`,
    `Data/privacy requirements: ${value("dataPrivacy") || "To be filled"}`,
    `Intellectual property ownership: ${value("ipOwnership") || "To be filled"}`,
    `Non-solicit / non-compete requirements: ${value("nonSolicit") || "Not applicable unless stated"}`,
    "",
    "E-SIGNING AND LEGAL EVIDENCE",
    `Allow electronic acceptance: ${checked("electronicAcceptance")}`,
    `Require Didit KYC/digital signing: ${checked("diditRequired")}`,
    `Require live photo evidence: ${checked("livePhotoRequired")}`,
    `Require GPS/location evidence: ${checked("gpsRequired")}`,
    `Require IP/device evidence: ${checked("ipDeviceRequired")}`,
    `Block VPN/proxy/Tor if configured: ${checked("vpnBlockRequired")}`,
    `Archive evidence to Google Drive: ${checked("driveArchiveRequired")}`,
    `WhatsApp signing link notification: ${checked("whatsappRequired")}`,
    "",
    "DISPUTE AND COURT DETAILS",
    `Dispute resolution method: ${value("disputeMethod") || "Courts / arbitration to be selected"}`,
    `Court jurisdiction / venue: ${value("courtVenue") || "Rajamahendravaram, Andhra Pradesh, India"}`,
    `Arbitration details if any: ${value("arbitration") || "Not applicable unless stated"}`,
    "",
    "SPECIAL CLAUSES",
    `Special clauses requested: ${value("specialClauses") || "None"}`,
    `Clauses to avoid/exclude: ${value("avoidClauses") || "None"}`,
    `Known negotiation points: ${value("negotiationPoints") || "None"}`,
    "",
    "Draft requirements:",
    "Use clear headings, numbered clauses, definitions where useful, signature/acceptance block, electronic evidence clause, privacy consent, and advocate risk checklist.",
    "End with a risk checklist for the advocate."
  ].join("\n\n");
}

function extractEmail(value = "") {
  return String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function extractMobile(value = "") {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return "";
}

function escapeEditorHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToEditorHtml(value = "") {
  return String(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeEditorHtml(paragraph).replace(/\n/g, "<br>") || "<br>"}</p>`)
    .join("");
}

function inlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const content = Array.from(node.childNodes).map(inlineMarkdown).join("");
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return content.trim() ? `**${content}**` : content;
  if (tag === "em" || tag === "i") return content.trim() ? `*${content}*` : content;
  if (tag === "s" || tag === "strike" || tag === "del") return content.trim() ? `~~${content}~~` : content;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    return href ? `[${content || href}](${href})` : content;
  }
  return content;
}

function tableMarkdown(table) {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) => inlineMarkdown(cell).replace(/\|/g, "\\|").trim())
  ).filter((row) => row.length);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || ""));
  const header = normalized[0];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function blockMarkdown(node, listDepth = 0) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (node.classList?.contains("manual-page-break")) return "\n\n--- PAGE BREAK ---\n\n";
  if (/^h[1-3]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inlineMarkdown(node).trim()}\n\n`;
  if (tag === "p" || tag === "div") return `${inlineMarkdown(node).trim()}\n\n`;
  if (tag === "blockquote") return `${inlineMarkdown(node).split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (tag === "hr") return "---\n\n";
  if (tag === "table") return `${tableMarkdown(node)}\n\n`;
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return `${Array.from(node.children).filter((child) => child.tagName?.toLowerCase() === "li").map((item, index) => {
      const nested = Array.from(item.children).filter((child) => ["ul", "ol"].includes(child.tagName?.toLowerCase()));
      const clone = item.cloneNode(true);
      clone.querySelectorAll("ul,ol").forEach((list) => list.remove());
      const line = `${"  ".repeat(listDepth)}${ordered ? `${index + 1}.` : "-"} ${inlineMarkdown(clone).trim()}`;
      return [line, ...nested.map((list) => blockMarkdown(list, listDepth + 1).trimEnd())].join("\n");
    }).join("\n")}\n\n`;
  }
  if (tag === "br") return "\n";
  return `${Array.from(node.childNodes).map((child) => blockMarkdown(child, listDepth)).join("")}`;
}

function manualEditorMarkdown() {
  const editor = document.querySelector("#manualRichEditor");
  if (!editor) return "";
  const body = Array.from(editor.childNodes)
    .map((node) => blockMarkdown(node))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const header = document.querySelector("#manualPageHeader")?.innerText?.trim() || "";
  const footer = document.querySelector("#manualPageFooter")?.innerText?.trim() || "";
  return [header && `Document header: ${header}`, body, footer && `Document footer: ${footer}`]
    .filter(Boolean)
    .join("\n\n");
}

function currentDraftText() {
  if (currentDraftMode !== "manual") return document.querySelector("#draftOutput")?.value?.trim() || "";
  return manualEditorMarkdown();
}

function updateManualEditorStatus() {
  const editor = document.querySelector("#manualRichEditor");
  const status = document.querySelector("#manualEditorStatus");
  if (!editor || !status) return;
  const text = editor.innerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  status.textContent = `${words.toLocaleString("en-IN")} words · ${text.length.toLocaleString("en-IN")} characters`;
}

async function generateDraft() {
  const output = document.querySelector("#draftOutput");
  const promptOutput = document.querySelector("#promptOutput");
  const prompt = buildGeminiPrompt();
  promptOutput.value = prompt;
  output.value = "Preparing draft request...";
  try {
    const data = await generateLegalDraft({ prompt, source: "legal-drafting" });
    output.value = data?.draft || prompt;
    showToast("Draft generated for review.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    output.value = "";
    showToast(error?.message || "Gemini not configured. Prompt prepared separately.", TOAST_TYPES.WARNING);
  }
}

function draftSavePayload() {
  const value = (key) => document.querySelector(`[data-draft="${key}"]`)?.value || "";
  const manualValue = (key) => document.querySelector(`[data-manual="${key}"]`)?.value || "";
  const draftText = currentDraftText();
  const isManual = currentDraftMode === "manual";
  const agreementType = isManual ? manualValue("type") : value("type");
  const partyType = isManual ? manualValue("counterpartyType") : value("counterpartyType");
  const partyName = isManual ? manualValue("counterpartyName") : value("counterpartyName");
  const signerName = isManual ? manualValue("counterpartySigner") : value("counterpartySigner");
  const counterpartyContact = isManual ? manualValue("counterpartyContact") : value("counterpartyContact");
  const title = isManual
    ? manualValue("title") || agreementType || "Manual Legal Draft"
    : value("purpose") || agreementType || "Legal Draft";
  return {
    agreementNo: isManual ? manualValue("agreementNo") : value("agreementNo"),
    title,
    agreementTitle: title,
    agreementType,
    partyType,
    partyName,
    counterpartyName: partyName,
    signerName,
    signerMobile: extractMobile(counterpartyContact),
    signerEmail: extractEmail(counterpartyContact),
    riskLevel: isManual ? manualValue("riskLevel") : value("riskLevel"),
    draftText,
    draftSource: isManual ? "manual" : "gemini_ai"
  };
}

function setWordEditorStatus(message, tone = "") {
  const status = document.querySelector("#wordEditorStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function loadOnlyOfficeScript(documentServerUrl) {
  const scriptUrl = `${String(documentServerUrl).replace(/\/+$/, "")}/web-apps/apps/api/documents/api.js`;
  if (window.DocsAPI && wordEditorScriptUrl === scriptUrl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-onlyoffice-api="${CSS.escape(scriptUrl)}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("The Word editor service could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.onlyofficeApi = scriptUrl;
    script.addEventListener("load", () => {
      wordEditorScriptUrl = scriptUrl;
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("The Word editor service could not be loaded.")), { once: true });
    document.head.appendChild(script);
  });
}

function setManualEditorKind(kind) {
  manualEditorKind = "basic";
  const isManual = currentDraftMode === "manual";
  const wordShell = document.querySelector("#wordEditorShell");
  const basicShell = document.querySelector("#manualEditorShell");
  const wordButton = document.querySelector("#wordEditorModeBtn");
  const basicButton = document.querySelector("#basicEditorModeBtn");
  if (wordShell) wordShell.hidden = !isManual || manualEditorKind !== "word";
  if (basicShell) basicShell.hidden = !isManual || manualEditorKind !== "basic";
  wordButton?.classList.toggle("btn-ghost", manualEditorKind !== "word");
  basicButton?.classList.toggle("btn-ghost", manualEditorKind !== "basic");
  wordButton?.setAttribute("aria-pressed", String(manualEditorKind === "word"));
  basicButton?.setAttribute("aria-pressed", String(manualEditorKind === "basic"));
  const saveButton = document.querySelector("#saveDraftBtn");
  if (saveButton && isManual) saveButton.textContent = "Save Manual Draft to EMS";
  const description = document.querySelector("#draftEditorDescription");
  if (description && isManual) {
    description.textContent = "Create and format the agreement in the secure EMS editor. Manual content is saved to EMS and is never sent to Gemini.";
  }
}

async function launchWordEditor() {
  const button = document.querySelector("#launchWordEditorBtn");
  if (!button) return;
  button.disabled = true;
  button.textContent = "Opening Word editor...";
  setWordEditorStatus("Creating a secure document session…");
  try {
    const fallbackText = manualEditorMarkdown() || document.querySelector("#draftOutput")?.value?.trim() || "";
    const session = await startLegalWordEditor({
      ...draftSavePayload(),
      draftText: fallbackText,
      draftSource: "manual"
    });
    await loadOnlyOfficeScript(session.documentServerUrl);
    if (!window.DocsAPI?.DocEditor) throw new Error("The Word editor API did not initialize.");
    wordEditorInstance?.destroyEditor?.();
    wordEditorDocumentId = session.documentId;
    wordEditorLastSavedAt = session.updatedAt || "";
    wordEditorExtractedText = "";
    const config = {
      ...session.config,
      events: {
        onAppReady: () => setWordEditorStatus("Word editor ready · autosave and spellcheck enabled", "success"),
        onDocumentStateChange: (event) => setWordEditorStatus(event?.data ? "Editing · changes not yet stored in EMS" : "Document saved by editor", event?.data ? "warning" : "success"),
        onError: (event) => setWordEditorStatus(`Word editor error ${event?.data?.errorCode || ""}`.trim(), "error")
      }
    };
    wordEditorInstance = new window.DocsAPI.DocEditor("onlyofficeEditor", config);
    document.querySelector("#wordEditorLaunchPanel").hidden = true;
    document.querySelector("#wordEditorFrame").hidden = false;
    setWordEditorStatus("Loading the Word workspace…");
  } catch (error) {
    setWordEditorStatus(error?.message || "Word editor could not be opened.", "error");
    showToast(error?.message || "Word editor could not be opened. The basic editor remains available.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = wordEditorDocumentId ? "Start Another Word Draft" : "Open Word-style Editor";
  }
}

async function waitForWordSave(previousSavedAt) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    const state = await getLegalWordEditorStatus(wordEditorDocumentId);
    if (state.status === "error") throw new Error("ONLYOFFICE reported a document save error.");
    if (state.lastSavedAt && state.lastSavedAt !== previousSavedAt) return state;
  }
  throw new Error("The editor is still saving. Click Save Word Draft to EMS again in a moment.");
}

async function saveWordDraft(button) {
  if (!wordEditorDocumentId) {
    showToast("Open the Word-style editor and prepare the document first.", TOAST_TYPES.ERROR);
    return;
  }
  button.disabled = true;
  button.textContent = "Saving Word document...";
  setWordEditorStatus("Requesting the latest document from the editor…");
  try {
    const before = await getLegalWordEditorStatus(wordEditorDocumentId);
    const forceSave = await forceSaveLegalWordDocument(wordEditorDocumentId);
    if (forceSave.pending) await waitForWordSave(before.lastSavedAt || wordEditorLastSavedAt);
    button.textContent = "Creating EMS legal record...";
    const result = await finalizeLegalWordDraft({
      ...draftSavePayload(),
      documentId: wordEditorDocumentId,
      draftSource: "imported"
    });
    wordEditorExtractedText = result.draftText || "";
    wordEditorLastSavedAt = new Date().toISOString();
    setWordEditorStatus(`Saved to EMS as ${result.agreement?.agreement_no || "legal agreement"}`, "success");
    showToast(`Word draft saved as ${result.agreement?.agreement_no || "agreement"}.`, TOAST_TYPES.SUCCESS);
  } catch (error) {
    setWordEditorStatus(error?.message || "Word draft save failed.", "error");
    showToast(error?.message || "Word draft save failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = "Save Word Draft to EMS";
  }
}

async function saveDraft() {
  const button = document.querySelector("#saveDraftBtn");
  const draftText = currentDraftText();
  if (!draftText) {
    showToast(currentDraftMode === "manual" ? "Write or paste a draft before saving." : "Generate or type a draft before saving.", TOAST_TYPES.ERROR);
    return;
  }
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const result = await saveLegalDraft(draftSavePayload());
    showToast(`Draft saved as ${result.agreement?.agreement_no || "agreement"}.`, TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Draft save failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = currentDraftMode === "manual" ? "Save Manual Draft to EMS" : "Save Draft";
  }
}

function setDraftMode(mode) {
  currentDraftMode = mode === "manual" ? "manual" : "ai";
  const isManual = currentDraftMode === "manual";
  const aiPanel = document.querySelector("#aiDraftPanel");
  const manualPanel = document.querySelector("#manualDraftPanel");
  const aiToolsPanel = document.querySelector("#aiToolsPanel");
  const generateButton = document.querySelector("#generateDraftBtn");
  const saveButton = document.querySelector("#saveDraftBtn");
  const editorTitle = document.querySelector("#draftEditorTitle");
  const editorDescription = document.querySelector("#draftEditorDescription");
  const output = document.querySelector("#draftOutput");
  const manualEditor = document.querySelector("#manualRichEditor");
  const documentEditorChoice = document.querySelector("#documentEditorChoice");
  const aiModeButton = document.querySelector("#aiDraftModeBtn");
  const manualModeButton = document.querySelector("#manualDraftModeBtn");

  aiPanel.hidden = isManual;
  manualPanel.hidden = !isManual;
  aiToolsPanel.hidden = isManual;
  generateButton.hidden = isManual;
  output.hidden = isManual;
  documentEditorChoice.hidden = !isManual;
  document.querySelector(".legal-draft-layout")?.classList.toggle("is-manual-mode", isManual);
  saveButton.textContent = isManual ? "Save Manual Draft to EMS" : "Save Draft";
  editorTitle.textContent = isManual ? "Professional Document Editor" : "Draft Editor";
  editorDescription.textContent = isManual
    ? "Write, format, print and save the agreement in the secure EMS document editor. Manual mode does not contact Gemini."
    : "The generated or edited draft appears here. The AI prompt is kept separately below.";
  output.placeholder = isManual
    ? "Write or paste your legal agreement here. No AI request is sent in Manual Draft mode."
    : "Generated draft will appear here. You can edit it before saving.";
  aiModeButton.classList.toggle("btn-ghost", isManual);
  manualModeButton.classList.toggle("btn-ghost", !isManual);
  aiModeButton.setAttribute("aria-pressed", String(!isManual));
  manualModeButton.setAttribute("aria-pressed", String(isManual));
  if (isManual && manualEditor && !manualEditor.innerText.trim() && output.value.trim()) {
    manualEditor.innerHTML = plainTextToEditorHtml(output.value);
  }
  setManualEditorKind(manualEditorKind);
  updateManualEditorStatus();
}

function runManualEditorCommand(command, value = null) {
  const editor = document.querySelector("#manualRichEditor");
  editor?.focus();
  document.execCommand(command, false, value);
  updateManualEditorStatus();
}

function insertManualTable() {
  const rowInput = window.prompt("Number of table rows (including header):", "3");
  if (rowInput === null) return;
  const columnInput = window.prompt("Number of table columns:", "3");
  if (columnInput === null) return;
  const rows = Math.min(20, Math.max(2, Number.parseInt(rowInput, 10) || 2));
  const columns = Math.min(10, Math.max(1, Number.parseInt(columnInput, 10) || 1));
  const cells = (tag, rowNumber) => Array.from({ length: columns }, (_, index) => `<${tag}>${rowNumber === 0 ? `Heading ${index + 1}` : "&nbsp;"}</${tag}>`).join("");
  const html = `<table><thead><tr>${cells("th", 0)}</tr></thead><tbody>${Array.from({ length: rows - 1 }, (_, index) => `<tr>${cells("td", index + 1)}</tr>`).join("")}</tbody></table><p><br></p>`;
  runManualEditorCommand("insertHTML", html);
}

function printManualDraft() {
  const editor = document.querySelector("#manualRichEditor");
  if (!editor?.innerText.trim()) {
    showToast("Write or paste a draft before printing.", TOAST_TYPES.ERROR);
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Allow pop-ups to open the print preview.", TOAST_TYPES.WARNING);
    return;
  }
  const header = document.querySelector("#manualPageHeader")?.innerHTML || "";
  const footer = document.querySelector("#manualPageFooter")?.innerHTML || "";
  const importedStyles = document.querySelector("#manualImportedDocxStyles")?.innerHTML || "";
  printWindow.document.write(`<!doctype html><html><head><title>Legal Draft</title><style>
    @page{size:A4;margin:22mm 20mm}body{margin:0;color:#111;font-family:Cambria,Georgia,serif;font-size:11.5pt;line-height:1.55}header,footer{color:#666;font:9pt Arial,sans-serif}header{border-bottom:1px solid #bbb;padding-bottom:6pt;margin-bottom:14pt}footer{border-top:1px solid #bbb;padding-top:6pt;margin-top:14pt}h1,h2,h3{page-break-after:avoid}h1{text-align:center;font-size:20pt}h2{font-size:15pt}h3{font-size:12.5pt}p{margin:0 0 9pt}table{max-width:100%;border-collapse:collapse;margin:12pt 0;table-layout:fixed}th,td{box-sizing:border-box;max-width:100%;border:1px solid #777;padding:6pt;text-align:left;overflow-wrap:anywhere}.manual-page-break{break-after:page;height:0;border:0}ul,ol{padding-left:24pt}a{color:inherit}
  </style>${importedStyles}</head><body><header>${header}</header>${manualEditorHtmlForOutput(editor)}<footer>${footer}</footer></body></html>`);
  printWindow.document.close();
  printWindow.opener = null;
  printWindow.focus();
  printWindow.print();
}

function insertManualPageBreak() {
  runManualEditorCommand("insertHTML", '<div class="manual-page-break" contenteditable="false"><span>Page break</span></div><p><br></p>');
}

function findAndReplaceManualText() {
  const editor = document.querySelector("#manualRichEditor");
  const findText = window.prompt("Find text:", "");
  if (!editor || !findText) return;
  const replacement = window.prompt(`Replace “${findText}” with:`, "");
  if (replacement === null) return;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let replacements = 0;
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!node.nodeValue.includes(findText)) return;
    replacements += node.nodeValue.split(findText).length - 1;
    node.nodeValue = node.nodeValue.split(findText).join(replacement);
  });
  updateManualEditorStatus();
  showToast(replacements ? `${replacements} replacement${replacements === 1 ? "" : "s"} made.` : "Text not found.", replacements ? TOAST_TYPES.SUCCESS : TOAST_TYPES.WARNING);
}

function downloadManualWordDocument() {
  const editor = document.querySelector("#manualRichEditor");
  if (!editor?.innerText.trim()) {
    showToast("Write or paste a draft before downloading.", TOAST_TYPES.ERROR);
    return;
  }
  const header = document.querySelector("#manualPageHeader")?.innerHTML || "";
  const footer = document.querySelector("#manualPageFooter")?.innerHTML || "";
  const importedStyles = document.querySelector("#manualImportedDocxStyles")?.innerHTML || "";
  const title = document.querySelector('[data-manual="title"]')?.value?.trim() || "Legal Draft";
  const fileName = `${title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "legal-draft"}.doc`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeEditorHtml(title)}</title><style>@page{size:A4;margin:22mm 20mm}body{font-family:Cambria,Georgia,serif;font-size:11.5pt;line-height:1.55;color:#111}header,footer{color:#666;font:9pt Arial,sans-serif}header{border-bottom:1px solid #bbb;margin-bottom:14pt}footer{border-top:1px solid #bbb;margin-top:14pt}table{max-width:100%;width:100%;border-collapse:collapse;table-layout:fixed}th,td{box-sizing:border-box;max-width:100%;border:1px solid #777;padding:6pt;overflow-wrap:anywhere}.manual-page-break{page-break-after:always}</style>${importedStyles}</head><body><header>${header}</header>${manualEditorHtmlForOutput(editor)}<footer>${footer}</footer></body></html>`;
  const url = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Word-compatible document downloaded.", TOAST_TYPES.SUCCESS);
}

function sanitizeImportedWordHtml(value = "") {
  const template = document.createElement("template");
  template.innerHTML = String(value);
  template.content.querySelectorAll("script,style,iframe,object,embed,form,input,button,meta,link,base").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const content = String(attribute.value || "").trim();
      if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attribute.name);
      if ((name === "href" || name === "src") && /^(?:javascript|vbscript):/i.test(content)) node.removeAttribute(attribute.name);
      if (name === "style" && /(?:url\s*\(|expression\s*\(|javascript:)/i.test(content)) node.removeAttribute("style");
    });
  });
  return template.innerHTML;
}

function manualEditorHtmlForOutput(editor) {
  const clone = editor.cloneNode(true);
  clone.querySelectorAll("section.ems-docx").forEach((page) => {
    page.style.removeProperty("zoom");
    page.removeAttribute("data-ems-fit-scale");
  });
  return clone.innerHTML;
}

function fitImportedDocxPages(editor) {
  const wrapper = editor.querySelector(".ems-docx-wrapper");
  if (!wrapper) return;
  const availableWidth = Math.max(280, wrapper.clientWidth - 36);
  wrapper.querySelectorAll(":scope > section.ems-docx").forEach((page) => {
    page.style.removeProperty("zoom");
    const naturalWidth = page.getBoundingClientRect().width;
    const scale = naturalWidth > availableWidth ? availableWidth / naturalWidth : 1;
    page.style.setProperty("zoom", String(Math.max(0.35, Math.min(1, scale))));
    page.dataset.emsFitScale = scale.toFixed(4);
  });
}

async function importManualWordFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (!/\.docx$/i.test(file.name)) throw new Error("Only modern Word .docx files are supported. Open a legacy .doc file in Word and save it as .docx first.");
    if (file.size > 25 * 1024 * 1024) throw new Error("The Word file must be 25 MB or smaller.");
    if (!window.docx?.renderAsync && !window.mammoth?.convertToHtml) throw new Error("The Word importer did not load. Refresh the page and try again.");
    const editor = document.querySelector("#manualRichEditor");
    if (!editor) throw new Error("The EMS document editor is unavailable.");
    if (editor.innerText.trim() && !window.confirm("Replace the current editor content with this Word document?")) return;
    const arrayBuffer = await file.arrayBuffer();
    let safeHtml = "";
    let warnings = 0;
    if (window.docx?.renderAsync) {
      const renderTarget = document.createElement("div");
      const styleTarget = document.querySelector("#manualImportedDocxStyles") || document.createElement("div");
      styleTarget.innerHTML = "";
      await window.docx.renderAsync(arrayBuffer, renderTarget, styleTarget, {
        className: "ems-docx",
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderComments: false,
        renderAltChunks: true,
        useBase64URL: true,
        experimental: true
      });
      safeHtml = sanitizeImportedWordHtml(renderTarget.innerHTML);
      document.querySelector("#manualDocumentPage")?.classList.add("is-imported-docx");
    } else {
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      safeHtml = sanitizeImportedWordHtml(result.value || "");
      warnings = Array.isArray(result.messages) ? result.messages.length : 0;
      document.querySelector("#manualDocumentPage")?.classList.remove("is-imported-docx");
    }
    if (!safeHtml.trim()) throw new Error("No editable text could be extracted from this Word file.");
    editor.innerHTML = safeHtml;
    if (document.querySelector("#manualDocumentPage")?.classList.contains("is-imported-docx")) {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      fitImportedDocxPages(editor);
      manualDocxResizeObserver?.disconnect();
      manualDocxResizeObserver = new ResizeObserver(() => fitImportedDocxPages(editor));
      manualDocxResizeObserver.observe(document.querySelector("#manualEditorShell"));
    }
    const titleInput = document.querySelector('[data-manual="title"]');
    if (titleInput && !titleInput.value.trim()) titleInput.value = file.name.replace(/\.docx$/i, "");
    editor.focus();
    updateManualEditorStatus();
    showToast(warnings
      ? `Word document imported with ${warnings} formatting notice${warnings === 1 ? "" : "s"}. Review it before saving.`
      : "Word document imported. Review it before saving to EMS.", warnings ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "The Word document could not be imported.", TOAST_TYPES.ERROR);
  } finally {
    input.value = "";
  }
}

function bindManualRichEditor() {
  const editor = document.querySelector("#manualRichEditor");
  const toolbar = document.querySelector("#manualEditorToolbar");
  if (!editor || !toolbar) return;
  toolbar.querySelectorAll("button[data-command]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const command = button.dataset.command;
      if (command === "createLink") {
        const url = window.prompt("Enter the link URL:", "https://");
        if (url) runManualEditorCommand("createLink", url);
        return;
      }
      runManualEditorCommand(command);
    });
  });
  toolbar.querySelectorAll("select[data-command]").forEach((select) => {
    select.addEventListener("change", () => {
      if (select.value) runManualEditorCommand(select.dataset.command, select.value);
      select.selectedIndex = 0;
    });
  });
  toolbar.querySelectorAll('input[type="color"][data-command]').forEach((input) => {
    input.addEventListener("input", () => runManualEditorCommand(input.dataset.command, input.value));
  });
  document.querySelector("#manualInsertTableBtn")?.addEventListener("click", insertManualTable);
  document.querySelector("#manualPageBreakBtn")?.addEventListener("click", insertManualPageBreak);
  document.querySelector("#manualFindReplaceBtn")?.addEventListener("click", findAndReplaceManualText);
  document.querySelector("#manualDownloadWordBtn")?.addEventListener("click", downloadManualWordDocument);
  document.querySelector("#manualPrintBtn")?.addEventListener("click", printManualDraft);
  document.querySelector("#manualUploadWordBtn")?.addEventListener("click", () => document.querySelector("#manualWordFileInput")?.click());
  document.querySelector("#manualWordFileInput")?.addEventListener("change", importManualWordFile);
  editor.addEventListener("input", updateManualEditorStatus);
  editor.addEventListener("paste", () => window.setTimeout(updateManualEditorStatus, 0));
  document.querySelector("#manualPageHeader")?.addEventListener("input", updateManualEditorStatus);
  document.querySelector("#manualPageFooter")?.addEventListener("input", updateManualEditorStatus);
  updateManualEditorStatus();
}

function copyIntakeToManualDetails() {
  const aiValue = (key) => document.querySelector(`[data-draft="${key}"]`)?.value || "";
  const setManualValue = (key, value) => {
    const field = document.querySelector(`[data-manual="${key}"]`);
    if (field && value) field.value = value;
  };
  setManualValue("agreementNo", aiValue("agreementNo"));
  setManualValue("title", aiValue("purpose") || aiValue("type"));
  setManualValue("type", aiValue("type"));
  setManualValue("riskLevel", aiValue("riskLevel"));
  setManualValue("counterpartyType", aiValue("counterpartyType"));
  setManualValue("counterpartyName", aiValue("counterpartyName"));
  setManualValue("counterpartySigner", aiValue("counterpartySigner"));
  setManualValue("counterpartyContact", aiValue("counterpartyContact"));
  showToast("Intake details copied to the manual draft.", TOAST_TYPES.SUCCESS);
}

function startBlankManualDraft() {
  const output = document.querySelector("#draftOutput");
  const editor = document.querySelector("#manualRichEditor");
  if ((editor.innerText.trim() || output.value.trim()) && !window.confirm("Clear the current editor and start a new blank manual draft?")) return;
  output.value = "";
  editor.innerHTML = "<p><br></p>";
  document.querySelector("#manualDocumentPage")?.classList.remove("is-imported-docx");
  manualDocxResizeObserver?.disconnect();
  manualDocxResizeObserver = null;
  const importedStyles = document.querySelector("#manualImportedDocxStyles");
  if (importedStyles) importedStyles.innerHTML = "";
  const header = document.querySelector("#manualPageHeader");
  const footer = document.querySelector("#manualPageFooter");
  if (header) header.innerHTML = "";
  if (footer) footer.innerHTML = "";
  document.querySelector("#revisionPrompt").value = "";
  document.querySelector("#promptOutput").value = "";
  editor.focus();
  updateManualEditorStatus();
  showToast("Blank manual draft ready.", TOAST_TYPES.SUCCESS);
}

async function reviseDraft() {
  const button = document.querySelector("#reviseDraftBtn");
  const instruction = document.querySelector("#revisionPrompt")?.value?.trim() || "";
  const output = document.querySelector("#draftOutput");
  const draftText = output?.value?.trim() || "";
  if (!draftText) {
    showToast("Generate or paste a draft before asking AI to revise.", TOAST_TYPES.ERROR);
    return;
  }
  if (!instruction) {
    showToast("Enter the change you want AI to make.", TOAST_TYPES.ERROR);
    return;
  }
  button.disabled = true;
  button.textContent = "Revising...";
  try {
    const data = await reviseLegalDraft({ draftText, instruction, source: "legal-drafting-revision" });
    output.value = data?.draft || draftText;
    showToast("Draft revised.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Draft revision failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = "Apply AI Changes";
  }
}

function renderPage() {
  renderModuleContent(`
    <style>
      .legal-draft-layout{display:grid;grid-template-columns:minmax(360px,1.05fr) minmax(0,.95fr);gap:1rem;align-items:start}
      .legal-draft-layout.is-manual-mode{grid-template-columns:minmax(280px,.38fr) minmax(0,1.62fr)}
      .draft-mode-picker{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;padding:.85rem 1rem;border:1px solid rgba(230,200,126,.2);border-radius:14px;background:linear-gradient(135deg,rgba(230,200,126,.08),rgba(7,8,13,.98))}
      .draft-mode-picker h3,.draft-mode-picker p{margin:0}
      .draft-mode-actions{display:flex;gap:.5rem;flex-wrap:wrap}
      .legal-draft-form{display:grid;gap:.85rem}
      .draft-section{border:1px solid rgba(230,200,126,.15);border-radius:14px;background:linear-gradient(145deg,rgba(230,200,126,.035),#07080d 65%);padding:.85rem;display:grid;gap:.7rem}
      .draft-section h4{margin:0;color:#f7f4ec}
      .draft-section p{margin:0}
      .draft-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
      .draft-grid .full{grid-column:1/-1}
      .draft-field{display:grid;gap:.28rem}
      .draft-field label{font-weight:800;color:#c9c5b8;font-size:.84rem}
      .draft-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}
      .draft-checks label{display:grid;grid-template-columns:20px minmax(0,1fr);gap:.45rem;align-items:start;color:#c9c5b8;font-weight:700}
      .legal-draft-form input,.legal-draft-form select,.legal-draft-form textarea,.legal-output{width:100%;min-width:0}
      .legal-output{min-height:520px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
      .document-editor-choice{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;margin:.75rem 0;padding:.65rem .75rem;border:1px solid rgba(230,200,126,.2);border-radius:12px;background:rgba(230,200,126,.045)}
      .document-editor-choice p{margin:0}
      .document-editor-choice-actions{display:flex;gap:.45rem;flex-wrap:wrap}
      .word-editor-shell{margin-top:.75rem;border:1px solid rgba(230,200,126,.32);border-radius:14px;overflow:hidden;background:#101114;box-shadow:0 18px 50px rgba(0,0,0,.3)}
      .word-editor-launch{min-height:420px;display:grid;place-items:center;padding:2rem;background:radial-gradient(circle at 50% 10%,rgba(43,87,154,.2),transparent 48%),#111318;text-align:center}
      .word-editor-launch-content{max-width:680px;display:grid;justify-items:center;gap:.75rem}
      .word-editor-badge{display:inline-flex;align-items:center;gap:.45rem;padding:.35rem .65rem;border:1px solid rgba(90,140,210,.45);border-radius:999px;color:#bdd7ff;background:rgba(43,87,154,.18);font-weight:800;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase}
      .word-editor-launch h4{margin:0;font-size:1.45rem}
      .word-editor-launch p{margin:0;color:#aaa79d;line-height:1.6}
      .word-editor-features{display:flex;justify-content:center;gap:.4rem;flex-wrap:wrap}
      .word-editor-features span{padding:.28rem .55rem;border:1px solid rgba(255,255,255,.11);border-radius:999px;color:#cbc8bd;font-size:.76rem}
      .word-editor-frame{height:min(78vh,920px);min-height:650px;background:#fff}
      #onlyofficeEditor{width:100%;height:100%}
      .word-editor-footer{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.55rem .75rem;background:#17191e;border-top:1px solid rgba(230,200,126,.18);color:#a9a69d;font-size:.78rem}
      #wordEditorStatus[data-tone="success"]{color:#77d89a}#wordEditorStatus[data-tone="warning"]{color:#f0cd71}#wordEditorStatus[data-tone="error"]{color:#ff918a}
      .manual-editor-shell{margin-top:.75rem;border:1px solid rgba(230,200,126,.28);border-radius:14px;overflow:hidden;background:#202124;box-shadow:0 18px 50px rgba(0,0,0,.28)}
      .manual-editor-toolbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;padding:.55rem;background:linear-gradient(180deg,#f7f7f7,#e9e9e9);border-bottom:1px solid #c9c9c9;color:#202124}
      .manual-editor-toolbar .toolbar-group{display:flex;align-items:center;gap:.2rem;padding-right:.35rem;margin-right:.1rem;border-right:1px solid #c7c7c7}
      .manual-editor-toolbar .toolbar-group:last-child{border-right:0}
      .manual-editor-toolbar button,.manual-editor-toolbar select{height:32px;border:1px solid transparent;border-radius:5px;background:transparent;color:#202124;font:600 .78rem/1 Arial,sans-serif}
      .manual-editor-toolbar button{min-width:32px;padding:0 .45rem;cursor:pointer}
      .manual-editor-toolbar button:hover,.manual-editor-toolbar button:focus-visible,.manual-editor-toolbar select:hover{background:#dde8f7;border-color:#9cb9df;outline:0}
      .manual-editor-toolbar select{background:#fff;border-color:#c7c7c7;padding:0 .35rem;max-width:145px}
      .manual-editor-toolbar .toolbar-color{position:relative;display:grid;place-items:center;min-width:32px;height:32px;border-radius:5px;cursor:pointer;font:700 .86rem Arial,sans-serif}
      .manual-editor-toolbar .toolbar-color:hover{background:#dde8f7}
      .manual-editor-toolbar .toolbar-color input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
      .manual-editor-workspace{max-height:760px;overflow:auto;padding:28px;background:#2d2f32}
      .manual-document-page{box-sizing:border-box;width:min(210mm,100%);min-height:297mm;margin:0 auto;padding:12mm 22mm 14mm;background:#fff;color:#151515;box-shadow:0 4px 24px rgba(0,0,0,.45);font-family:Cambria,Georgia,serif;font-size:11.5pt;line-height:1.55;caret-color:#111}
      .manual-page-header,.manual-page-footer{min-height:12mm;color:#666;font:9pt/1.4 Arial,sans-serif;outline:none}
      .manual-page-header{padding:0 0 4mm;border-bottom:1px solid #bbb;margin-bottom:10mm}
      .manual-page-footer{padding:4mm 0 0;border-top:1px solid #bbb;margin-top:10mm;text-align:center}
      .manual-page-header:empty::before,.manual-page-footer:empty::before,.manual-document-body:empty::before{content:attr(data-placeholder);color:#999;pointer-events:none}
      .manual-document-body{min-height:225mm;outline:none}
      .manual-document-body p{margin:0 0 9pt}
      .manual-document-body h1{margin:0 0 18pt;text-align:center;font-size:20pt;line-height:1.25}
      .manual-document-body h2{margin:16pt 0 8pt;font-size:15pt;line-height:1.3}
      .manual-document-body h3{margin:13pt 0 6pt;font-size:12.5pt;line-height:1.3}
      .manual-document-body blockquote{margin:10pt 0;padding:8pt 12pt;border-left:3px solid #b59140;background:#faf6ea}
      .manual-document-body table{width:100%;border-collapse:collapse;margin:12pt 0;table-layout:auto}
      .manual-document-body th,.manual-document-body td{position:relative;min-width:42px;border:1px solid #777;padding:6pt;vertical-align:top;resize:horizontal;overflow:auto}
      .manual-document-body img{display:block;max-width:100%;height:auto;margin:10pt auto}
      .manual-document-page th{background:#eee;font-weight:700}
      .manual-document-page.is-imported-docx{width:100%;max-width:none;min-height:0;padding:0;background:transparent;box-shadow:none}
      .manual-document-page.is-imported-docx>.manual-page-header,.manual-document-page.is-imported-docx>.manual-page-footer{display:none}
      .manual-document-page.is-imported-docx>.manual-document-body{min-height:0}
      .manual-document-body .ems-docx-wrapper{box-sizing:border-box;max-width:100%;padding:18px!important;background:#2d2f32!important;overflow-x:hidden}
      .manual-document-body .ems-docx-wrapper>section.ems-docx{box-sizing:border-box;max-width:none!important;margin:0 auto 22px!important;overflow:visible;box-shadow:0 4px 18px rgba(0,0,0,.36);transform-origin:top center}
      .manual-document-body .ems-docx-wrapper table{box-sizing:border-box}
      .manual-document-body .ems-docx-wrapper td,.manual-document-body .ems-docx-wrapper th{box-sizing:border-box;resize:none}
      .manual-page-break{height:18px;margin:14pt -22mm;border-top:2px dashed #9aa0a6;border-bottom:2px dashed #9aa0a6;background:#eef1f4;color:#666;text-align:center;font:8pt/14px Arial,sans-serif;break-after:page;page-break-after:always;user-select:none}
      .manual-editor-status{display:flex;justify-content:space-between;gap:.75rem;padding:.42rem .75rem;background:#f3f3f3;border-top:1px solid #c9c9c9;color:#555;font:600 .72rem Arial,sans-serif}
      .prompt-output{min-height:180px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem}
      .revision-box{display:grid;gap:.6rem;margin-top:1rem}
      .legal-checklist{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}
      .legal-checklist li{border:1px solid rgba(230,200,126,.14);border-radius:12px;padding:.65rem;background:#07080d;color:#c9c5b8}
      [hidden]{display:none!important}
      @media (max-width: 1180px){.legal-draft-layout.is-manual-mode{grid-template-columns:1fr}}
      @media (max-width: 980px){.legal-draft-layout,.draft-grid,.draft-checks{grid-template-columns:1fr}.draft-mode-picker{align-items:flex-start;flex-direction:column}.manual-editor-workspace{padding:12px}.manual-document-page:not(.is-imported-docx){min-height:70vh;padding:18mm 12mm}.manual-document-body .ems-docx-wrapper{padding:8px!important}.word-editor-frame{height:76vh;min-height:560px}}
    </style>
    <section class="draft-mode-picker">
      <div>
        <h3>Choose Drafting Method</h3>
        <p class="muted">Use guided AI drafting or write and save the agreement entirely yourself.</p>
      </div>
      <div class="draft-mode-actions" role="group" aria-label="Drafting method">
        <button class="btn" id="aiDraftModeBtn" type="button" aria-pressed="true">AI-Assisted Draft</button>
        <button class="btn btn-ghost" id="manualDraftModeBtn" type="button" aria-pressed="false">Manual Draft</button>
      </div>
    </section>
    <div class="legal-draft-layout">
      <section class="card">
        <div id="aiDraftPanel">
          <h3>Legal Drafting Intake</h3>
          <p class="muted">Answer the questions below. Gemini will prepare a structured draft for advocate review.</p>
          <div class="legal-draft-form">
          <section class="draft-section">
            <h4>1. Agreement Basics</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>What type of agreement is this?</label><select data-draft="type"><option>Service Agreement</option><option>Terms and Conditions</option><option>Vendor Agreement</option><option>Customer Agreement</option><option>NDA</option><option>Payment Undertaking</option><option>Settlement Agreement</option><option>Employment / Consultant Agreement</option><option>Custom Agreement</option></select></div>
              <div class="draft-field"><label>Internal agreement number/reference</label><input data-draft="agreementNo" placeholder="AGR-2026-0001" /></div>
              <div class="draft-field"><label>Jurisdiction</label><input data-draft="jurisdiction" value="Rajamahendravaram, Andhra Pradesh, India" /></div>
              <div class="draft-field"><label>Governing law</label><input data-draft="governingLaw" value="Indian law" /></div>
              <div class="draft-field"><label>Risk level</label><select data-draft="riskLevel"><option>Medium</option><option>Low</option><option>High</option><option>Critical</option></select></div>
              <div class="draft-field full"><label>Why is this agreement being created?</label><textarea data-draft="purpose" rows="3" placeholder="Explain the business purpose of this agreement"></textarea></div>
              <div class="draft-field full"><label>What is the background/context?</label><textarea data-draft="background" rows="3" placeholder="Any previous discussion, project, transaction, or relationship context"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>2. Varada Nexus / First Party Details</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Company name</label><input data-draft="companyName" value="Varada Nexus Private Limited" /></div>
              <div class="draft-field"><label>Registration/type</label><input data-draft="companyRegistration" value="Private Limited Company" /></div>
              <div class="draft-field full"><label>Registered office/address</label><textarea data-draft="companyAddress" rows="2">Rajamahendravaram, Andhra Pradesh, India</textarea></div>
              <div class="draft-field"><label>GST/PAN/CIN</label><input data-draft="companyTax" placeholder="GSTIN / PAN / CIN" /></div>
              <div class="draft-field"><label>Authorized signatory</label><input data-draft="companySigner" placeholder="Name of authorized person" /></div>
              <div class="draft-field"><label>Signatory designation</label><input data-draft="companySignerRole" placeholder="Director / Admin / Manager" /></div>
              <div class="draft-field"><label>Email / mobile</label><input data-draft="companyContact" placeholder="email and mobile" /></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>3. Counterparty Details</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Counterparty/client/vendor name</label><input data-draft="counterpartyName" placeholder="Legal name" /></div>
              <div class="draft-field"><label>Counterparty type</label><select data-draft="counterpartyType"><option>Client</option><option>Vendor</option><option>Employee</option><option>Consultant</option><option>Transporter</option><option>Agent</option><option>Other</option></select></div>
              <div class="draft-field full"><label>Address</label><textarea data-draft="counterpartyAddress" rows="2" placeholder="Full registered/business address"></textarea></div>
              <div class="draft-field"><label>GST/PAN/CIN</label><input data-draft="counterpartyTax" placeholder="GSTIN / PAN / CIN" /></div>
              <div class="draft-field"><label>Authorized signer name</label><input data-draft="counterpartySigner" placeholder="Person who will sign/accept" /></div>
              <div class="draft-field"><label>Signer designation/authority</label><input data-draft="counterpartySignerRole" placeholder="Director / Proprietor / Authorized Partner" /></div>
              <div class="draft-field"><label>Email / mobile</label><input data-draft="counterpartyContact" placeholder="email and WhatsApp mobile" /></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>4. Scope, Deliverables And Obligations</h4>
            <div class="draft-grid">
              <div class="draft-field full"><label>What exactly will be provided/performed?</label><textarea data-draft="scope" rows="4" placeholder="Scope of services, goods, portal access, transport work, consulting, etc."></textarea></div>
              <div class="draft-field full"><label>What are Varada Nexus obligations?</label><textarea data-draft="companyObligations" rows="3" placeholder="Responsibilities, service levels, documents, support, delivery"></textarea></div>
              <div class="draft-field full"><label>What are the counterparty obligations?</label><textarea data-draft="counterpartyObligations" rows="3" placeholder="Payment, cooperation, documents, compliance, approvals"></textarea></div>
              <div class="draft-field"><label>What is excluded?</label><textarea data-draft="exclusions" rows="3" placeholder="Items/services not included"></textarea></div>
              <div class="draft-field"><label>Dependencies/client inputs required</label><textarea data-draft="dependencies" rows="3" placeholder="Documents, approvals, access, information"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>5. Commercial Terms</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Agreement value / fee</label><input data-draft="amount" placeholder="INR amount or pricing method" /></div>
              <div class="draft-field"><label>Taxes</label><input data-draft="taxes" value="Applicable GST/taxes extra as per law" /></div>
              <div class="draft-field full"><label>Payment schedule</label><textarea data-draft="paymentSchedule" rows="3" placeholder="Advance, milestone, monthly, invoice due date, retention"></textarea></div>
              <div class="draft-field"><label>Credit period / due date</label><input data-draft="creditPeriod" placeholder="7 days / 15 days / immediate" /></div>
              <div class="draft-field"><label>Late payment penalty</label><input data-draft="latePenalty" placeholder="Interest %, suspension, recovery charges" /></div>
              <div class="draft-field full"><label>Security deposit / advance / retention</label><input data-draft="securityDeposit" placeholder="If any" /></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>6. Term, Termination And Breach</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Effective date</label><input data-draft="effectiveDate" placeholder="Date of signing / specific date" /></div>
              <div class="draft-field"><label>Duration</label><input data-draft="duration" placeholder="One year / project duration / until completion" /></div>
              <div class="draft-field"><label>Renewal terms</label><input data-draft="renewal" placeholder="Auto-renewal / written renewal / no renewal" /></div>
              <div class="draft-field"><label>Termination notice period</label><input data-draft="terminationNotice" placeholder="15 days / 30 days / immediate for breach" /></div>
              <div class="draft-field full"><label>What happens on breach/default?</label><textarea data-draft="breach" rows="3" placeholder="Suspension, damages, termination, recovery, indemnity"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>7. Confidentiality, Data And IP</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Confidentiality expectations</label><textarea data-draft="confidentiality" rows="3" placeholder="Mutual confidentiality, client data, pricing, documents"></textarea></div>
              <div class="draft-field"><label>Data/privacy requirements</label><textarea data-draft="dataPrivacy" rows="3" placeholder="Portal data, documents, personal data, retention"></textarea></div>
              <div class="draft-field"><label>Intellectual property ownership</label><textarea data-draft="ipOwnership" rows="3" placeholder="Who owns drafts, software, reports, designs, data"></textarea></div>
              <div class="draft-field"><label>Non-solicit / non-compete</label><textarea data-draft="nonSolicit" rows="3" placeholder="If needed"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>8. E-Sign, KYC And Evidence Requirements</h4>
            <div class="draft-checks">
              <label><input data-draft="electronicAcceptance" type="checkbox" checked />Allow electronic acceptance</label>
              <label><input data-draft="diditRequired" type="checkbox" checked />Require Didit KYC/digital signing</label>
              <label><input data-draft="livePhotoRequired" type="checkbox" checked />Require live photo evidence</label>
              <label><input data-draft="gpsRequired" type="checkbox" checked />Require GPS/location evidence</label>
              <label><input data-draft="ipDeviceRequired" type="checkbox" checked />Capture IP/device evidence</label>
              <label><input data-draft="vpnBlockRequired" type="checkbox" checked />Block VPN/proxy/Tor if configured</label>
              <label><input data-draft="driveArchiveRequired" type="checkbox" checked />Archive evidence to Google Drive</label>
              <label><input data-draft="whatsappRequired" type="checkbox" checked />Send signing link by WhatsApp</label>
            </div>
          </section>

          <section class="draft-section">
            <h4>9. Dispute, Court And Special Clauses</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Dispute method</label><select data-draft="disputeMethod"><option>Courts</option><option>Arbitration</option><option>Mediation then Courts</option><option>Mediation then Arbitration</option></select></div>
              <div class="draft-field"><label>Court venue</label><input data-draft="courtVenue" value="Rajamahendravaram, Andhra Pradesh, India" /></div>
              <div class="draft-field full"><label>Arbitration details if applicable</label><textarea data-draft="arbitration" rows="2" placeholder="Seat, language, arbitrator count"></textarea></div>
              <div class="draft-field full"><label>Any special clauses you want included?</label><textarea data-draft="specialClauses" rows="3" placeholder="Custom clauses, operational terms, special protections"></textarea></div>
              <div class="draft-field"><label>Clauses to avoid/exclude</label><textarea data-draft="avoidClauses" rows="3" placeholder="Anything you do not want in the agreement"></textarea></div>
              <div class="draft-field"><label>Known negotiation/dispute points</label><textarea data-draft="negotiationPoints" rows="3" placeholder="Any points likely to be negotiated"></textarea></div>
            </div>
          </section>
          </div>
        </div>
        <div id="manualDraftPanel" hidden>
          <h3>Manual Draft Details</h3>
          <p class="muted">Add the identifying details for the agreement, then write or paste the complete document in the editor. Manual mode does not send content to Gemini.</p>
          <section class="draft-section" style="margin-top:.85rem;">
            <div class="draft-grid">
              <div class="draft-field"><label>Internal agreement number/reference</label><input data-manual="agreementNo" placeholder="AGR-2026-0001" /></div>
              <div class="draft-field"><label>Agreement title</label><input data-manual="title" placeholder="Service Agreement for Interior Works" /></div>
              <div class="draft-field"><label>Agreement type</label><select data-manual="type"><option>Service Agreement</option><option>Terms and Conditions</option><option>Vendor Agreement</option><option>Customer Agreement</option><option>NDA</option><option>Payment Undertaking</option><option>Settlement Agreement</option><option>Employment / Consultant Agreement</option><option>Custom Agreement</option></select></div>
              <div class="draft-field"><label>Risk level</label><select data-manual="riskLevel"><option>Medium</option><option>Low</option><option>High</option><option>Critical</option></select></div>
              <div class="draft-field"><label>Counterparty type</label><select data-manual="counterpartyType"><option>Client</option><option>Vendor</option><option>Employee</option><option>Consultant</option><option>Transporter</option><option>Agent</option><option>Other</option></select></div>
              <div class="draft-field"><label>Counterparty name</label><input data-manual="counterpartyName" placeholder="Legal name" /></div>
              <div class="draft-field"><label>Authorized signer</label><input data-manual="counterpartySigner" placeholder="Person who will sign or accept" /></div>
              <div class="draft-field"><label>Email / WhatsApp mobile</label><input data-manual="counterpartyContact" placeholder="email and WhatsApp mobile" /></div>
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
              <button class="btn btn-ghost" id="copyIntakeToManualBtn" type="button">Use AI Intake Details</button>
              <button class="btn btn-ghost" id="blankManualDraftBtn" type="button">Start Blank Draft</button>
            </div>
          </section>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;">
          <button class="btn" id="generateDraftBtn" type="button">Generate AI Draft</button>
          <button class="btn btn-ghost" id="saveDraftBtn" type="button">Save Draft</button>
          <button class="btn btn-ghost" id="copyDraftBtn" type="button">Copy Draft</button>
        </div>
      </section>
      <section class="card">
        <h3 id="draftEditorTitle">Draft Editor</h3>
        <p class="muted" id="draftEditorDescription">The generated or edited draft appears here. The AI prompt is kept separately below.</p>
        <div class="document-editor-choice" id="documentEditorChoice" hidden>
          <p><strong>EMS Document Editor</strong> · Create a draft or upload a <code>.docx</code>. Import happens privately in your browser; review complex layouts, headers and footers before saving.</p>
        </div>
        <textarea id="draftOutput" class="legal-output" placeholder="Generated draft will appear here. You can edit it before saving."></textarea>
        <div class="word-editor-shell" id="wordEditorShell" hidden>
          <div class="word-editor-launch" id="wordEditorLaunchPanel">
            <div class="word-editor-launch-content">
              <span class="word-editor-badge">DOCX · Secure self-hosted editor</span>
              <h4>Professional Word-style Legal Editor</h4>
              <p>Create real paginated DOCX agreements with a familiar ribbon, headers, footers, sections, resizable tables, images, comments, track changes, spellcheck, print and export tools.</p>
              <div class="word-editor-features" aria-label="Editor features">
                <span>Headers &amp; footers</span><span>Resizable tables</span><span>Page layout</span><span>Track changes</span><span>Comments</span><span>DOCX &amp; PDF</span>
              </div>
              <button class="btn" id="launchWordEditorBtn" type="button">Open Word-style Editor</button>
              <p class="muted">The document is stored privately. Varada Nexus credentials and document secrets are never sent to the browser.</p>
            </div>
          </div>
          <div class="word-editor-frame" id="wordEditorFrame" hidden><div id="onlyofficeEditor"></div></div>
          <div class="word-editor-footer">
            <span id="wordEditorStatus">Ready to create a secure document session</span>
            <span>Use File → Save inside the editor before saving to EMS</span>
          </div>
        </div>
        <div class="manual-editor-shell" id="manualEditorShell" hidden>
          <div class="manual-editor-toolbar" id="manualEditorToolbar" role="toolbar" aria-label="Manual document formatting">
            <div class="toolbar-group">
              <button type="button" data-command="undo" title="Undo" aria-label="Undo">↶</button>
              <button type="button" data-command="redo" title="Redo" aria-label="Redo">↷</button>
            </div>
            <div class="toolbar-group">
              <select data-command="formatBlock" title="Paragraph style" aria-label="Paragraph style">
                <option value="">Style</option><option value="p">Normal</option><option value="h1">Title</option><option value="h2">Heading 1</option><option value="h3">Heading 2</option><option value="blockquote">Quote</option>
              </select>
              <select data-command="fontName" title="Font family" aria-label="Font family">
                <option value="">Font</option><option value="Cambria">Cambria</option><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Calibri">Calibri</option>
              </select>
              <select data-command="fontSize" title="Font size" aria-label="Font size">
                <option value="">Size</option><option value="2">10</option><option value="3">12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option>
              </select>
            </div>
            <div class="toolbar-group">
              <button type="button" data-command="bold" title="Bold" aria-label="Bold"><strong>B</strong></button>
              <button type="button" data-command="italic" title="Italic" aria-label="Italic"><em>I</em></button>
              <button type="button" data-command="underline" title="Underline" aria-label="Underline"><u>U</u></button>
              <button type="button" data-command="strikeThrough" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button>
              <label class="toolbar-color" title="Text color" aria-label="Text color"><span style="border-bottom:3px solid #b11;">A</span><input type="color" data-command="foreColor" value="#111111" /></label>
              <label class="toolbar-color" title="Highlight color" aria-label="Highlight color"><span style="background:#ffe58f;padding:1px 3px;">H</span><input type="color" data-command="hiliteColor" value="#fff1a8" /></label>
            </div>
            <div class="toolbar-group">
              <button type="button" data-command="justifyLeft" title="Align left" aria-label="Align left">≡</button>
              <button type="button" data-command="justifyCenter" title="Align center" aria-label="Align center">≣</button>
              <button type="button" data-command="justifyRight" title="Align right" aria-label="Align right">≡</button>
              <button type="button" data-command="justifyFull" title="Justify" aria-label="Justify">☰</button>
            </div>
            <div class="toolbar-group">
              <button type="button" data-command="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">• List</button>
              <button type="button" data-command="insertOrderedList" title="Numbered list" aria-label="Numbered list">1. List</button>
              <button type="button" data-command="outdent" title="Decrease indent" aria-label="Decrease indent">⇤</button>
              <button type="button" data-command="indent" title="Increase indent" aria-label="Increase indent">⇥</button>
            </div>
            <div class="toolbar-group">
              <button type="button" id="manualUploadWordBtn" title="Upload and edit an existing Word document" aria-label="Upload and edit an existing Word document">Upload Word</button>
              <input id="manualWordFileInput" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden />
              <button type="button" data-command="createLink" title="Insert link" aria-label="Insert link">Link</button>
              <button type="button" id="manualInsertTableBtn" title="Insert table" aria-label="Insert table">Table</button>
              <button type="button" id="manualPageBreakBtn" title="Insert page break" aria-label="Insert page break">Page break</button>
              <button type="button" id="manualFindReplaceBtn" title="Find and replace" aria-label="Find and replace">Find</button>
              <button type="button" data-command="insertHorizontalRule" title="Insert horizontal line" aria-label="Insert horizontal line">―</button>
              <button type="button" data-command="removeFormat" title="Clear formatting" aria-label="Clear formatting">Clear</button>
              <button type="button" id="manualDownloadWordBtn" title="Download Word-compatible document" aria-label="Download Word-compatible document">Download Word</button>
              <button type="button" id="manualPrintBtn" title="Print or save as PDF" aria-label="Print or save as PDF">Print / PDF</button>
            </div>
          </div>
          <div class="manual-editor-workspace">
            <section id="manualDocumentPage" class="manual-document-page" aria-label="A4 document page">
              <header id="manualPageHeader" class="manual-page-header" contenteditable="true" spellcheck="true" data-placeholder="Click to add a document header"></header>
              <article id="manualRichEditor" class="manual-document-body" contenteditable="true" spellcheck="true" data-placeholder="Start typing your legal agreement, or paste an existing draft here..."><p><br></p></article>
              <footer id="manualPageFooter" class="manual-page-footer" contenteditable="true" spellcheck="true" data-placeholder="Click to add a document footer"></footer>
            </section>
            <div id="manualImportedDocxStyles" hidden></div>
          </div>
          <div class="manual-editor-status">
            <span id="manualEditorStatus">0 words · 0 characters</span>
            <span>A4 · DOCX import · Header/footer · Resizable tables · Spellcheck · EMS versions</span>
          </div>
        </div>
        <div id="aiToolsPanel">
          <div class="revision-box">
            <h3>Ask AI To Make Changes</h3>
            <textarea id="revisionPrompt" rows="4" placeholder="Example: Add stronger payment default clause, reduce liability exposure, and simplify the evidence consent clause."></textarea>
            <button class="btn" id="reviseDraftBtn" type="button">Apply AI Changes</button>
          </div>
          <div class="revision-box">
            <h3>Prompt Preview</h3>
            <textarea id="promptOutput" class="prompt-output" placeholder="The structured prompt sent to Gemini appears here. It is separate from the draft editor."></textarea>
          </div>
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:1rem;">
      <h3>Before Sending</h3>
      <ul class="legal-checklist">
        <li>Verify party identity, authority, address, GST/PAN and mobile/email.</li>
        <li>Freeze the version before sending. Any change after acceptance must become a new version or amendment.</li>
        <li>Confirm whether Didit KYC/signing is mandatory for the agreement value and risk level.</li>
      </ul>
    </section>
  `);
  document.querySelector("#generateDraftBtn")?.addEventListener("click", generateDraft);
  document.querySelector("#saveDraftBtn")?.addEventListener("click", saveDraft);
  document.querySelector("#reviseDraftBtn")?.addEventListener("click", reviseDraft);
  document.querySelector("#aiDraftModeBtn")?.addEventListener("click", () => setDraftMode("ai"));
  document.querySelector("#manualDraftModeBtn")?.addEventListener("click", () => setDraftMode("manual"));
  document.querySelector("#copyIntakeToManualBtn")?.addEventListener("click", copyIntakeToManualDetails);
  document.querySelector("#blankManualDraftBtn")?.addEventListener("click", startBlankManualDraft);
  document.querySelector("#wordEditorModeBtn")?.addEventListener("click", () => setManualEditorKind("word"));
  document.querySelector("#basicEditorModeBtn")?.addEventListener("click", () => setManualEditorKind("basic"));
  document.querySelector("#launchWordEditorBtn")?.addEventListener("click", launchWordEditor);
  document.querySelector("#copyDraftBtn")?.addEventListener("click", async () => {
    const text = currentDraftText();
    if (!text) {
      showToast(manualEditorKind === "word" && currentDraftMode === "manual" ? "Save the Word draft to EMS before copying its extracted text." : "There is no draft to copy.", TOAST_TYPES.WARNING);
      return;
    }
    await navigator.clipboard?.writeText(text).catch(() => {});
    showToast("Draft copied.", TOAST_TYPES.SUCCESS);
  });
  bindManualRichEditor();
  setDraftMode("ai");
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_DRAFTING,
    pageTitle: "Legal Drafting",
    pageDescription: "Draft agreements manually or prepare Gemini-assisted clauses",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  renderPage();
}

init();
