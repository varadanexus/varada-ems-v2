import { MODULES } from "../config/constants.js";
import { logUserRoleEvent } from "./audit.js";
import { listUsers, updateUserStatus } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.USERS,
    pageTitle: "User Management",
    pageDescription: "Admin-only foundation shell for user lifecycle management"
  });

  renderModuleContent(`
    <div class="table-shell">
      <table>
        <thead>
          <tr><th>User</th><th>Role</th><th>Status</th><th>Division Scope</th><th>Actions</th></tr>
        </thead>
        <tbody id="usersBody"></tbody>
      </table>
    </div>
    <div class="empty-state" id="usersEmpty" style="margin-top:1rem;display:none;">No users found.</div>
  `);

  await loadUsers();
}

async function loadUsers() {
  const rows = await listUsers();
  const body = qs("#usersBody");
  const empty = qs("#usersEmpty");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No user records available.</td></tr>`;
    if (empty) empty.style.display = "block";
    return;
  }

  if (empty) empty.style.display = "none";
  body.innerHTML = rows.map((u) => {
    const role = (u.user_roles || []).map((x) => x.roles?.name || x.roles?.code).filter(Boolean).join(", ") || "-";
    const divisions = (u.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "all";
    const nextStatus = u.status === "active" ? "disabled" : "active";
    return `
      <tr>
        <td>${u.display_name || u.email}</td>
        <td>${role}</td>
        <td>${u.status}</td>
        <td>${divisions}</td>
        <td><button class="btn" data-user-id="${u.id}" data-next-status="${nextStatus}">${nextStatus === "active" ? "Enable" : "Disable"}</button></td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("button[data-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-user-id");
      const nextStatus = btn.getAttribute("data-next-status");
      try {
        await updateUserStatus(userId, nextStatus);
        await logUserRoleEvent("user_status_change", { entityType: "app_users", entityId: userId, status: nextStatus });
        showToast("User status updated", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update user", "error");
      }
    });
  });
}

init();
