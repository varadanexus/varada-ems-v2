import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import { uploadInteriorsDocumentToDrive } from "./drive-api.js";
import { notifyInteriorsWhatsAppSafely } from "./interiors-whatsapp-api.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  projects: [],
  designs: [],
  documents: [],
  selectedProjectId: "",
  isSaving: false,
  isUploadingLibrary: false,
  isPreviewingDocument: false
};

let documentPreviewObjectUrl = null;

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_DESIGNS,
    pageTitle: "Designs",
    pageDescription: "Manage design versions and client approval workflow for interior projects.",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;

  PAGE_STATE.boot = boot;
  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, designsRes, documentsRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_clients(client_name)").order("project_name"),
    client.from("interior_designs").select("*").order("uploaded_at", { ascending: false }),
    client.from("drive_documents").select("id,category,document_type,entity_type,entity_id,document_no,file_name,mime_type,file_size,web_view_link,upload_status,created_at").in("category", ["INTERIORS_DESIGN", "INTERIORS_DOCUMENT"]).is("deleted_at", null).order("created_at", { ascending: false })
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (designsRes.error) throw designsRes.error;
  if (documentsRes.error) throw documentsRes.error;

  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id).map((row) => ({
    interior_project_id: row.id,
    shared_project_id: row.shared_project_id,
    project_code: row.project_code,
    project_name: row.project_name,
    project_title: row.project_title,
    client_name: row.interior_clients?.client_name || null
  }));
  PAGE_STATE.designs = designsRes.data || [];
  PAGE_STATE.documents = documentsRes.data || [];
}

function resolveNextVersionNo(projectId) {
  const versionNumbers = PAGE_STATE.designs
    .filter((row) => String(row.project_id) === String(projectId))
    .map((row) => Number(row.version_no || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return versionNumbers.length ? Math.max(...versionNumbers) + 1 : 1;
}

function resolveProjectByAnyId(projectId) {
  return PAGE_STATE.projects.find((row) => String(row.interior_project_id) === String(projectId) || String(row.shared_project_id) === String(projectId)) || null;
}

function resolveSelectedSharedProjectId() {
  return resolveProjectByAnyId(PAGE_STATE.selectedProjectId)?.shared_project_id || "";
}

function render() {
  const selectedSharedProjectId = resolveSelectedSharedProjectId();
  const rows = PAGE_STATE.designs.filter((row) => !selectedSharedProjectId || String(row.project_id) === String(selectedSharedProjectId));
  renderModuleContent(`
    <section class="card">
      <style>
        .ds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.ds-grid .full{grid-column:1/-1}
        .ds-grid label{display:block;font-weight:600;margin-bottom:.35rem}.ds-grid input,.ds-grid select,.ds-grid textarea{width:100%}
        .interior-upload{border:1px dashed rgba(213,176,92,.48);border-radius:14px;padding:1rem;background:linear-gradient(135deg,rgba(213,176,92,.08),rgba(255,255,255,.015))}
        .interior-upload input[type=file]{padding:.72rem;background:rgba(0,0,0,.22)}.interior-upload small{display:block;margin-top:.45rem;color:var(--muted)}
        .file-links{display:flex;flex-wrap:wrap;gap:.35rem}.file-links a,.file-links button{max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .interiors-doc-modal{position:fixed;inset:0;z-index:10050;display:none;place-items:center;padding:1.25rem;background:rgba(0,0,0,.86);backdrop-filter:blur(7px)}
        .interiors-doc-modal.visible{display:grid}.interiors-doc-dialog{width:min(1180px,96vw);height:min(900px,92vh);display:flex;flex-direction:column;border:1px solid rgba(213,176,92,.42);border-radius:18px;background:#090b0f;box-shadow:0 28px 90px rgba(0,0,0,.65);overflow:hidden}
        .interiors-doc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1rem;border-bottom:1px solid rgba(213,176,92,.22)}
        .interiors-doc-toolbar strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.interiors-doc-actions{display:flex;gap:.5rem;flex-shrink:0}
        .interiors-doc-stage{position:relative;flex:1;min-height:0;background:#15171c}.interiors-doc-stage iframe{width:100%;height:100%;border:0;background:#fff}.interiors-doc-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-weight:700;letter-spacing:.02em}
        @media (max-width:980px){.ds-grid{grid-template-columns:1fr}}
      </style>
      <h3>Designs</h3>
      <p class="muted">Client design reviews move from draft to submitted, approved, rejected, or revision requested.</p>
      <div class="ds-grid" style="margin-top:1rem;">
        <div><label for="designProjectId">Project *</label><select id="designProjectId"><option value="">All Projects</option>${PAGE_STATE.projects.map((row) => `<option value="${row.interior_project_id}" ${String(PAGE_STATE.selectedProjectId) === String(row.interior_project_id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="designVersionNo">Design Version *</label><input id="designVersionNo" type="number" min="1" step="1" value="1" /></div>
        <div><label for="designTitle">Title *</label><input id="designTitle" type="text" maxlength="200" /></div>
        <div><label for="designStatus">Status *</label><select id="designStatus">${renderOptions(["draft", "submitted"], "draft")}</select><small>Staff review decisions are recorded after submission.</small></div>
        <div class="full"><label for="designDescription">Description</label><textarea id="designDescription" rows="3"></textarea></div>
        <div class="full interior-upload"><label for="designFiles">Design Files</label><input id="designFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.dwg,.dxf,.skp,.rvt,.rfa,.ifc,.3ds,.obj,.stl,.step,.stp,.zip" /><small>Select multiple drawings, renders, CAD/BIM models, PDFs, images, or a ZIP package. Each file can be up to 10 MB.</small></div>
        <div class="full"><label for="designFileUrl">External Reference URL <span class="muted">(optional)</span></label><input id="designFileUrl" type="url" placeholder="https://..." /></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <button class="btn" id="uploadDesignBtn" type="button">Upload Design</button>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Design Versions</h4>
      <div class="table-container"><table><thead><tr><th>Project</th><th>Design Version</th><th>Title</th><th>Status</th><th>Uploaded Date</th><th>Actions</th></tr></thead><tbody>
      ${rows.length ? rows.map((row) => `<tr>
        <td>${escapeHtml(projectName(row.project_id))}</td>
        <td>Version ${escapeHtml(String(row.version_no || 1))}</td>
        <td><strong>${escapeHtml(row.design_title || "-")}</strong>${row.description ? `<br/><span class="muted">${escapeHtml(row.description)}</span>` : ""}</td>
        <td><span class="badge">${escapeHtml(row.status || "draft")}</span></td>
        <td>${formatDateTime(row.uploaded_at)}</td>
        <td>
          ${renderDesignFiles(row)}
          ${row.status === "draft" ? `<button class="btn btn-sm" data-design-submit="${row.id}" type="button">Submit For Approval</button>` : ""}
          ${row.status === "submitted" ? `<button class="btn btn-sm" data-design-approve="${row.id}" type="button">Approve</button> <button class="btn btn-sm" data-design-revision="${row.id}" type="button">Request Changes</button> <button class="btn btn-sm btn-danger" data-design-reject="${row.id}" type="button">Reject</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No designs found.</td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Project Document Library</h4>
      <p class="muted">Store client briefs, site measurements, specifications, reference drawings, and other project documents in the dedicated Interiors Drive archive.</p>
      <div class="ds-grid" style="margin-top:1rem;">
        <div><label for="libraryProjectId">Project *</label><select id="libraryProjectId"><option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.interior_project_id}" ${String(PAGE_STATE.selectedProjectId) === String(row.interior_project_id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="libraryDocumentType">Document Type *</label><select id="libraryDocumentType">${renderOptions(["Client Brief", "Site Measurement", "Working Drawing", "Material Specification", "Reference", "Contract", "Other"], "Client Brief")}</select></div>
        <div class="full interior-upload"><label for="libraryFiles">Documents *</label><input id="libraryFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.dwg,.dxf,.skp,.rvt,.rfa,.ifc,.3ds,.obj,.stl,.step,.stp,.zip,.doc,.docx,.xls,.xlsx,.csv,.txt" /><small>Choose one or several files. They will be sorted by client, upload date, project, and document type.</small></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="uploadLibraryBtn" type="button">Upload Project Documents</button></div>
      <div class="table-container" style="margin-top:1rem;"><table><thead><tr><th>Project</th><th>Type</th><th>File</th><th>Uploaded</th></tr></thead><tbody>${renderLibraryRows()}</tbody></table></div>
    </section>
    <div class="interiors-doc-modal" id="interiorsDocumentModal" role="dialog" aria-modal="true" aria-labelledby="interiorsDocumentTitle" aria-hidden="true">
      <div class="interiors-doc-dialog">
        <div class="interiors-doc-toolbar">
          <strong id="interiorsDocumentTitle">Document preview</strong>
          <div class="interiors-doc-actions">
            <a class="btn btn-sm" id="interiorsDocumentDownload" href="#" download style="display:none;">Download</a>
            <button class="btn btn-sm" id="interiorsDocumentClose" type="button">✕ Close</button>
          </div>
        </div>
        <div class="interiors-doc-stage">
          <div class="interiors-doc-loading" id="interiorsDocumentLoading">Loading secure document…</div>
          <iframe id="interiorsDocumentFrame" src="" title="Document preview" style="display:none;"></iframe>
        </div>
      </div>
    </div>
  `);
}

function bindEvents() {
  document.getElementById("designProjectId")?.addEventListener("change", (event) => {
    PAGE_STATE.selectedProjectId = event.target.value || "";
    render();
    bindEvents();
    syncSuggestedVersion();
  });
  document.getElementById("uploadDesignBtn")?.addEventListener("click", createDesign);
  document.getElementById("uploadLibraryBtn")?.addEventListener("click", uploadProjectDocuments);
  document.querySelectorAll("[data-design-submit]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designSubmit, "submitted")));
  document.querySelectorAll("[data-design-approve]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designApprove, "approved")));
  document.querySelectorAll("[data-design-revision]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designRevision, "revision_requested")));
  document.querySelectorAll("[data-design-reject]").forEach((btn) => btn.addEventListener("click", () => updateDesignStatus(btn.dataset.designReject, "rejected")));
  document.querySelectorAll("[data-drive-document-id]").forEach((btn) => btn.addEventListener("click", () => openStoredDocument(btn.dataset.driveDocumentId, btn.dataset.driveDocumentName)));
  document.getElementById("interiorsDocumentClose")?.addEventListener("click", closeStoredDocument);
  document.getElementById("interiorsDocumentModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeStoredDocument();
  });
}

function closeStoredDocument() {
  const modal = document.getElementById("interiorsDocumentModal");
  const frame = document.getElementById("interiorsDocumentFrame");
  const download = document.getElementById("interiorsDocumentDownload");
  modal?.classList.remove("visible");
  modal?.setAttribute("aria-hidden", "true");
  if (frame) { frame.src = ""; frame.style.display = "none"; }
  if (download) { download.href = "#"; download.style.display = "none"; }
  if (documentPreviewObjectUrl) {
    URL.revokeObjectURL(documentPreviewObjectUrl);
    documentPreviewObjectUrl = null;
  }
}

async function openStoredDocument(documentId, fileName = "Interiors document") {
  if (!documentId || PAGE_STATE.isPreviewingDocument) return;
  const modal = document.getElementById("interiorsDocumentModal");
  const frame = document.getElementById("interiorsDocumentFrame");
  const title = document.getElementById("interiorsDocumentTitle");
  const loading = document.getElementById("interiorsDocumentLoading");
  const download = document.getElementById("interiorsDocumentDownload");
  if (!modal || !frame) return;
  closeStoredDocument();
  PAGE_STATE.isPreviewingDocument = true;
  if (title) title.textContent = fileName || "Interiors document";
  if (loading) loading.style.display = "grid";
  modal.classList.add("visible");
  modal.setAttribute("aria-hidden", "false");
  try {
    const { data, error } = await client.functions.invoke("drive-integrations", {
      body: { action: "preview_interiors_staff_document", documentId }
    });
    if (error) {
      let message = error.message || "The document could not be opened.";
      if (error.context && typeof error.context.json === "function") {
        const details = await error.context.json().catch(() => null);
        if (details?.error) message = details.error;
      }
      throw new Error(message);
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: "application/octet-stream" });
    documentPreviewObjectUrl = URL.createObjectURL(blob);
    frame.src = documentPreviewObjectUrl;
    frame.style.display = "block";
    if (download) {
      download.href = documentPreviewObjectUrl;
      download.download = fileName || "interiors-document";
      download.style.display = "inline-flex";
    }
    if (loading) loading.style.display = "none";
  } catch (error) {
    closeStoredDocument();
    showToast(error?.message || "The document could not be opened.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isPreviewingDocument = false;
  }
}

function syncSuggestedVersion() {
  const projectId = resolveProjectByAnyId(document.getElementById("designProjectId")?.value || "")?.shared_project_id || "";
  const versionInput = document.getElementById("designVersionNo");
  if (!versionInput || !projectId) return;
  versionInput.value = String(resolveNextVersionNo(projectId));
}

async function createDesign() {
  if (PAGE_STATE.isSaving) return;
  const selectedProject = resolveProjectByAnyId(document.getElementById("designProjectId")?.value || "");
  const projectId = selectedProject?.shared_project_id || "";
  const title = String(document.getElementById("designTitle")?.value || "").trim();
  const versionNo = Number(document.getElementById("designVersionNo")?.value || 0);
  const status = document.getElementById("designStatus")?.value || "draft";
  const description = optionalValue("designDescription");
  const fileUrl = optionalValue("designFileUrl");
  const files = Array.from(document.getElementById("designFiles")?.files || []);
  if (!projectId || !title || !versionNo) {
    showToast("Project, design version, and title are required.", TOAST_TYPES.ERROR);
    return;
  }
  if (!files.length && !fileUrl) {
    showToast("Choose at least one design file or provide an external reference URL.", TOAST_TYPES.ERROR);
    return;
  }
  const fileError = validateSelectedFiles(files);
  if (fileError) return showToast(fileError, TOAST_TYPES.ERROR);

  PAGE_STATE.isSaving = true;
  try {
    const { data: design, error } = await client.from("interior_designs").insert({
      project_id: projectId,
      version_no: versionNo,
      design_title: title,
      description,
      file_url: fileUrl,
      status,
      uploaded_by: PAGE_STATE.boot?.appUser?.id || null,
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    }).select("id").single();
    if (error) throw error;
    const uploaded = [];
    const failed = [];
    for (const file of files) {
      try {
        const result = await uploadInteriorsDocumentToDrive({
          category: "INTERIORS_DESIGN",
          projectId,
          entityId: design.id,
          documentType: "Design",
          documentNo: `${selectedProject?.project_code || "DESIGN"}-V${versionNo}`,
          date: new Date().toISOString().slice(0, 10),
          versionNo,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream"
        }, await fileToBase64(file));
        uploaded.push(result);
      } catch (uploadError) {
        failed.push(`${file.name}: ${uploadError?.message || "upload failed"}`);
      }
    }
    const primaryUrl = uploaded.find((item) => item?.webViewLink)?.webViewLink || fileUrl;
    if (primaryUrl && primaryUrl !== fileUrl) {
      const { error: linkError } = await client.from("interior_designs").update({ file_url: primaryUrl }).eq("id", design.id);
      if (linkError) throw linkError;
    }
    await notifyInteriorsWhatsAppSafely("design_uploaded", design.id);
    if (status === "submitted") await notifyInteriorsWhatsAppSafely("design_approval", design.id);
    showToast(failed.length
      ? `Design saved. ${uploaded.length} file(s) uploaded; ${failed.length} failed.`
      : `Design saved with ${uploaded.length || 1} file reference(s).`, failed.length ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
    syncSuggestedVersion();
  } catch (error) {
    const message = error?.message || "Failed to upload design.";
    if (String(message).toLowerCase().includes("uq_interior_designs_project_version") || String(message).toLowerCase().includes("duplicate key value")) {
      showToast("Design version already exists for this project. Use the suggested next version number.", TOAST_TYPES.ERROR);
      syncSuggestedVersion();
      return;
    }
    showToast(message, TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSaving = false;
  }
}

async function uploadProjectDocuments() {
  if (PAGE_STATE.isUploadingLibrary) return;
  const selectedProject = resolveProjectByAnyId(document.getElementById("libraryProjectId")?.value || "");
  const projectId = selectedProject?.shared_project_id || "";
  const documentType = String(document.getElementById("libraryDocumentType")?.value || "General").trim();
  const files = Array.from(document.getElementById("libraryFiles")?.files || []);
  if (!projectId || !documentType || !files.length) return showToast("Project, document type, and at least one file are required.", TOAST_TYPES.ERROR);
  const fileError = validateSelectedFiles(files);
  if (fileError) return showToast(fileError, TOAST_TYPES.ERROR);

  PAGE_STATE.isUploadingLibrary = true;
  try {
    let uploaded = 0;
    const failures = [];
    for (const file of files) {
      try {
        await uploadInteriorsDocumentToDrive({
          category: "INTERIORS_DOCUMENT",
          projectId,
          entityId: projectId,
          documentType,
          documentNo: documentType,
          date: new Date().toISOString().slice(0, 10),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream"
        }, await fileToBase64(file));
        uploaded += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error?.message || "upload failed"}`);
      }
    }
    showToast(failures.length ? `${uploaded} document(s) uploaded; ${failures.length} failed.` : `${uploaded} document(s) uploaded to the Interiors archive.`, failures.length ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } finally {
    PAGE_STATE.isUploadingLibrary = false;
  }
}

async function updateDesignStatus(id, status) {
  if (!id) return;
  try {
    let response;
    if (["approved", "rejected", "revision_requested"].includes(status)) {
      const action = status === "approved" ? "approve" : status === "rejected" ? "reject" : "revision_requested";
      const remarks = status === "approved"
        ? (window.prompt("Optional review note:", "") || "").trim()
        : (window.prompt("Add the reason or required changes:", "") || "").trim();
      if (status !== "approved" && !remarks) {
        showToast("A review note is required for rejection or revision.", TOAST_TYPES.ERROR);
        return;
      }
      response = await client.rpc("interiors_staff_review_design", {
        p_design_id: id,
        p_action: action,
        p_remarks: remarks || null
      });
    } else {
      response = await client.from("interior_designs").update({ status, updated_by: PAGE_STATE.boot?.appUser?.id || null }).eq("id", id);
    }
    const { error } = response;
    if (error) throw error;
    await notifyInteriorsWhatsAppSafely(status === "submitted" ? "design_approval" : "design_status", id);
    showToast(`Design marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to set design status to ${status}.`, TOAST_TYPES.ERROR);
  }
}

function renderDesignFiles(design) {
  const stored = PAGE_STATE.documents.filter((row) => row.category === "INTERIORS_DESIGN" && String(row.entity_id) === String(design.id) && row.upload_status === "stored" && row.web_view_link);
  const links = stored.map((row) => `<button class="btn btn-sm" data-drive-document-id="${escapeHtml(row.id)}" data-drive-document-name="${escapeHtml(row.file_name || "Design file")}" type="button" title="${escapeHtml(row.file_name || "Design file")}">${escapeHtml(row.file_name || "Open file")}</button>`);
  if (design.file_url && !stored.some((row) => row.web_view_link === design.file_url)) {
    links.push(`<a class="btn btn-sm" href="${escapeHtml(design.file_url)}" target="_blank" rel="noopener">External reference</a>`);
  }
  return links.length ? `<div class="file-links">${links.join("")}</div>` : `<button class="btn btn-sm" type="button" disabled>No files</button>`;
}

function renderLibraryRows() {
  const selectedProjectId = resolveSelectedSharedProjectId();
  const documents = PAGE_STATE.documents.filter((row) => row.category === "INTERIORS_DOCUMENT" && (!selectedProjectId || String(row.entity_id) === String(selectedProjectId)));
  if (!documents.length) return `<tr><td colspan="4" style="text-align:center;padding:1.5rem;">No project documents uploaded yet.</td></tr>`;
  return documents.map((row) => `<tr>
    <td>${escapeHtml(projectName(row.entity_id))}</td>
    <td>${escapeHtml(row.document_type || "General")}</td>
    <td>${row.web_view_link ? `<button class="btn btn-sm" data-drive-document-id="${escapeHtml(row.id)}" data-drive-document-name="${escapeHtml(row.file_name || "Project document")}" type="button">${escapeHtml(row.file_name || "Open file")}</button>` : escapeHtml(row.file_name || "-")}<br/><span class="muted">${formatFileSize(row.file_size)}</span></td>
    <td>${formatDateTime(row.created_at)}</td>
  </tr>`).join("");
}

function validateSelectedFiles(files) {
  if (files.length > 12) return "Upload a maximum of 12 files at a time.";
  const oversized = files.find((file) => Number(file.size || 0) > 10 * 1024 * 1024);
  return oversized ? `${oversized.name} exceeds the 10 MB per-file limit.` : "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "Size unavailable";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function projectName(projectId) {
  const row = resolveProjectByAnyId(projectId);
  return row ? `${row.project_code || ""} - ${row.project_title || row.project_name || "Project"}` : String(projectId || "-");
}

function optionalValue(id) {
  const value = String(document.getElementById(id)?.value || "").trim();
  return value || null;
}

function renderOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load Designs page.", TOAST_TYPES.ERROR);
});
