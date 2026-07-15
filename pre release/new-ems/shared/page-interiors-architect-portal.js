import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { initTheme } from "./theme.js";
import { initLiveChat } from "./live-chat.js?v=sprint15-chat-21";
import { enforceTermsAcceptance } from "./terms-gate.js?v=terms-owner-bypass-1";
import { showToast } from "./utils.js";
import { architectPortalLogout, getArchitectPortalSession, requireArchitectPortalSession } from "./interiors-architect-portal-auth.js";
import { listInteriorsArchitectDesignFiles, uploadInteriorsArchitectDesignToDrive } from "./drive-api.js?v=architect-drive-1";
import { compressDesignBookImage, generateInteriorDesignBookPdf } from "./interiors-design-book-pdf.js?v=2";

const client = getSupabaseClient();
const STATE = { session: null, context: null, detail: null, activeView: "dashboard", activeProjectId: "", busy: false, designBook: null, generatedDesignBookFile: null };
const DESIGN_BOOK_TYPES = [
  ["cover", "Cover"], ["hero", "Hero Image"], ["split", "Image + Narrative"],
  ["gallery", "Gallery"], ["material_board", "Material Board"],
  ["detail_sheet", "Detail Sheet"], ["notes", "Notes / Specs"]
];
const NAV = [
  ["dashboard", "D", "Dashboard"], ["projects", "P", "Assigned Projects"],
  ["designs", "DS", "Design Studio"], ["specifications", "SP", "Specifications"],
  ["site", "SU", "Site Updates"], ["approvals", "A", "Approvals & Feedback"],
  ["queries", "Q", "Queries & Coordination"]
];

initTheme();
const appRoot = document.querySelector("#app");
appRoot.innerHTML = `<main class="ap-loading"><strong>VARADA NEXUS</strong><h1>Preparing Architect Workspace</h1><p>Loading assigned projects and design coordination…</p></main>`;
requestAnimationFrame(() => appRoot.classList.add("page-enter-active"));

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function date(value) { return value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
function label(value) { return String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }
function projects() { return STATE.context?.projects || []; }
function currentProject() { return projects().find((p) => String(p.id) === String(STATE.activeProjectId)) || projects()[0] || null; }

async function loadContext() {
  const token = getArchitectPortalSession()?.sessionToken;
  const { data, error } = await client.rpc("interiors_architect_portal_context", { p_session_token: token });
  if (error) throw error;
  STATE.context = data || { profile: {}, projects: [] };
  if (!STATE.activeProjectId && projects()[0]) STATE.activeProjectId = projects()[0].id;
}

async function loadProject(projectId = STATE.activeProjectId) {
  if (!projectId) { STATE.detail = null; return; }
  const token = getArchitectPortalSession()?.sessionToken;
  const [{ data, error }, files] = await Promise.all([
    client.rpc("interiors_architect_portal_project", { p_session_token: token, p_project_id: projectId }),
    listInteriorsArchitectDesignFiles({ sessionToken: token, projectId })
  ]);
  if (error) throw error;
  STATE.activeProjectId = projectId;
  STATE.detail = data ? { ...data, design_files: files?.documents || [] } : null;
}

function metric(title, value, note = "") {
  return `<article class="ap-metric"><small>${esc(title)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`;
}

function projectCard(p) {
  return `<button class="ap-project ${String(p.id) === String(STATE.activeProjectId) ? "active" : ""}" data-project="${p.id}" type="button">
    <span class="ap-project-mark">${esc((p.project_name || "P").slice(0, 2).toUpperCase())}</span>
    <span class="ap-project-copy"><b>${esc(p.project_name || "Project")}</b><small>${esc(p.project_code || "")}${p.client_name ? ` · ${esc(p.client_name)}` : ""}</small><i><span style="width:${Math.min(100, Number(p.progress_percent || 0))}%"></span></i></span>
    <span class="ap-project-side"><em>${esc(label(p.status))}</em><b>${Number(p.progress_percent || 0)}%</b></span>
  </button>`;
}

function dashboardView() {
  const rows = projects();
  const designs = rows.reduce((n, p) => n + Number(p.design_count || 0), 0);
  const approvals = rows.reduce((n, p) => n + Number(p.pending_approvals || 0), 0);
  const avg = rows.length ? Math.round(rows.reduce((n, p) => n + Number(p.progress_percent || 0), 0) / rows.length) : 0;
  return `<section class="ap-hero"><div><span>ARCHITECT COMMAND DESK</span><h2>Shape every detail with clarity.</h2><p>Your assigned projects, design revisions, specifications, site progress, and client feedback in one secure workspace.</p></div><aside><small>ACTIVE PORTFOLIO</small><strong>${rows.length}</strong><span>assigned engagement${rows.length === 1 ? "" : "s"}</span></aside></section>
    <div class="ap-metrics">${metric("Assigned projects", rows.length, "Active architect assignments")}${metric("Design revisions", designs, "Across assigned projects")}${metric("Pending approvals", approvals, "Awaiting client decision")}${metric("Portfolio progress", `${avg}%`, "Average site completion")}</div>
    <div class="ap-split"><section class="ap-panel"><header><div><small>PORTFOLIO</small><h3>Live projects</h3></div><button data-view="projects" type="button">View all</button></header><div class="ap-project-list">${rows.length ? rows.slice(0, 5).map(projectCard).join("") : empty("No projects are assigned yet.")}</div></section>
    <section class="ap-panel"><header><div><small>ATTENTION</small><h3>Design pulse</h3></div></header>${rows.length ? rows.slice(0, 4).map((p) => `<div class="ap-pulse"><span>${esc(p.project_code || "PRJ")}</span><div><b>${esc(p.project_name)}</b><small>${Number(p.pending_approvals || 0)} pending approval(s) · ${Number(p.design_count || 0)} design(s)</small></div></div>`).join("") : empty("Your design activity will appear here.")}</section></div>`;
}

function projectsView() {
  return `<section class="ap-panel"><header><div><small>ASSIGNED WORK</small><h3>Projects</h3></div><span>${projects().length} engagement(s)</span></header><div class="ap-project-list">${projects().length ? projects().map(projectCard).join("") : empty("No projects assigned.")}</div></section>${STATE.detail ? projectOverview() : ""}`;
}

function projectOverview() {
  const p = STATE.detail?.project || {};
  return `<section class="ap-panel ap-detail"><header><div><small>${esc(p.project_code || "PROJECT")}</small><h3>${esc(p.project_title || p.project_name || "Project details")}</h3></div><span class="ap-status">${esc(label(p.status))}</span></header><div class="ap-info-grid"><div><small>Site</small><b>${esc(p.site_address || "Pending")}</b></div><div><small>Start</small><b>${date(p.start_date)}</b></div><div><small>Target</small><b>${date(p.target_end_date)}</b></div><div><small>Priority</small><b>${esc(label(p.priority))}</b></div></div><p>${esc(p.summary || "No project brief has been published.")}</p></section>`;
}

function designsView() {
  const rows = STATE.detail?.designs || [];
  return `${projectPicker()}<div class="ap-split ap-design-layout"><section class="ap-panel"><header><div><small>CONTROLLED SUBMISSION</small><h3>Submit design revision</h3></div></header><form id="designForm" class="ap-form">
    <label>Design title *<input id="designTitle" required placeholder="Concept plan, reflected ceiling plan…" /></label>
    <div class="db-launch"><div><strong>Advanced Design Book</strong><small>Create a branded, multi-page luxury PDF with architect credentials, page layouts, imagery, descriptions, revision control, and a final preview.</small></div><button id="openDesignBookBtn" type="button">Open PDF Designer</button></div>
    ${STATE.generatedDesignBookFile ? `<div class="db-attached"><span><b>Generated PDF attached</b><br/>${esc(STATE.generatedDesignBookFile.name)} · ${formatFileSize(STATE.generatedDesignBookFile.size)}</span><button id="removeDesignBookBtn" type="button">Remove</button></div>` : ""}
    <label class="ap-upload">Design files & pictures *<input id="designFiles" type="file" multiple accept="image/*,.pdf,.dwg,.dxf,.skp,.rvt,.rfa,.ifc,.3ds,.obj,.stl,.step,.stp,.zip"/><span><b>Choose files or pictures</b><small>Multiple images, PDF, CAD, BIM, 3D or ZIP files · 10 MB each</small></span></label>
    <div id="designFileSelection" class="ap-file-selection"><span>No files selected yet.</span></div>
    <label>External reference URL <small>(optional)</small><input id="designUrl" type="url" placeholder="https://drive.google.com/…" /></label>
    <label>Description<textarea id="designDescription" rows="4" placeholder="Revision scope, design intent, coordination notes…"></textarea></label>
    <div class="ap-drive-route"><b>Secure Drive filing</b><span>Designs / Client / Date / Project / Version</span></div>
    <div class="ap-form-actions" style="display:grid;grid-template-columns:.75fr 1.25fr;gap:.65rem;"><button class="ap-secondary" style="background:#080b10;border:1px solid rgba(216,182,92,.35);color:#f1d787;font-weight:800;padding:.75rem 1rem;border-radius:10px;cursor:pointer;" name="workflowAction" value="draft" type="submit" ${STATE.busy ? "disabled" : ""}>Save draft</button><button class="ap-primary" name="workflowAction" value="submit" type="submit" ${STATE.busy ? "disabled" : ""}>${STATE.busy ? "Saving securely…" : "Submit to staff review"}</button></div></form></section>
  <section class="ap-panel"><header><div><small>VERSION REGISTER</small><h3>Design history</h3></div><span>${rows.length} version(s)</span></header>${rows.length ? rows.map((d) => `<article class="ap-record"><div><span>V${esc(d.version_no)}</span><h4>${esc(d.design_title)}</h4><p>${esc(d.description || "No description")}</p>${renderDesignFiles(d)}</div><aside><em>${esc(label(d.status))}</em><small>${date(d.uploaded_at)}</small>${d.file_url && !filesForDesign(d.id).some((f) => f.web_view_link === d.file_url) ? `<a href="${esc(d.file_url)}" target="_blank" rel="noopener">External reference ↗</a>` : ""}</aside>${(d.comments || []).length ? `<footer>${d.comments.map((c) => `<p><b>Feedback:</b> ${esc(c.comment)}</p>`).join("")}</footer>` : ""}</article>`).join("") : empty("No design revisions submitted yet.")}</section></div>`;
}

function createDesignBookState() {
  const project = currentProject() || {};
  const profile = STATE.context?.profile || {};
  return {
    open: true,
    step: "brief",
    busy: false,
    editingPageIndex: null,
    previewUrl: null,
    generatedFile: null,
    meta: {
      documentTitle: `${project.project_name || "Interior Project"} - Design Presentation`,
      documentType: "Concept Design Presentation",
      architectName: profile.name || "",
      architectRegistration: "",
      architectFirm: profile.name || "",
      architectEmail: profile.email || "",
      architectPhone: profile.phone || "",
      clientName: project.client_name || "",
      projectName: project.project_name || "",
      projectCode: project.project_code || "",
      siteAddress: STATE.detail?.project?.site_address || "",
      revision: "1",
      issueDate: new Date().toISOString().slice(0, 10),
      purpose: "Issued for staff review",
      executiveNote: "",
      confidential: true
    },
    pages: []
  };
}

function renderDesignBookModal() {
  const book = STATE.designBook;
  if (!book?.open) return "";
  const stepIndex = ["brief", "pages", "review"].indexOf(book.step);
  return `<div class="db-overlay" role="dialog" aria-modal="true" aria-labelledby="designBookTitle"><section class="db-modal">
    <header class="db-modal-head"><div class="db-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><small>VARADA NEXUS / INTERIORS</small><strong id="designBookTitle">Advanced Design Book Studio</strong></div></div><button class="db-close" id="closeDesignBookBtn" type="button" aria-label="Close PDF designer">×</button></header>
    <nav class="db-steps">${[["brief","1","Project & Author"],["pages","2","Build Pages"],["review","3","Preview & Attach"]].map(([key,n,title]) => `<button class="db-step ${book.step === key ? "active" : ""}" data-book-step="${key}" type="button"><span>${n}</span>${title}</button>`).join("")}</nav>
    <div class="db-body">${book.step === "brief" ? renderBookBrief() : book.step === "pages" ? renderBookPages() : renderBookReview()}</div>
    <footer class="db-modal-foot"><span>${book.pages.length} designed page${book.pages.length === 1 ? "" : "s"} · Premium A4 PDF · Secure local generation</span><div class="db-foot-actions">${stepIndex > 0 ? `<button class="db-btn" data-book-nav="back" type="button">Back</button>` : ""}${stepIndex < 2 ? `<button class="db-btn primary" data-book-nav="next" type="button">Continue</button>` : `<button class="db-btn primary" id="generateDesignBookBtn" type="button" ${book.busy ? "disabled" : ""}>${book.busy ? "Generating…" : "Generate Premium PDF"}</button>`}</div></footer>
  </section></div>`;
}

function renderBookBrief() {
  const m = STATE.designBook.meta;
  const documentTypes = ["Concept Design Presentation", "Space Planning Package", "Mood Board", "Material & Finish Presentation", "Design Development Set", "Working Drawing Package", "Site Coordination Book", "As-Built Design Book"];
  return `<section class="db-panel"><span class="db-kicker">DOCUMENT CONTROL</span><h2>Project and architect details</h2><p>These details form the branded cover, document metadata, headers, revision controls, and professional attribution.</p><form id="designBookBriefForm" class="db-grid">
    <label class="db-field wide">Document title *<input id="bookDocumentTitle" value="${esc(m.documentTitle)}" required/></label>
    <label class="db-field">Document type *<select id="bookDocumentType">${documentTypes.map((type) => `<option ${m.documentType === type ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label>
    <label class="db-field">Revision / issue number *<input id="bookRevision" value="${esc(m.revision)}" required/></label>
    <label class="db-field">Architect full name *<input id="bookArchitectName" value="${esc(m.architectName)}" required/></label>
    <label class="db-field">COA / registration number<input id="bookArchitectRegistration" value="${esc(m.architectRegistration)}" placeholder="CA/2026/00000"/></label>
    <label class="db-field">Architect firm / practice<input id="bookArchitectFirm" value="${esc(m.architectFirm)}"/></label>
    <label class="db-field">Architect email<input id="bookArchitectEmail" type="email" value="${esc(m.architectEmail)}"/></label>
    <label class="db-field">Architect phone<input id="bookArchitectPhone" value="${esc(m.architectPhone)}"/></label>
    <label class="db-field">Issue date<input id="bookIssueDate" type="date" value="${esc(m.issueDate)}"/></label>
    <label class="db-field">Client name *<input id="bookClientName" value="${esc(m.clientName)}" required/></label>
    <label class="db-field">Project name *<input id="bookProjectName" value="${esc(m.projectName)}" required/></label>
    <label class="db-field">Project code<input id="bookProjectCode" value="${esc(m.projectCode)}" readonly/></label>
    <label class="db-field">Issue purpose<select id="bookPurpose">${["Issued for staff review","Issued for client review","Issued for coordination","Issued for construction","Record / as-built"].map((v) => `<option ${m.purpose === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="db-field wide">Site address<input id="bookSiteAddress" value="${esc(m.siteAddress)}"/></label>
    <label class="db-field wide">Executive design note<textarea id="bookExecutiveNote" placeholder="Design intent, client brief, guiding principles…">${esc(m.executiveNote)}</textarea></label>
    <label class="db-check wide"><input id="bookConfidential" type="checkbox" ${m.confidential ? "checked" : ""}/> Mark every page confidential and issued for review only</label>
  </form></section>`;
}

function renderBookPages() {
  const book = STATE.designBook;
  const editing = Number.isInteger(book.editingPageIndex) ? book.pages[book.editingPageIndex] : null;
  const page = editing || { type: book.pages.length ? "hero" : "cover", title: "", subtitle: "", space: "", location: "", tags: [], description: "", images: [] };
  return `<section class="db-panel"><span class="db-kicker">PAGE COMPOSER</span><h2>Build the presentation page by page</h2><p>Select a luxury layout, add imagery and its design narrative, then arrange pages into the final issue.</p><div class="db-page-layout">
    <form id="designBookPageForm" class="db-editor"><input id="bookEditingPage" type="hidden" value="${Number.isInteger(book.editingPageIndex) ? book.editingPageIndex : ""}"/><label class="db-field">Page layout</label><div class="db-template-grid">${DESIGN_BOOK_TYPES.map(([key,title]) => `<button class="db-template ${page.type === key ? "active" : ""}" data-page-template="${key}" type="button">${title}</button>`).join("")}</div><input id="bookPageType" type="hidden" value="${page.type}"/>
      <div class="db-grid"><label class="db-field wide">Page title *<input id="bookPageTitle" value="${esc(page.title)}" required placeholder="Living room concept"/></label><label class="db-field">Subtitle / design direction<input id="bookPageSubtitle" value="${esc(page.subtitle)}" placeholder="Warm contemporary living"/></label><label class="db-field">Room / space<input id="bookPageSpace" value="${esc(page.space)}" placeholder="Living Room"/></label><label class="db-field">Drawing / location reference<input id="bookPageLocation" value="${esc(page.location)}" placeholder="Ground Floor / DWG-04"/></label><label class="db-field">Tags / materials<input id="bookPageTags" value="${esc((page.tags || []).join(", "))}" placeholder="Oak, brass, ivory"/></label><label class="db-field wide">Image description / design narrative *<textarea id="bookPageDescription" required placeholder="Explain the design intent, material selection, spatial purpose, key dimensions, or client decision required…">${esc(page.description)}</textarea></label></div>
      <label class="db-upload">Select page images<input id="bookPageImages" type="file" multiple accept="image/png,image/jpeg,image/webp"/><small>Up to 4 images · images are optimised for a sharp, practical PDF</small></label>
      <div id="bookPageImagePreview" class="db-preview-strip">${(page.images || []).map((image) => `<img src="${image.dataUrl}" alt="${esc(image.name)}"/>`).join("")}</div>
      <div class="db-editor-actions">${editing ? `<button class="db-btn" id="cancelPageEditBtn" type="button">Cancel edit</button>` : ""}<button class="db-btn primary" type="submit">${editing ? "Update page" : "Add page"}</button></div>
    </form>
    <section class="db-page-register"><span class="db-kicker">PAGE REGISTER</span><h3>${book.pages.length} page${book.pages.length === 1 ? "" : "s"} prepared</h3><div class="db-page-list">${book.pages.length ? book.pages.map(renderBookPageCard).join("") : `<div class="db-empty">Add a branded cover, then build the presentation with image, gallery, detail, material, and specification pages.</div>`}</div></section>
  </div></section>`;
}

function renderBookPageCard(page, index) {
  return `<article class="db-page-card"><div class="db-page-thumb">${page.images?.[0] ? `<img src="${page.images[0].dataUrl}" alt=""/>` : String(index + 1).padStart(2, "0")}</div><div class="db-page-copy"><strong>${esc(page.title || "Untitled page")}</strong><small>${esc(label(page.type))} · ${(page.images || []).length} image(s)</small></div><div class="db-page-actions"><button data-page-move="up" data-page-index="${index}" type="button" title="Move up">↑</button><button data-page-move="down" data-page-index="${index}" type="button" title="Move down">↓</button><button data-page-edit="${index}" type="button" title="Edit page">✎</button><button data-page-remove="${index}" type="button" title="Remove page">×</button></div></article>`;
}

function renderBookReview() {
  const book = STATE.designBook;
  const m = book.meta;
  return `<section class="db-panel"><span class="db-kicker">FINAL ISSUE</span><h2>Review and generate the design book</h2><p>Confirm the professional attribution and page order. The generated PDF is attached to the existing secure submission and Drive workflow.</p><div class="db-review-grid"><article class="db-review-card"><span class="db-kicker">DOCUMENT SUMMARY</span><div class="db-summary-list"><div><small>Title</small><strong>${esc(m.documentTitle)}</strong></div><div><small>Project</small><strong>${esc(m.projectCode)} · ${esc(m.projectName)}</strong></div><div><small>Client</small><strong>${esc(m.clientName)}</strong></div><div><small>Architect</small><strong>${esc(m.architectName)}${m.architectRegistration ? ` · ${esc(m.architectRegistration)}` : ""}</strong></div><div><small>Issue</small><strong>Revision ${esc(m.revision)} · ${date(m.issueDate)}</strong></div><div><small>Pages</small><strong>${book.pages.length}</strong></div></div></article><article class="db-review-card"><span class="db-kicker">PDF PREVIEW</span><div class="db-preview">${book.previewUrl ? `<iframe src="${book.previewUrl}#toolbar=0&navpanes=0" title="Generated design book preview"></iframe>` : `<div><strong>Ready to compose</strong><p>Generate the PDF to inspect the final branded output here.</p></div>`}</div>${book.generatedFile ? `<div class="db-editor-actions"><button class="db-btn" id="downloadDesignBookBtn" type="button">Download proof</button><button class="db-btn primary" id="attachDesignBookBtn" type="button">Attach to submission</button></div>` : ""}</article></div></section>`;
}

function filesForDesign(designId) {
  return (STATE.detail?.design_files || []).filter((file) => String(file.entity_id) === String(designId));
}

function renderDesignFiles(design) {
  const files = filesForDesign(design.id);
  if (!files.length) return "";
  return `<div class="ap-file-links">${files.map((file) => `<a href="${esc(file.web_view_link)}" target="_blank" rel="noopener"><b>${esc(file.file_name)}</b><small>${formatFileSize(file.file_size)} · Open in Drive ↗</small></a>`).join("")}</div>`;
}

function specificationsView() {
  const spaces = STATE.detail?.spaces || [], finishes = STATE.detail?.finish_schedules || [], specs = STATE.detail?.material_specs || [];
  return `${projectPicker()}<div class="ap-metrics">${metric("Spaces", spaces.length, "Project space hierarchy")}${metric("Finish schedules", finishes.length, "Surface and finish controls")}${metric("Material specs", specs.length, "Approved design specifications")}</div><div class="ap-split"><section class="ap-panel"><header><div><small>FINISH CONTROL</small><h3>Finish schedules</h3></div></header>${finishes.length ? finishes.map((r) => record(r.schedule_name, `${r.surface_type || "Surface"} · ${r.finish_spec_summary || "Specification pending"}`, r.status)).join("") : empty("No finish schedules published.")}</section><section class="ap-panel"><header><div><small>MATERIAL CONTROL</small><h3>Material specifications</h3></div></header>${specs.length ? specs.map((r) => record(r.spec_name, `${r.material_category || "Material"} · ${r.preferred_brand || "Brand open"}`, r.status)).join("") : empty("No material specifications published.")}</section></div>`;
}

function siteView() {
  const rows = STATE.detail?.site_updates || [];
  return `${projectPicker()}<section class="ap-panel"><header><div><small>SITE INTELLIGENCE</small><h3>Progress timeline</h3></div><span>${rows.length} update(s)</span></header>${rows.length ? `<div class="ap-timeline">${rows.map((r) => `<article><span>${Number(r.progress_percent || 0)}%</span><div><small>${date(r.update_date)}</small><h4>${esc(r.update_title)}</h4><p>${esc(r.update_description || "")}</p></div></article>`).join("")}</div>` : empty("No site updates have been posted.")}</section>`;
}

function approvalsView() {
  const rows = STATE.detail?.approvals || [];
  return `${projectPicker()}<section class="ap-panel"><header><div><small>CLIENT DECISIONS</small><h3>Approvals & feedback</h3></div><span>${rows.length} item(s)</span></header>${rows.length ? rows.map((r) => record(label(r.approval_type), r.remarks || "No remarks", r.decision, r.decided_at || r.created_at)).join("") : empty("No approval records for this project.")}</section>`;
}

function queriesView() {
  return `<section class="ap-hero ap-query"><div><span>SECURE COORDINATION</span><h2>Queries & project communication</h2><p>Use Nexus Chat to coordinate with the Varada Nexus project team. Project references and decisions remain connected to your secure portal identity.</p></div><aside><small>CHANNEL</small><strong>LIVE</strong><span>Use the chat button below</span></aside></section><section class="ap-panel"><h3>Coordination protocol</h3><div class="ap-info-grid"><div><small>Design queries</small><b>Reference the project code and revision.</b></div><div><small>Site clarifications</small><b>Include the affected space or finish.</b></div><div><small>Client decisions</small><b>Track final decisions under Approvals.</b></div><div><small>Urgent matters</small><b>Mark the message clearly for escalation.</b></div></div></section>`;
}

function record(title, description, status, at = null) { return `<article class="ap-line"><div><b>${esc(title || "Record")}</b><small>${esc(description || "")}</small></div><aside><em>${esc(label(status))}</em>${at ? `<small>${date(at)}</small>` : ""}</aside></article>`; }
function empty(message) { return `<div class="ap-empty">${esc(message)}</div>`; }
function projectPicker() { const p = currentProject(); return `<section class="ap-picker"><label>Active project<select id="projectPicker">${projects().map((r) => `<option value="${r.id}" ${String(r.id) === String(STATE.activeProjectId) ? "selected" : ""}>${esc(r.project_code || "")} — ${esc(r.project_name)}</option>`).join("")}</select></label><div><small>CURRENT ENGAGEMENT</small><b>${esc(p?.project_name || "No project selected")}</b></div></section>`; }

function content() {
  return ({ dashboard: dashboardView, projects: projectsView, designs: designsView, specifications: specificationsView, site: siteView, approvals: approvalsView, queries: queriesView }[STATE.activeView] || dashboardView)();
}

function render() {
  const profile = STATE.context?.profile || {};
  document.querySelector("#app").innerHTML = `<style>${CSS}</style><div class="ap-shell"><aside class="ap-sidebar"><div class="ap-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><small>ARCHITECT PORTAL</small></div></div><div class="ap-nav-title">DESIGN WORKSPACE</div><nav>${NAV.map(([key, icon, title]) => `<button class="${STATE.activeView === key ? "active" : ""}" data-view="${key}" type="button"><span>${icon}</span>${title}</button>`).join("")}</nav><footer><div class="ap-avatar">${esc((profile.name || "A").slice(0, 1).toUpperCase())}</div><div><b>${esc(profile.name || "Architect")}</b><small>${esc(profile.email || "Secure account")}</small></div><button id="logoutBtn" title="Sign out">↗</button></footer></aside><main class="ap-main"><header class="ap-top"><div><small>INTERIORS / ${esc(STATE.activeView.toUpperCase())}</small><h1>${esc(NAV.find(([k]) => k === STATE.activeView)?.[2] || "Architect Portal")}</h1></div><span><i></i> Secure architect session</span></header><div class="ap-content">${content()}</div><footer class="ap-foot">Varada Nexus Private Limited · Secure Architect Workspace</footer></main></div>${renderDesignBookModal()}<div id="toastHost" class="toast-host" aria-live="polite"></div>`;
  bind();
}

async function switchProject(id) { try { await loadProject(id); render(); } catch (e) { showToast(e.message || "Could not load project", TOAST_TYPES.ERROR); } }
function bind() {
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", async () => { STATE.activeView = b.dataset.view; if (!["dashboard"].includes(STATE.activeView) && !STATE.detail) await loadProject(); render(); }));
  document.querySelectorAll("[data-project]").forEach((b) => b.addEventListener("click", async () => { await switchProject(b.dataset.project); STATE.activeView = "projects"; render(); }));
  document.querySelector("#projectPicker")?.addEventListener("change", (e) => switchProject(e.target.value));
  document.querySelector("#logoutBtn")?.addEventListener("click", architectPortalLogout);
  document.querySelector("#designForm")?.addEventListener("submit", submitDesign);
  document.querySelector("#designFiles")?.addEventListener("change", (event) => {
    const host = document.querySelector("#designFileSelection");
    const files = [...(event.target.files || [])];
    if (host) host.innerHTML = files.length
      ? files.map((file) => `<span><b>${esc(file.name)}</b><small>${formatFileSize(file.size)}</small></span>`).join("")
      : "<span>No files selected yet.</span>";
  });
  document.querySelector("#openDesignBookBtn")?.addEventListener("click", openDesignBook);
  document.querySelector("#removeDesignBookBtn")?.addEventListener("click", () => { STATE.generatedDesignBookFile = null; render(); });
  document.querySelector("#closeDesignBookBtn")?.addEventListener("click", closeDesignBook);
  document.querySelectorAll("[data-book-step]").forEach((button) => button.addEventListener("click", () => navigateDesignBook(button.dataset.bookStep)));
  document.querySelectorAll("[data-book-nav]").forEach((button) => button.addEventListener("click", () => navigateDesignBook(button.dataset.bookNav === "back" ? previousBookStep() : nextBookStep())));
  document.querySelectorAll("[data-page-template]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("#bookPageType").value = button.dataset.pageTemplate;
    document.querySelectorAll("[data-page-template]").forEach((item) => item.classList.toggle("active", item === button));
  }));
  document.querySelector("#bookPageImages")?.addEventListener("change", previewBookPageImages);
  document.querySelector("#designBookPageForm")?.addEventListener("submit", saveDesignBookPage);
  document.querySelector("#cancelPageEditBtn")?.addEventListener("click", () => { STATE.designBook.editingPageIndex = null; render(); });
  document.querySelectorAll("[data-page-edit]").forEach((button) => button.addEventListener("click", () => { STATE.designBook.editingPageIndex = Number(button.dataset.pageEdit); render(); }));
  document.querySelectorAll("[data-page-remove]").forEach((button) => button.addEventListener("click", () => removeDesignBookPage(Number(button.dataset.pageRemove))));
  document.querySelectorAll("[data-page-move]").forEach((button) => button.addEventListener("click", () => moveDesignBookPage(Number(button.dataset.pageIndex), button.dataset.pageMove)));
  document.querySelector("#generateDesignBookBtn")?.addEventListener("click", generateDesignBookPreview);
  document.querySelector("#downloadDesignBookBtn")?.addEventListener("click", downloadDesignBookProof);
  document.querySelector("#attachDesignBookBtn")?.addEventListener("click", attachDesignBookToSubmission);
}

function openDesignBook() {
  if (!STATE.designBook) STATE.designBook = createDesignBookState();
  STATE.designBook.open = true;
  render();
}

function closeDesignBook() {
  if (STATE.designBook) STATE.designBook.open = false;
  render();
}

function previousBookStep() {
  return STATE.designBook?.step === "review" ? "pages" : "brief";
}

function nextBookStep() {
  return STATE.designBook?.step === "brief" ? "pages" : "review";
}

function captureBookBrief() {
  const book = STATE.designBook;
  if (!book || book.step !== "brief") return true;
  const required = ["bookDocumentTitle", "bookRevision", "bookArchitectName", "bookClientName", "bookProjectName"];
  const missing = required.find((id) => !document.querySelector(`#${id}`)?.value.trim());
  if (missing) {
    showToast("Complete all required document and architect details.", TOAST_TYPES.ERROR);
    document.querySelector(`#${missing}`)?.focus();
    return false;
  }
  book.meta = {
    ...book.meta,
    documentTitle: document.querySelector("#bookDocumentTitle").value.trim(),
    documentType: document.querySelector("#bookDocumentType").value,
    revision: document.querySelector("#bookRevision").value.trim(),
    architectName: document.querySelector("#bookArchitectName").value.trim(),
    architectRegistration: document.querySelector("#bookArchitectRegistration").value.trim(),
    architectFirm: document.querySelector("#bookArchitectFirm").value.trim(),
    architectEmail: document.querySelector("#bookArchitectEmail").value.trim(),
    architectPhone: document.querySelector("#bookArchitectPhone").value.trim(),
    issueDate: document.querySelector("#bookIssueDate").value,
    clientName: document.querySelector("#bookClientName").value.trim(),
    projectName: document.querySelector("#bookProjectName").value.trim(),
    projectCode: document.querySelector("#bookProjectCode").value.trim(),
    purpose: document.querySelector("#bookPurpose").value,
    siteAddress: document.querySelector("#bookSiteAddress").value.trim(),
    executiveNote: document.querySelector("#bookExecutiveNote").value.trim(),
    confidential: document.querySelector("#bookConfidential").checked
  };
  return true;
}

function navigateDesignBook(target) {
  const book = STATE.designBook;
  if (!book) return;
  if (book.step === "brief" && !captureBookBrief()) return;
  if (target === "review" && !book.pages.length) return showToast("Add at least one designed page before review.", TOAST_TYPES.ERROR);
  book.step = target;
  book.editingPageIndex = null;
  render();
}

function previewBookPageImages(event) {
  const host = document.querySelector("#bookPageImagePreview");
  const files = [...(event.target.files || [])].slice(0, 4);
  if (!host) return;
  host.innerHTML = files.map((file) => `<img src="${URL.createObjectURL(file)}" alt="${esc(file.name)}"/>`).join("");
}

async function saveDesignBookPage(event) {
  event.preventDefault();
  const book = STATE.designBook;
  if (!book || book.busy) return;
  const title = document.querySelector("#bookPageTitle")?.value.trim();
  const description = document.querySelector("#bookPageDescription")?.value.trim();
  if (!title || !description) return showToast("Page title and image description are required.", TOAST_TYPES.ERROR);
  const editingIndexValue = document.querySelector("#bookEditingPage")?.value;
  const editingIndex = editingIndexValue === "" ? null : Number(editingIndexValue);
  const existing = Number.isInteger(editingIndex) ? book.pages[editingIndex] : null;
  const files = [...(document.querySelector("#bookPageImages")?.files || [])].slice(0, 4);
  if (files.some((file) => file.size > 12 * 1024 * 1024)) return showToast("Each page image must be 12 MB or smaller.", TOAST_TYPES.ERROR);
  book.busy = true;
  try {
    const images = files.length ? await Promise.all(files.map((file) => compressDesignBookImage(file))) : (existing?.images || []);
    const pageType = document.querySelector("#bookPageType")?.value || "hero";
    if (!["cover", "notes"].includes(pageType) && !images.length) throw new Error("This layout requires at least one image.");
    const page = {
      type: pageType,
      title,
      subtitle: document.querySelector("#bookPageSubtitle")?.value.trim() || "",
      space: document.querySelector("#bookPageSpace")?.value.trim() || "",
      location: document.querySelector("#bookPageLocation")?.value.trim() || "",
      tags: document.querySelector("#bookPageTags")?.value.split(",").map((v) => v.trim()).filter(Boolean),
      description,
      images
    };
    if (Number.isInteger(editingIndex)) book.pages[editingIndex] = page;
    else book.pages.push(page);
    book.editingPageIndex = null;
    if (book.previewUrl) URL.revokeObjectURL(book.previewUrl);
    book.previewUrl = null;
    book.generatedFile = null;
    showToast(Number.isInteger(editingIndex) ? "Page updated." : "Page added to the design book.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Could not process the page images.", TOAST_TYPES.ERROR);
  } finally {
    book.busy = false;
    render();
  }
}

function removeDesignBookPage(index) {
  const book = STATE.designBook;
  if (!book?.pages[index]) return;
  book.pages.splice(index, 1);
  if (book.previewUrl) URL.revokeObjectURL(book.previewUrl);
  book.previewUrl = null;
  book.generatedFile = null;
  render();
}

function moveDesignBookPage(index, direction) {
  const book = STATE.designBook;
  const target = direction === "up" ? index - 1 : index + 1;
  if (!book?.pages[index] || target < 0 || target >= book.pages.length) return;
  [book.pages[index], book.pages[target]] = [book.pages[target], book.pages[index]];
  if (book.previewUrl) URL.revokeObjectURL(book.previewUrl);
  book.previewUrl = null;
  book.generatedFile = null;
  render();
}

async function generateDesignBookPreview() {
  const book = STATE.designBook;
  if (!book || book.busy) return;
  if (!book.pages.length) return showToast("Add at least one page before generating the PDF.", TOAST_TYPES.ERROR);
  book.busy = true;
  render();
  try {
    const result = await generateInteriorDesignBookPdf({ meta: book.meta, pages: book.pages });
    if (result.file.size > 10 * 1024 * 1024) throw new Error("The generated PDF is larger than 10 MB. Reduce the number of high-resolution images or divide it into two design books.");
    if (book.previewUrl) URL.revokeObjectURL(book.previewUrl);
    book.generatedFile = result.file;
    book.previewUrl = URL.createObjectURL(result.blob);
    showToast("Premium design book generated. Review it before attaching.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Could not generate the design book.", TOAST_TYPES.ERROR);
  } finally {
    book.busy = false;
    render();
  }
}

function downloadDesignBookProof() {
  const book = STATE.designBook;
  if (!book?.generatedFile || !book.previewUrl) return;
  const link = document.createElement("a");
  link.href = book.previewUrl;
  link.download = book.generatedFile.name;
  link.click();
}

function attachDesignBookToSubmission() {
  const book = STATE.designBook;
  if (!book?.generatedFile) return;
  STATE.generatedDesignBookFile = book.generatedFile;
  book.open = false;
  const title = book.meta.documentTitle;
  const description = `${book.meta.documentType} · Revision ${book.meta.revision} · Prepared by ${book.meta.architectName}. ${book.meta.executiveNote || "Branded design book prepared for staff review."}`;
  render();
  const titleInput = document.querySelector("#designTitle");
  const descriptionInput = document.querySelector("#designDescription");
  if (titleInput) titleInput.value = title;
  if (descriptionInput) descriptionInput.value = description;
  showToast("The generated PDF is attached. Submit it to staff review when ready.", TOAST_TYPES.SUCCESS);
}

async function submitDesign(event) {
  event.preventDefault(); if (STATE.busy || !STATE.activeProjectId) return;
  const shouldSubmit = event.submitter?.value !== "draft";
  const title = document.querySelector("#designTitle")?.value.trim();
  const description = document.querySelector("#designDescription")?.value.trim() || null;
  const fileUrl = document.querySelector("#designUrl")?.value.trim() || null;
  const files = [...(document.querySelector("#designFiles")?.files || [])];
  if (STATE.generatedDesignBookFile) files.unshift(STATE.generatedDesignBookFile);
  if (!title) return showToast("Design title is required.", TOAST_TYPES.ERROR);
  if (shouldSubmit && !files.length && !fileUrl) return showToast("Choose at least one design file or provide an external reference URL before submission.", TOAST_TYPES.ERROR);
  const invalid = validateDesignFiles(files);
  if (invalid) return showToast(invalid, TOAST_TYPES.ERROR);
  STATE.busy = true; render();
  let resultMessage = shouldSubmit ? "Design revision submitted to staff for review." : "Design draft saved.";
  let resultType = TOAST_TYPES.SUCCESS;
  try {
    const token = getArchitectPortalSession()?.sessionToken;
    const { data, error } = await client.rpc("interiors_architect_portal_save_design_draft", {
      p_session_token: getArchitectPortalSession()?.sessionToken,
      p_project_id: STATE.activeProjectId,
      p_design_title: title,
      p_description: description,
      p_file_url: fileUrl,
      p_design_id: null
    });
    if (error) throw error;
    const revision = Array.isArray(data) ? data[0] : data;
    if (!revision?.design_id) throw new Error("The design revision was created without an upload reference.");
    const failures = [];
    for (const file of files) {
      try {
        await uploadInteriorsArchitectDesignToDrive({
          sessionToken: token,
          projectId: STATE.activeProjectId,
          designId: revision.design_id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          date: new Date().toISOString().slice(0, 10)
        }, await fileToBase64(file));
      } catch (uploadError) {
        failures.push(`${file.name}: ${uploadError?.message || "upload failed"}`);
      }
    }
    if (shouldSubmit && !failures.length) {
      const { error: submitError } = await client.rpc("interiors_architect_portal_submit_saved_design", {
        p_session_token: token,
        p_design_id: revision.design_id
      });
      if (submitError) throw submitError;
    }
    await Promise.all([loadContext(), loadProject()]);
    if (!failures.length) STATE.generatedDesignBookFile = null;
    if (failures.length) {
      resultMessage = `${files.length - failures.length} of ${files.length} file(s) uploaded. ${failures.join("; ")}`;
      resultType = TOAST_TYPES.WARNING || TOAST_TYPES.ERROR;
    } else if (files.length) {
      resultMessage = shouldSubmit
        ? `${files.length} file(s) securely uploaded and submitted to staff review.`
        : `${files.length} file(s) securely uploaded to the saved draft.`;
    }
  } catch (e) {
    resultMessage = e.message || "Design submission failed.";
    resultType = TOAST_TYPES.ERROR;
  } finally {
    STATE.busy = false;
    render();
    showToast(resultMessage, resultType);
  }
}

function validateDesignFiles(files) {
  const allowed = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "dwg", "dxf", "skp", "rvt", "rfa", "ifc", "3ds", "obj", "stl", "step", "stp", "zip"]);
  for (const file of files) {
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    if (!allowed.has(extension)) return `${file.name} is not an accepted design file.`;
    if (!file.size || file.size > 10 * 1024 * 1024) return `${file.name} must be 10 MB or smaller.`;
  }
  return "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const CSS = `
  :root{--ap-gold:#d8b65c;--ap-gold2:#f1d787;--ap-bg:#05070b;--ap-panel:#0b0e14;--ap-line:rgba(216,182,92,.22);--ap-text:#f4f1e8;--ap-muted:#8993a5}*{box-sizing:border-box}.ap-loading{min-height:100vh;display:grid;place-content:center;text-align:center;background:#05070b;color:#f4f1e8}.ap-loading strong,.ap-loading p{color:#d8b65c}.ap-shell{min-height:100vh;background:var(--ap-bg);color:var(--ap-text);display:grid;grid-template-columns:270px 1fr}.ap-sidebar{position:sticky;top:0;height:100vh;border-right:1px solid var(--ap-line);padding:1.4rem 1rem;display:flex;flex-direction:column;background:linear-gradient(180deg,#090c12,#05070b)}.ap-brand{display:flex;align-items:center;gap:.8rem;padding:.3rem .5rem 1.4rem;border-bottom:1px solid rgba(255,255,255,.07)}.ap-brand img{width:45px;height:45px;object-fit:contain}.ap-brand strong{display:block;letter-spacing:.2em;font-size:.78rem;color:#fff}.ap-brand small{display:block;letter-spacing:.2em;color:var(--ap-gold);font-size:.62rem;margin-top:.2rem}.ap-nav-title{font-size:.62rem;letter-spacing:.2em;color:#657186;margin:1.45rem .55rem .7rem}.ap-sidebar nav{display:grid;gap:.28rem}.ap-sidebar nav button{border:1px solid transparent;background:transparent;color:#b7c0cf;border-radius:12px;padding:.75rem;display:flex;align-items:center;gap:.72rem;text-align:left;cursor:pointer}.ap-sidebar nav button span{width:31px;height:31px;border:1px solid rgba(216,182,92,.2);border-radius:9px;display:grid;place-content:center;color:var(--ap-gold);font-size:.68rem}.ap-sidebar nav button.active{background:linear-gradient(90deg,rgba(216,182,92,.14),rgba(216,182,92,.04));border-color:rgba(216,182,92,.35);color:#fff;box-shadow:inset 3px 0 var(--ap-gold)}.ap-sidebar footer{margin-top:auto;border-top:1px solid rgba(255,255,255,.07);padding:.9rem .45rem 0;display:grid;grid-template-columns:auto 1fr auto;gap:.65rem;align-items:center}.ap-sidebar footer b,.ap-sidebar footer small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:135px}.ap-sidebar footer small{color:var(--ap-muted);font-size:.7rem}.ap-sidebar footer button{background:none;border:0;color:var(--ap-gold);font-size:1.1rem;cursor:pointer}.ap-avatar,.ap-project-mark{width:36px;height:36px;border-radius:11px;display:grid;place-content:center;background:rgba(216,182,92,.12);border:1px solid rgba(216,182,92,.28);color:var(--ap-gold2);font-weight:800}.ap-main{min-width:0}.ap-top{height:110px;padding:1.3rem 2rem;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between}.ap-top small,.ap-panel header small,.ap-hero span,.ap-picker small{font-size:.64rem;letter-spacing:.18em;color:var(--ap-gold);font-weight:800}.ap-top h1{margin:.25rem 0 0;font-family:Georgia,serif;font-size:2rem}.ap-top>span{color:var(--ap-muted);font-size:.75rem}.ap-top>span i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#46d889;box-shadow:0 0 10px #46d889;margin-right:.4rem}.ap-content{padding:1.7rem 2rem 3rem;max-width:1500px;margin:0 auto}.ap-hero,.ap-panel,.ap-picker,.ap-metric{border:1px solid var(--ap-line);background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012));border-radius:20px}.ap-hero{padding:2rem;display:grid;grid-template-columns:1fr auto;gap:2rem;align-items:center;overflow:hidden;position:relative}.ap-hero:after{content:"";position:absolute;width:300px;height:300px;border:1px solid rgba(216,182,92,.12);border-radius:50%;right:-120px;top:-130px}.ap-hero h2{font-family:Georgia,serif;font-size:2.65rem;margin:.55rem 0}.ap-hero p{color:#a6afbd;max-width:760px;line-height:1.65}.ap-hero aside{border-left:1px solid var(--ap-line);padding:1rem 2rem;min-width:170px}.ap-hero aside>*{display:block}.ap-hero aside strong{font-family:Georgia,serif;font-size:2.4rem;color:var(--ap-gold2);margin:.35rem 0}.ap-hero aside span{font-size:.72rem;color:var(--ap-muted);letter-spacing:normal}.ap-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem;margin:1rem 0}.ap-metric{padding:1.1rem}.ap-metric>*{display:block}.ap-metric small{color:#8d98aa}.ap-metric strong{font-family:Georgia,serif;color:#fff;font-size:1.65rem;margin:.38rem 0}.ap-metric span{font-size:.68rem;color:#657186}.ap-split{display:grid;grid-template-columns:1.55fr 1fr;gap:1rem;margin-top:1rem}.ap-panel{padding:1.1rem;margin-top:1rem;min-width:0}.ap-split>.ap-panel{margin-top:0}.ap-panel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.ap-panel h3{font-family:Georgia,serif;font-size:1.35rem;margin:.22rem 0}.ap-panel header>button,.ap-panel header>span{background:none;border:0;color:#93a5c1;font-size:.72rem}.ap-project-list{display:grid;gap:.55rem}.ap-project{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.8rem;text-align:left;padding:.75rem;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:#090c12;color:#fff;cursor:pointer}.ap-project.active{border-color:rgba(216,182,92,.5);background:rgba(216,182,92,.07)}.ap-project-copy b,.ap-project-copy small,.ap-project-side>*{display:block}.ap-project-copy small{color:#7f8b9f;font-size:.72rem;margin:.25rem 0 .45rem}.ap-project-copy i{display:block;height:5px;background:#151b25;border-radius:99px;overflow:hidden}.ap-project-copy i span{display:block;height:100%;background:linear-gradient(90deg,#b58a2d,#f1d787)}.ap-project-side{text-align:right}.ap-project-side em,.ap-record em,.ap-line em,.ap-status{font-style:normal;font-size:.64rem;color:var(--ap-gold2);border:1px solid rgba(216,182,92,.26);border-radius:99px;padding:.22rem .45rem}.ap-project-side b{margin-top:.45rem}.ap-pulse,.ap-line{display:flex;gap:.8rem;align-items:center;padding:.8rem 0;border-bottom:1px solid rgba(255,255,255,.06)}.ap-pulse>span{width:42px;height:42px;border:1px solid var(--ap-line);border-radius:12px;display:grid;place-content:center;color:var(--ap-gold);font-size:.68rem}.ap-pulse b,.ap-pulse small,.ap-line b,.ap-line small{display:block}.ap-pulse small,.ap-line small{color:var(--ap-muted);font-size:.72rem;margin-top:.25rem}.ap-empty{border:1px dashed rgba(216,182,92,.2);border-radius:14px;padding:2rem;text-align:center;color:#778399}.ap-picker{padding:.9rem 1rem;display:flex;justify-content:space-between;align-items:end;margin-bottom:1rem}.ap-picker label{font-size:.72rem;color:#9aa5b6}.ap-picker select,.ap-form input,.ap-form textarea{display:block;margin-top:.35rem;background:#07090e;border:1px solid rgba(216,182,92,.22);border-radius:10px;color:#fff;padding:.72rem;width:100%}.ap-picker select{min-width:360px}.ap-picker div>*{display:block;text-align:right}.ap-picker div b{margin-top:.25rem}.ap-info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem;margin:1rem 0}.ap-info-grid>div{padding:.8rem;border:1px solid rgba(255,255,255,.07);border-radius:12px}.ap-info-grid small,.ap-info-grid b{display:block}.ap-info-grid small{color:#738097;font-size:.63rem;text-transform:uppercase;letter-spacing:.12em}.ap-info-grid b{font-size:.8rem;margin-top:.35rem}.ap-detail p{color:#9ba6b8;line-height:1.6}.ap-design-layout{grid-template-columns:.8fr 1.3fr}.ap-form{display:grid;gap:.8rem}.ap-form label{font-size:.75rem;color:#b4bdca}.ap-primary{background:linear-gradient(135deg,#c49b3d,#f1d787);border:0;color:#13100a;font-weight:800;padding:.75rem 1rem;border-radius:10px;cursor:pointer}.ap-upload{position:relative;display:block;border:1px dashed rgba(216,182,92,.38);border-radius:14px;padding:1rem;background:rgba(216,182,92,.055);cursor:pointer}.ap-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;margin:0}.ap-upload span,.ap-upload span>*{display:block}.ap-upload span b{color:var(--ap-gold2);font-size:.84rem}.ap-upload span small{color:var(--ap-muted);font-size:.68rem;margin-top:.3rem}.ap-file-selection{display:grid;gap:.35rem}.ap-file-selection>span{display:flex;justify-content:space-between;gap:.5rem;padding:.45rem .6rem;border:1px solid rgba(255,255,255,.07);border-radius:9px;color:#8d98aa;font-size:.7rem}.ap-file-selection>span b{color:#dce2eb;overflow:hidden;text-overflow:ellipsis}.ap-drive-route{padding:.7rem;border-left:2px solid var(--ap-gold);background:rgba(216,182,92,.06)}.ap-drive-route>*{display:block}.ap-drive-route b{font-size:.72rem;color:var(--ap-gold2)}.ap-drive-route span{font-size:.66rem;color:var(--ap-muted);margin-top:.25rem}.ap-file-links{display:grid;gap:.35rem;margin-top:.7rem}.ap-file-links a{display:flex;justify-content:space-between;gap:.6rem;padding:.55rem .65rem;border:1px solid rgba(216,182,92,.18);border-radius:9px;color:#dfe6f1;text-decoration:none}.ap-file-links a:hover{border-color:var(--ap-gold)}.ap-file-links a b{font-size:.7rem;overflow:hidden;text-overflow:ellipsis}.ap-file-links a small{font-size:.62rem;color:var(--ap-gold);white-space:nowrap}.ap-record{display:grid;grid-template-columns:1fr auto;gap:1rem;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:1rem;margin:.55rem 0;background:#080b10}.ap-record h4{margin:.35rem 0}.ap-record p{color:#8e99aa;font-size:.78rem}.ap-record>div>span{color:var(--ap-gold);font-size:.68rem}.ap-record aside{text-align:right}.ap-record aside>*{display:block;margin-bottom:.45rem}.ap-record aside a{color:#d8b65c;font-size:.72rem}.ap-record footer{grid-column:1/-1;border-top:1px solid rgba(255,255,255,.06)}.ap-line{justify-content:space-between}.ap-line aside{text-align:right}.ap-line aside>*{display:block;margin-bottom:.25rem}.ap-timeline article{display:grid;grid-template-columns:65px 1fr;gap:1rem;padding:1rem 0;border-bottom:1px solid rgba(255,255,255,.07)}.ap-timeline article>span{color:var(--ap-gold2);font-family:Georgia,serif;font-size:1.3rem}.ap-timeline h4{margin:.25rem 0}.ap-timeline p{color:#8995a7}.ap-foot{text-align:center;color:#4e596b;font-size:.65rem;padding:1.5rem}.ap-query{margin-bottom:1rem}@media(max-width:1000px){.ap-shell{grid-template-columns:82px 1fr}.ap-brand div,.ap-nav-title,.ap-sidebar nav button:not(.active){font-size:0}.ap-sidebar nav button{justify-content:center}.ap-sidebar footer div:not(.ap-avatar),.ap-sidebar footer button{display:none}.ap-metrics{grid-template-columns:repeat(2,1fr)}.ap-split{grid-template-columns:1fr}.ap-info-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.ap-shell{display:block}.ap-sidebar{position:static;width:100%;height:auto}.ap-sidebar nav{grid-template-columns:repeat(4,1fr)}.ap-sidebar nav button{font-size:0}.ap-sidebar footer{display:none}.ap-top,.ap-content{padding-left:1rem;padding-right:1rem}.ap-hero{grid-template-columns:1fr}.ap-hero h2{font-size:2rem}.ap-hero aside{border-left:0;border-top:1px solid var(--ap-line)}.ap-metrics{grid-template-columns:1fr 1fr}.ap-picker{display:block}.ap-picker select{min-width:0}.ap-picker div{margin-top:.8rem}.ap-info-grid{grid-template-columns:1fr}.ap-project-side{display:none}}
`;

async function init() {
  STATE.session = await requireArchitectPortalSession();
  if (!STATE.session) return;
  await loadContext();
  if (STATE.activeProjectId) await loadProject();
  render();
  await enforceTermsAcceptance();
  await initLiveChat();
}

init().catch((error) => {
  console.error(error);
  document.querySelector("#app").innerHTML = `<main class="ap-loading"><strong>VARADA NEXUS</strong><h1>Architect workspace unavailable</h1><p>${esc(error?.message || "Please contact the project administrator.")}</p><a class="btn" href="${ROUTES.LOGIN}">Return to login</a></main>`;
});
