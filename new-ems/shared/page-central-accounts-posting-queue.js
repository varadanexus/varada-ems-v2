import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { PERMISSIONS } from "../config/roles.js";
import { listCentralPostingQueue, postCentralAccountsTransportDocument } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [], canPost: false, roleCodes: [], allowedModules: [] };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE,
    pageTitle: "Posting Queue",
    pageDescription: "Execute authorized Central Accounts posting from staged documents",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;

  PAGE_STATE.roleCodes = boot.roleCodes || [];
  PAGE_STATE.allowedModules = boot.allowedModules || [];
  PAGE_STATE.canPost = hasAnyRolePermission(PAGE_STATE.roleCodes, MODULES.CENTRAL_ACCOUNTS_POSTING_QUEUE, PERMISSIONS.POST, { allowedModules: PAGE_STATE.allowedModules });

  renderModuleContent(renderShell());
  bindEvents();
  await loadQueue();
}

function renderShell() {
  return `
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caQueueSearch" type="text" placeholder="Search source / sequence / module" />
        <select id="caQueueStatus"><option value="">All Statuses</option><option value="ready_to_post">Ready To Post</option><option value="processing">Processing</option><option value="posted">Posted</option><option value="failed">Failed</option></select>
        <button class="btn" id="caQueueApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card">
      <h3>Posting Queue</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Source Document</th><th>Family</th><th>Queue Status</th><th>Posting Sequence</th><th>Source Module</th><th>Net Amount</th><th>Action</th></tr></thead>
          <tbody id="caQueueBody"><tr><td colspan="7">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
}

function bindEvents() {
  qs("#caQueueApply")?.addEventListener("click", loadQueue);
}

async function loadQueue() {
  try {
    PAGE_STATE.rows = await listCentralPostingQueue({
      search: qs("#caQueueSearch")?.value || "",
      status: qs("#caQueueStatus")?.value || ""
    });
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load posting queue", TOAST_TYPES.ERROR);
  }
}

function renderRows() {
  const body = qs("#caQueueBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="7">No posting queue items found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => {
    const fd = row.financial_documents || {};
    const posting = Array.isArray(fd.document_postings) ? fd.document_postings[0] : null;
    const canAct = PAGE_STATE.canPost && row.queue_status === "ready_to_post";
    return `
      <tr>
        <td>${escapeHtml(fd.source_document_no || "—")}</td>
        <td>${escapeHtml(fd.document_family || "—")}</td>
        <td><span class="meta-pill">${escapeHtml(row.queue_status || "—")}</span></td>
        <td>${escapeHtml(posting?.posting_sequence || "—")}</td>
        <td>${escapeHtml(fd.source_module || "—")}</td>
        <td>₹${Number(fd.net_amount || 0).toFixed(2)}</td>
        <td>${canAct ? `<button class="btn" type="button" data-post-id="${fd.id}">Post</button>` : `<span class="muted">${PAGE_STATE.canPost ? "Not postable" : "No posting access"}</span>`}</td>
      </tr>
    `;
  }).join("");
  body.querySelectorAll("button[data-post-id]").forEach((button) => button.addEventListener("click", async () => postDocument(button.getAttribute("data-post-id"))));
}

async function postDocument(financialDocumentId) {
  if (!PAGE_STATE.canPost) return showToast("You do not have posting permission.", TOAST_TYPES.ERROR);
  if (!window.confirm("Execute posting for this financial document?")) return;
  try {
    await postCentralAccountsTransportDocument(financialDocumentId);
    showToast("Posting executed successfully.", TOAST_TYPES.SUCCESS);
    await loadQueue();
  } catch (error) {
    showToast(error?.message || "Posting failed", TOAST_TYPES.ERROR);
    await loadQueue();
  }
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();