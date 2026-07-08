import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { escapeHtml, statusPill } from "./legal-workflow-data.js";
import { fetchLegalArchiveFile, listLegalData, rebuildLegalArchiveArtifacts } from "./legal-api.js";
import { showToast } from "./utils.js";
import { TOAST_TYPES } from "../config/constants.js";

const explorerState = {
  rows: [],
  files: [],
  clients: [],
  viewMode: "list",
  path: [],
  previewUrl: null,
  filters: {
    query: "",
    type: "all",
    date: "all",
    sort: "newest"
  }
};

function fileViewUrl(fileId) {
  return fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view` : "";
}

function fileDownloadUrl(fileId) {
  return fileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}` : "";
}

function folderViewUrl(folderId) {
  return folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` : "";
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function parseDateValue(value) {
  const date = value ? new Date(value) : null;
  return Number.isFinite(date?.getTime?.()) ? date : null;
}

function subtypeLabel(agreement = {}) {
  const type = String(agreement.agreement_type || "").toLowerCase();
  if (type.includes("nda") || type.includes("non-disclosure") || type.includes("nondisclosure")) return "NDA";
  if (type.includes("service")) return "Service Agreement";
  if (type.includes("vendor")) return "Vendor Agreement";
  if (type.includes("employment")) return "Employment Agreement";
  if (type.includes("lease") || type.includes("rental")) return "Lease Agreement";
  if (type.includes("terms")) return "Terms and Conditions";
  return agreement.agreement_type || "Agreement";
}

function folderLabel(file, agreement) {
  const kind = String(file.file_kind || "");
  if (["signed_pdf", "draft_pdf", "accepted_agreement", "accepted_agreement_pdf"].includes(kind)) return subtypeLabel(agreement);
  if (["acceptance_certificate", "acceptance_certificate_pdf"].includes(kind)) return "Certificate";
  if (kind === "live_photo") return "Live Photo";
  if (["evidence_json", "evidence_pdf", "provider_payload"].includes(kind)) return "Evidence";
  return "Archive";
}

function kindLabel(fileKind) {
  const labels = {
    signed_pdf: "Executed Agreement PDF",
    draft_pdf: "Draft PDF",
    accepted_agreement_pdf: "Accepted Agreement PDF",
    accepted_agreement: "Accepted Agreement HTML",
    acceptance_certificate_pdf: "Certificate PDF",
    acceptance_certificate: "Certificate HTML",
    evidence_pdf: "Evidence PDF",
    evidence_json: "Evidence JSON",
    live_photo: "Live Photo",
    provider_payload: "Provider Payload"
  };
  return labels[fileKind] || fileKind || "Archive File";
}

function filePreviewType(file = {}) {
  const kind = String(file.file_kind || "");
  if (kind === "evidence_json" || kind === "provider_payload") return "json";
  if (kind === "accepted_agreement" || kind === "acceptance_certificate") return "html";
  if (kind === "live_photo") return "photo";
  return "pdf";
}

function buildFramedHtmlPreview(html = "") {
  const previewSkin = `
    <style>
      html, body {
        margin: 0 !important;
        min-height: 100%;
        background: linear-gradient(180deg, #0c1526 0%, #0a1220 100%) !important;
      }
      body {
        padding: 24px !important;
        box-sizing: border-box;
      }
      body > * {
        max-width: 980px;
        margin-left: auto !important;
        margin-right: auto !important;
        box-sizing: border-box;
      }
    </style>
  `;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${previewSkin}`);
  }

  return `<!doctype html><html><head><meta charset="utf-8">${previewSkin}</head><body>${html}</body></html>`;
}

function previewButton(label, fileId, fileName = "", className = "btn btn-sm") {
  if (!fileId) return "";
  return `<button class="${className}" type="button" data-preview-file="${escapeHtml(fileId)}" data-preview-name="${escapeHtml(fileName || label)}">${escapeHtml(label)}</button>`;
}

function rebuildButton(agreementId) {
  return `<button class="btn btn-sm btn-secondary" type="button" data-rebuild-archive="${escapeHtml(agreementId)}">Rebuild PDFs</button>`;
}

function folderOrder(name) {
  const order = {
    "Service Agreement": 1,
    "Vendor Agreement": 2,
    "Employment Agreement": 3,
    "Lease Agreement": 4,
    "Terms and Conditions": 5,
    "NDA": 6,
    "Certificate": 7,
    "Evidence": 8,
    "Live Photo": 9,
    "Archive": 10
  };
  return order[name] || 99;
}

function artifactLookup(files = []) {
  const map = new Map();
  files.forEach((file) => {
    const key = file.agreement_id || "agreement";
    if (!map.has(key)) map.set(key, {});
    const bucket = map.get(key);
    bucket[file.file_kind] = file;
  });
  return map;
}

function renderArtifactButtons(bucket = {}, type) {
  if (type === "accepted") {
    return `<div class="legal-artifact-actions">${[
      previewButton("View PDF", bucket.accepted_agreement_pdf?.drive_file_id, bucket.accepted_agreement_pdf?.file_name),
      previewButton("HTML", bucket.accepted_agreement?.drive_file_id, bucket.accepted_agreement?.file_name, "btn btn-sm btn-secondary")
    ].filter(Boolean).join("")}</div>`;
  }
  if (type === "evidence") {
    return `<div class="legal-artifact-actions">${[
      previewButton("View PDF", bucket.evidence_pdf?.drive_file_id, bucket.evidence_pdf?.file_name),
      previewButton("JSON", bucket.evidence_json?.drive_file_id, bucket.evidence_json?.file_name, "btn btn-sm btn-secondary")
    ].filter(Boolean).join("")}</div>`;
  }
  if (type === "certificate") {
    return `<div class="legal-artifact-actions">${[
      previewButton("View PDF", bucket.acceptance_certificate_pdf?.drive_file_id, bucket.acceptance_certificate_pdf?.file_name),
      previewButton("HTML", bucket.acceptance_certificate?.drive_file_id, bucket.acceptance_certificate?.file_name, "btn btn-sm btn-secondary")
    ].filter(Boolean).join("")}</div>`;
  }
  return "";
}

function buildExplorer(rows = [], files = []) {
  const agreementMap = new Map(rows.map((row) => [row.id, row]));
  const clientMap = new Map();
  files.forEach((file) => {
    const agreement = agreementMap.get(file.agreement_id) || {};
    const clientName = agreement.party_name || agreement.signer_name || "Unassigned Client";
    const folderName = folderLabel(file, agreement);
    if (!clientMap.has(clientName)) clientMap.set(clientName, {
      id: clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: clientName,
      folders: new Map(),
      filesCount: 0,
      lastUpdated: null
    });
    const client = clientMap.get(clientName);
    client.filesCount += 1;
    client.lastUpdated = !client.lastUpdated || new Date(file.uploaded_at || file.created_at) > new Date(client.lastUpdated)
      ? (file.uploaded_at || file.created_at)
      : client.lastUpdated;

    const folderKey = `${folderName}|${file.drive_folder_id || ""}`;
    if (!client.folders.has(folderKey)) {
      client.folders.set(folderKey, {
        id: folderKey,
        name: folderName,
        folderId: file.drive_folder_id || "",
        files: [],
        lastUpdated: null
      });
    }
    const folder = client.folders.get(folderKey);
    folder.files.push({ ...file, agreement });
    folder.lastUpdated = !folder.lastUpdated || new Date(file.uploaded_at || file.created_at) > new Date(folder.lastUpdated)
      ? (file.uploaded_at || file.created_at)
      : folder.lastUpdated;
  });

  return [...clientMap.values()].map((client) => ({
    ...client,
    folders: [...client.folders.values()]
      .sort((a, b) => {
        const orderDelta = folderOrder(a.name) - folderOrder(b.name);
        return orderDelta || a.name.localeCompare(b.name);
      })
      .map((folder) => ({
        ...folder,
        files: folder.files.sort((a, b) => String(b.uploaded_at || b.created_at || "").localeCompare(String(a.uploaded_at || a.created_at || "")))
      }))
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function breadcrumbItems() {
  const base = [
    { label: "Varada Nexus Docs", level: "root" },
    { label: "EMS Documents", level: "root" },
    { label: "legal", level: "root" }
  ];
  if (explorerState.path[0]) base.push({ label: explorerState.path[0].name, level: "client" });
  if (explorerState.path[1]) base.push({ label: explorerState.path[1].name, level: "folder" });
  return base;
}

function explorerHeaderTitle() {
  if (explorerState.path[1]) return explorerState.path[1].name;
  if (explorerState.path[0]) return explorerState.path[0].name;
  return "legal";
}

function activeClient() {
  return explorerState.path[0] || null;
}

function activeFolder() {
  return explorerState.path[1] || null;
}

function currentExplorerItems() {
  const client = activeClient();
  const folder = activeFolder();
  let items;
  if (!client) {
    items = explorerState.clients.map((item) => ({
      type: "client",
      id: item.id,
      name: item.name,
      subtitle: `${item.folders.length} folder(s)`,
      meta: formatDate(item.lastUpdated),
      count: item.filesCount,
      modifiedAt: item.lastUpdated
    }));
  } else if (!folder) {
    items = client.folders.map((item) => ({
      type: "folder",
      id: item.id,
      name: item.name,
      subtitle: `${item.files.length} file(s)`,
      meta: formatDate(item.lastUpdated),
      count: item.files.length,
      folderId: item.folderId,
      modifiedAt: item.lastUpdated
    }));
  } else {
    items = folder.files.map((file) => ({
      type: "file",
      id: file.drive_file_id,
      name: file.file_name || file.drive_file_id || "Archive file",
      subtitle: kindLabel(file.file_kind),
      meta: formatDate(file.uploaded_at || file.created_at),
      modifiedAt: file.uploaded_at || file.created_at,
      previewType: filePreviewType(file),
      file
    }));
  }

  const query = explorerState.filters.query.trim().toLowerCase();
  const type = explorerState.filters.type;
  const date = explorerState.filters.date;
  const sort = explorerState.filters.sort;
  const now = Date.now();

  items = items.filter((item) => {
    const haystack = `${item.name} ${item.subtitle || ""} ${item.file?.agreement?.agreement_no || ""} ${item.file?.agreement?.title || ""}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;

    if (type !== "all") {
      const itemType = item.type === "file" ? (item.previewType || "file") : item.type;
      if (itemType !== type) return false;
    }

    if (date !== "all") {
      const timestamp = parseDateValue(item.modifiedAt)?.getTime?.();
      if (!timestamp) return false;
      const ageDays = (now - timestamp) / 86400000;
      if (date === "today" && ageDays > 1) return false;
      if (date === "7d" && ageDays > 7) return false;
      if (date === "30d" && ageDays > 30) return false;
      if (date === "90d" && ageDays > 90) return false;
    }

    return true;
  });

  items.sort((a, b) => {
    if (sort === "az") return a.name.localeCompare(b.name);
    if (sort === "za") return b.name.localeCompare(a.name);
    const aTime = parseDateValue(a.modifiedAt)?.getTime?.() || 0;
    const bTime = parseDateValue(b.modifiedAt)?.getTime?.() || 0;
    return sort === "oldest" ? aTime - bTime : bTime - aTime;
  });

  return items;
}

function renderBreadcrumbs() {
  return breadcrumbItems().map((item, index, array) => {
    const target = index === 0 || index === 1 || index === 2
      ? ""
      : `data-path-index="${index - 3}"`;
    const clickable = index >= 3;
    return `
      <span class="legal-crumb-wrap">
        ${clickable
          ? `<button class="legal-crumb" type="button" ${target}>${escapeHtml(item.label)}</button>`
          : `<span class="legal-crumb legal-crumb-static">${escapeHtml(item.label)}</span>`}
        ${index < array.length - 1 ? `<span class="legal-crumb-sep">›</span>` : ""}
      </span>
    `;
  }).join("");
}

function renderExplorerItems(items = []) {
  if (!items.length) {
    return `<div class="legal-explorer-empty">No archive items found.</div>`;
  }

  const gridClass = explorerState.viewMode === "grid" ? "is-grid" : "is-list";
  return `
    <div class="legal-explorer-items ${gridClass}">
      ${items.map((item) => {
        if (item.type === "file") {
          return `
            <article class="legal-explorer-item legal-explorer-file">
              <button class="legal-explorer-main" type="button" data-preview-file="${escapeHtml(item.file.drive_file_id || "")}" data-preview-name="${escapeHtml(item.name)}">
                <span class="legal-explorer-icon">📄</span>
                <span class="legal-explorer-copy">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${escapeHtml(item.subtitle)}</span>
                </span>
              </button>
              <div class="legal-explorer-meta">
                <span>${escapeHtml(item.meta)}</span>
                <div class="legal-artifact-actions">
                  ${previewButton("Preview", item.file.drive_file_id, item.name)}
                  <a class="btn btn-sm btn-secondary" href="${fileDownloadUrl(item.file.drive_file_id)}" target="_blank" rel="noreferrer">Download</a>
                </div>
              </div>
            </article>
          `;
        }

        return `
          <article class="legal-explorer-item legal-explorer-folder">
            <button class="legal-explorer-main" type="button" data-open-node="${escapeHtml(item.id)}" data-node-type="${escapeHtml(item.type)}">
              <span class="legal-explorer-icon">${item.type === "client" ? "🗂" : "📁"}</span>
              <span class="legal-explorer-copy">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.subtitle)}</span>
              </span>
            </button>
            <div class="legal-explorer-meta">
              <span>${escapeHtml(item.meta)}</span>
              <div class="legal-explorer-meta-right">
                <span class="meta-pill">${escapeHtml(String(item.count || 0))}</span>
                ${item.folderId ? `<a class="btn btn-sm btn-secondary" href="${folderViewUrl(item.folderId)}" target="_blank" rel="noreferrer">Open Folder</a>` : ""}
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderDriveExplorer() {
  const items = currentExplorerItems();
  const folder = activeFolder();
  const client = activeClient();
  const scopeLabel = folder
    ? `${folder.files.length} files`
    : client
      ? `${client.folders.length} folders`
      : `${explorerState.clients.length} client folders`;

  return `
    <section class="card legal-drive-explorer-shell" style="margin-top:1rem;">
      <div class="legal-drive-topbar">
        <div class="legal-drive-breadcrumbs">${renderBreadcrumbs()}</div>
        <div class="legal-drive-controls">
          <button class="legal-view-toggle ${explorerState.viewMode === "list" ? "is-active" : ""}" type="button" data-view-mode="list">☰</button>
          <button class="legal-view-toggle ${explorerState.viewMode === "grid" ? "is-active" : ""}" type="button" data-view-mode="grid">▦</button>
        </div>
      </div>
      <div class="legal-drive-filterbar">
        <label class="legal-filter-search">
          <span class="sr-only">Search archive</span>
          <input type="search" placeholder="Search client, folder, file, agreement..." value="${escapeHtml(explorerState.filters.query)}" data-archive-filter="query" />
        </label>
        <label class="legal-filter-select">
          <span>Type</span>
          <select data-archive-filter="type">
            <option value="all"${explorerState.filters.type === "all" ? " selected" : ""}>All</option>
            <option value="client"${explorerState.filters.type === "client" ? " selected" : ""}>Clients</option>
            <option value="folder"${explorerState.filters.type === "folder" ? " selected" : ""}>Folders</option>
            <option value="pdf"${explorerState.filters.type === "pdf" ? " selected" : ""}>PDF</option>
            <option value="html"${explorerState.filters.type === "html" ? " selected" : ""}>HTML</option>
            <option value="json"${explorerState.filters.type === "json" ? " selected" : ""}>JSON</option>
            <option value="photo"${explorerState.filters.type === "photo" ? " selected" : ""}>Live Photo</option>
          </select>
        </label>
        <label class="legal-filter-select">
          <span>Date</span>
          <select data-archive-filter="date">
            <option value="all"${explorerState.filters.date === "all" ? " selected" : ""}>All time</option>
            <option value="today"${explorerState.filters.date === "today" ? " selected" : ""}>Today</option>
            <option value="7d"${explorerState.filters.date === "7d" ? " selected" : ""}>Last 7 days</option>
            <option value="30d"${explorerState.filters.date === "30d" ? " selected" : ""}>Last 30 days</option>
            <option value="90d"${explorerState.filters.date === "90d" ? " selected" : ""}>Last 90 days</option>
          </select>
        </label>
        <label class="legal-filter-select">
          <span>Modified</span>
          <select data-archive-filter="sort">
            <option value="newest"${explorerState.filters.sort === "newest" ? " selected" : ""}>Newest first</option>
            <option value="oldest"${explorerState.filters.sort === "oldest" ? " selected" : ""}>Oldest first</option>
            <option value="az"${explorerState.filters.sort === "az" ? " selected" : ""}>A to Z</option>
            <option value="za"${explorerState.filters.sort === "za" ? " selected" : ""}>Z to A</option>
          </select>
        </label>
      </div>
      <div class="legal-drive-heading-row">
        <div>
          <h3>${escapeHtml(explorerHeaderTitle())}</h3>
          <p class="muted">${escapeHtml(scopeLabel)}</p>
        </div>
        ${client && !folder ? `<button class="btn btn-sm btn-secondary" type="button" data-path-index="0">Back</button>` : ""}
        ${folder ? `<button class="btn btn-sm btn-secondary" type="button" data-path-index="1">Back</button>` : ""}
      </div>
      <div class="legal-drive-sortrow">
        <span>Name</span>
        <span class="legal-sort-indicator">↑</span>
      </div>
      ${renderExplorerItems(items)}
    </section>
  `;
}

function renderPage(rows = [], files = []) {
  const archivedCount = rows.filter((x) => String(x.status || "").toLowerCase() === "signed").length;
  const artifactMap = artifactLookup(files);
  const uniqueFolders = new Set(files.map((file) => `${file.drive_folder_id || ""}|${file.file_kind || ""}`)).size;

  renderModuleContent(`
    <section class="card">
      <h3>Google Drive Archive</h3>
      <p class="muted">Secure storage references for final PDFs, live photos, acceptance certificates and evidence bundles.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Archived: ${archivedCount}</span>
        <span class="meta-pill">Clients: ${explorerState.clients.length}</span>
        <span class="meta-pill">Folders: ${uniqueFolders}</span>
        <span class="meta-pill">Files: ${files.length}</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h3>Archive Register</h3>
      <div class="table-shell">
        <table class="legal-archive-register-table">
          <thead><tr><th>Agreement</th><th>Drive Status</th><th>Accepted Agreement</th><th>Evidence Bundle</th><th>Certificate</th><th>Action</th></tr></thead>
          <tbody>
            ${rows.map((row) => {
              const agreementNo = row.agreement_no || row.id;
              const title = row.title || "-";
              const bucket = artifactMap.get(row.id) || {};
              const driveReady = bucket.accepted_agreement_pdf || bucket.evidence_pdf || bucket.acceptance_certificate_pdf || bucket.signed_pdf;
              return `<tr>
                <td><strong>${escapeHtml(agreementNo)}</strong><br><span class="muted">${escapeHtml(title)}</span></td>
                <td>${statusPill(driveReady ? "Archived" : "Pending")}</td>
                <td>${renderArtifactButtons(bucket, "accepted") || "-"}</td>
                <td>${renderArtifactButtons(bucket, "evidence") || "-"}</td>
                <td>${renderArtifactButtons(bucket, "certificate") || "-"}</td>
                <td><div class="legal-artifact-actions">${rebuildButton(row.id)}</div></td>
              </tr>`;
            }).join("") || '<tr><td colspan="6">No archive records.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
    ${renderDriveExplorer()}
    <div class="legal-preview-modal" data-legal-preview-modal hidden data-preview-kind="pdf">
      <div class="legal-preview-backdrop" data-legal-preview-close></div>
      <div class="legal-preview-dialog" role="dialog" aria-modal="true" aria-label="Archive file preview">
        <div class="legal-preview-header">
          <div class="legal-preview-headcopy">
            <div class="legal-preview-eyebrow">Archive Preview</div>
            <h3 data-legal-preview-title>Preview</h3>
            <p class="legal-preview-subtitle" data-legal-preview-subtitle>Open the file, inspect it, and download it from here.</p>
          </div>
          <div class="legal-preview-actions">
            <a class="btn btn-sm" data-legal-preview-download href="#" target="_blank" rel="noreferrer">Download</a>
            <button class="btn btn-sm btn-secondary" type="button" data-legal-preview-close>Close</button>
          </div>
        </div>
        <div class="legal-preview-body">
          <div class="legal-preview-frame-shell">
            <iframe title="Archive preview" data-legal-preview-frame referrerpolicy="no-referrer"></iframe>
          </div>
        </div>
      </div>
    </div>
  `);
}

async function loadAndRender() {
  let rows = [];
  let files = [];
  try {
    const data = await listLegalData();
    rows = data?.agreements || [];
    files = data?.archiveFiles || [];
  } catch {}

  explorerState.rows = rows;
  explorerState.files = files;
  explorerState.clients = buildExplorer(rows, files);
  renderPage(rows, files);
}

function bindPreview() {
  const modal = document.querySelector("[data-legal-preview-modal]");
  const frame = document.querySelector("[data-legal-preview-frame]");
  const title = document.querySelector("[data-legal-preview-title]");
  const subtitle = document.querySelector("[data-legal-preview-subtitle]");
  const download = document.querySelector("[data-legal-preview-download]");

  document.querySelectorAll("[data-preview-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      const fileId = button.getAttribute("data-preview-file");
      const fileName = button.getAttribute("data-preview-name") || "Archive file";
      if (!fileId || !modal || !frame || !title || !download || !subtitle) return;
      modal.setAttribute("data-preview-kind", "loading");
      title.textContent = `Loading ${fileName}...`;
      subtitle.textContent = "Preparing secure preview...";
      frame.removeAttribute("srcdoc");
      frame.src = "about:blank";
      modal.hidden = false;
      document.body.classList.add("legal-preview-open");
      try {
        const result = await fetchLegalArchiveFile(fileId);
        if (explorerState.previewUrl) URL.revokeObjectURL(explorerState.previewUrl);
        const previewName = result.fileName || fileName;
        title.textContent = previewName;
        download.setAttribute("download", previewName);

        const contentType = result.contentType || "";
        if (contentType.includes("application/json")) {
          modal.setAttribute("data-preview-kind", "json");
          const text = await result.blob.text();
          subtitle.textContent = "JSON evidence preview";
          frame.srcdoc = `<pre style="margin:0;padding:24px;font:14px/1.6 ui-monospace,Menlo,Consolas,monospace;background:#0b1320;color:#dbe7f5;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(text)}</pre>`;
          download.href = URL.createObjectURL(result.blob);
          explorerState.previewUrl = download.href;
          frame.removeAttribute("src");
        } else if (contentType.includes("text/html")) {
          modal.setAttribute("data-preview-kind", "html");
          const html = await result.blob.text();
          subtitle.textContent = "HTML document preview";
          frame.srcdoc = buildFramedHtmlPreview(html);
          download.href = URL.createObjectURL(result.blob);
          explorerState.previewUrl = download.href;
          frame.removeAttribute("src");
        } else if (contentType.startsWith("image/")) {
          modal.setAttribute("data-preview-kind", "image");
          const objectUrl = URL.createObjectURL(result.blob);
          explorerState.previewUrl = objectUrl;
          subtitle.textContent = "Live photo preview";
          frame.removeAttribute("src");
          frame.srcdoc = `<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08101f;padding:24px;box-sizing:border-box;"><img src="${objectUrl}" alt="${escapeHtml(previewName)}" style="max-width:min(100%,980px);max-height:calc(100vh - 64px);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.38);background:#fff;object-fit:contain;" /></body></html>`;
          download.href = objectUrl;
        } else {
          modal.setAttribute("data-preview-kind", "pdf");
          const objectUrl = URL.createObjectURL(result.blob);
          explorerState.previewUrl = objectUrl;
          subtitle.textContent = "PDF or media preview";
          frame.removeAttribute("srcdoc");
          frame.src = `${objectUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
          download.href = objectUrl;
        }
      } catch (error) {
        modal.setAttribute("data-preview-kind", "error");
        title.textContent = fileName;
        subtitle.textContent = "Preview could not be loaded. You can still download the file.";
        frame.srcdoc = `<div style="display:grid;place-items:center;height:100%;background:#0b1320;color:#dbe7f5;font:15px/1.5 Inter,Arial,sans-serif;padding:24px;text-align:center;">${escapeHtml(error?.message || "Preview could not be loaded.")}</div>`;
        download.href = fileDownloadUrl(fileId);
        showToast(error?.message || "Preview could not be loaded.", TOAST_TYPES.ERROR);
      }
    });
  });

  document.querySelectorAll("[data-legal-preview-close]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!modal || !frame) return;
      modal.hidden = true;
      modal.setAttribute("data-preview-kind", "pdf");
      frame.src = "";
      frame.removeAttribute("srcdoc");
      if (explorerState.previewUrl) {
        URL.revokeObjectURL(explorerState.previewUrl);
        explorerState.previewUrl = null;
      }
      document.body.classList.remove("legal-preview-open");
    });
  });

  if (!document.body.dataset.legalPreviewEscBound) {
    document.body.dataset.legalPreviewEscBound = "1";
    document.addEventListener("keydown", (event) => {
      const activeModal = document.querySelector("[data-legal-preview-modal]");
      const activeFrame = document.querySelector("[data-legal-preview-frame]");
      if (event.key === "Escape" && activeModal && !activeModal.hidden) {
        activeModal.hidden = true;
        activeModal.setAttribute("data-preview-kind", "pdf");
        if (activeFrame) activeFrame.src = "";
        if (activeFrame) activeFrame.removeAttribute("srcdoc");
        if (explorerState.previewUrl) {
          URL.revokeObjectURL(explorerState.previewUrl);
          explorerState.previewUrl = null;
        }
        document.body.classList.remove("legal-preview-open");
      }
    });
  }
}

function bindExplorer() {
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const viewMode = button.getAttribute("data-view-mode");
      if (!viewMode || explorerState.viewMode === viewMode) return;
      explorerState.viewMode = viewMode;
      renderPage(explorerState.rows, explorerState.files);
      bind();
    });
  });

  document.querySelectorAll("[data-open-node]").forEach((button) => {
    button.addEventListener("click", () => {
      const nodeType = button.getAttribute("data-node-type");
      const nodeId = button.getAttribute("data-open-node");
      if (!nodeType || !nodeId) return;

      if (nodeType === "client") {
        explorerState.path = [explorerState.clients.find((item) => item.id === nodeId)].filter(Boolean);
      } else if (nodeType === "folder") {
        const client = activeClient();
        const folder = client?.folders.find((item) => item.id === nodeId);
        explorerState.path = [client, folder].filter(Boolean);
      }
      renderPage(explorerState.rows, explorerState.files);
      bind();
    });
  });

  document.querySelectorAll("[data-path-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const pathIndex = Number(button.getAttribute("data-path-index"));
      if (!Number.isFinite(pathIndex)) return;
      if (pathIndex === 0) explorerState.path = [];
      if (pathIndex === 1) explorerState.path = explorerState.path.slice(0, 1);
      renderPage(explorerState.rows, explorerState.files);
      bind();
    });
  });

  document.querySelectorAll("[data-archive-filter]").forEach((input) => {
    const eventName = input.matches('input[type="search"]') ? "input" : "change";
    input.addEventListener(eventName, () => {
      const key = input.getAttribute("data-archive-filter");
      if (!key) return;
      explorerState.filters[key] = input.value || "";
      renderPage(explorerState.rows, explorerState.files);
      bind();
    });
  });
}

function bindActions() {
  document.querySelectorAll("[data-rebuild-archive]").forEach((button) => {
    button.addEventListener("click", async () => {
      const agreementId = button.getAttribute("data-rebuild-archive");
      if (!agreementId) return;
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "Rebuilding...";
      try {
        await rebuildLegalArchiveArtifacts(agreementId);
        showToast("Archive artifacts rebuilt.", TOAST_TYPES.SUCCESS);
        await loadAndRender();
        bind();
      } catch (error) {
        showToast(error?.message || "Archive rebuild failed.", TOAST_TYPES.ERROR);
        button.disabled = false;
        button.textContent = original || "Rebuild PDFs";
      }
    });
  });
}

function bind() {
  bindPreview();
  bindExplorer();
  bindActions();
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_ARCHIVE,
    pageTitle: "Legal Archive",
    pageDescription: "Google Drive storage references and immutable agreement evidence",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  await loadAndRender();
  bind();
}

init();
