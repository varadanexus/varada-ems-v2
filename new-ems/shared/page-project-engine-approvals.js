import { MODULES, ROUTES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const PAGE_STATE = { boot: null, approvalRequests: [] };
const STATUS_COLORS = { pending: "orange", approved: "green", rejected: "red", returned: "purple", cancelled: "gray" };
const CATEGORY_COLORS = { lifecycle: "blue", milestone: "purple", document_evidence: "green", exception: "red" };

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.PROJECT_ENGINE_APPROVALS, pageTitle: "Approvals", pageDescription: "Review and approve requests" });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadApprovals();
  render();
  bindEvents();
}

async function loadApprovals() {
  try {
    const { data: requests, error } = await window.supabase.from("project_approval_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const rows = requests || [];
    const projectIds = [...new Set(rows.map((row) => row.project_id).filter(Boolean))];
    const userIds = [...new Set(rows.flatMap((row) => [row.requested_by_app_user_id, row.assigned_approver_app_user_id, row.acted_by_app_user_id]).filter(Boolean))];
    const [projectRes, userRes] = await Promise.all([
      projectIds.length ? window.supabase.from("projects").select("id,project_code,project_name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? window.supabase.from("app_users").select("id,display_name,email").in("id", userIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (projectRes.error) throw projectRes.error;
    if (userRes.error) throw userRes.error;
    const projectMap = new Map((projectRes.data || []).map((row) => [String(row.id), row]));
    const userMap = new Map((userRes.data || []).map((row) => [String(row.id), row]));
    PAGE_STATE.approvalRequests = rows.map((row) => ({ ...row, project: projectMap.get(String(row.project_id || "")) || null, requested_by: userMap.get(String(row.requested_by_app_user_id || "")) || null }));
  } catch (error) {
    console.error("Error fetching approval requests:", error);
    showToast(error?.message || "Failed to load approval requests", TOAST_TYPES.ERROR);
  }
}

function render() {
  const allowedModules = PAGE_STATE.boot?.accessibleModules || PAGE_STATE.boot?.allowedModules || [];
  const canView = (moduleCode) => allowedModules.includes(moduleCode);
  const canApprove = canView(MODULES.PROJECT_ENGINE_APPROVALS) && (PAGE_STATE.boot?.permissions || []).includes("project-engine-approvals-approve");

  renderModuleContent(`
    <section class="card">
      <h3>Approvals</h3>
      <p class="muted">Review and approve requests</p>
      <div class="table-container"><table><thead><tr><th>Request</th><th>Project</th><th>Category</th><th>Type</th><th>Status</th><th>Requested By</th><th>Actions</th></tr></thead><tbody>
      ${PAGE_STATE.approvalRequests.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:2rem;">No approval requests found.</td></tr>` : PAGE_STATE.approvalRequests.map((request) => `<tr><td><strong>${escapeHtml(formatRequestRef(request))}</strong><br/><span class="muted">${escapeHtml(formatDateTime(request.requested_at))}</span></td><td>${request.project ? `<a href="${ROUTES.PROJECT_ENGINE_PROJECT_DETAILS}?id=${request.project_id}">${escapeHtml(request.project.project_code)}</a><br/><span class="muted">${escapeHtml(request.project.project_name)}</span>` : "-"}</td><td><span class="badge" style="background-color:${CATEGORY_COLORS[String(request.approval_category || "").toLowerCase()] || "gray"}">${escapeHtml(request.approval_category || "-")}</span></td><td>${escapeHtml(request.approval_type || "-")}</td><td><span class="badge" style="background-color:${STATUS_COLORS[request.status] || "gray"}">${escapeHtml(request.status)}</span></td><td>${escapeHtml(request.requested_by?.display_name || request.requested_by?.email || "-")}</td><td>${request.status === "pending" && canApprove ? `<button class="btn btn-sm btn-success" data-action="approve" data-id="${request.id}" type="button">Approve</button><button class="btn btn-sm btn-danger" data-action="reject" data-id="${request.id}" type="button">Reject</button>` : `<button class="btn btn-sm" data-action="view" data-id="${request.id}" type="button">View</button>`}</td></tr>`).join("")}
      </tbody></table></div>
      <div id="approvalActionResult" class="muted" style="margin-top:1rem;"></div>
    </section>
  `);
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const action = event.currentTarget?.dataset?.action;
      const requestId = event.currentTarget?.dataset?.id;
      if (!requestId) return;
      if (action === "approve") {
        const remarks = window.prompt("Enter approval remarks (optional):", "Approved") ?? "";
        return void awaitUpdate(requestId, "approved", remarks);
      }
      if (action === "reject") {
        const remarks = window.prompt("Enter rejection reason (required):", "") ?? "";
        if (!remarks.trim()) return void showToast("Rejection reason is required", TOAST_TYPES.ERROR);
        return void awaitUpdate(requestId, "rejected", remarks);
      }
      if (action === "view") {
        const row = PAGE_STATE.approvalRequests.find((item) => String(item.id) === String(requestId));
        if (row) document.getElementById("approvalActionResult").textContent = `Request ${formatRequestRef(row)} | Status: ${row.status} | Remarks: ${row.remarks || "-"}`;
      }
    });
  });
}

async function awaitUpdate(requestId, status, remarks) {
  try {
    const { error } = await window.supabase.from("project_approval_requests").update({ status, acted_by_app_user_id: PAGE_STATE.boot?.appUser?.id || null, acted_at: new Date().toISOString(), remarks: remarks || null, updated_at: new Date().toISOString() }).eq("id", requestId);
    if (error) throw error;
    showToast(`Request ${status} successfully`, TOAST_TYPES.SUCCESS);
    document.getElementById("approvalActionResult").textContent = `Request ${requestId} updated to ${status}`;
    await loadApprovals();
    render();
    bindEvents();
  } catch (error) {
    console.error(`Error updating approval request to ${status}:`, error);
    showToast(error?.message || `Error updating request to ${status}`, TOAST_TYPES.ERROR);
    document.getElementById("approvalActionResult").textContent = error?.message || `Error updating request to ${status}`;
  }
}

function formatRequestRef(request) { return `REQ-${String(request?.id || "").slice(0, 8)}`; }
function formatDateTime(value) { return value ? new Date(value).toLocaleString() : "-"; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

init();