import { MODULES } from "../config/constants.js";
import { logUserRoleEvent } from "./audit.js";
import { assignUserDivision, assignUserRole, listDivisions, listRoles, listUsers, provisionUserViaEdge, updateUserStatus } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";
import { updateUserSecurity } from "./admin-api.js";
import { getCurrentAppUser } from "./auth.js";
import { requestUserPasswordReset } from "./admin-api.js";

let allUsers = [];
let allRoles = [];
let allDivisions = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let currentAppUserId = null;

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.USERS,
    pageTitle: "User Management",
    pageDescription: "Admin-only foundation shell for user lifecycle management"
  });

  const me = await getCurrentAppUser();
  currentAppUserId = me?.id || null;

  renderModuleContent(`
    <div class="card" style="margin-bottom:1rem;">
      <h3>Create User</h3>
      <form id="createUserForm" class="form-row">
        <input id="newUserEmail" type="email" placeholder="Email" required />
        <input id="newUserPassword" type="password" placeholder="Temporary password" />
        <input id="newUserName" type="text" placeholder="Display name" />
        <select id="newUserRole"></select>
        <select id="newUserDivision"></select>
        <button class="btn" type="submit">Provision User</button>
      </form>
    </div>
    <div class="card" style="margin-bottom:1rem;">
      <input id="userSearch" type="text" placeholder="Search by user/email/role/division" />
    </div>
    <div class="table-shell">
      <table>
        <thead>
          <tr><th>User</th><th>Role</th><th>Status</th><th>Last Login</th><th>Division Scope</th><th>Actions</th></tr>
        </thead>
        <tbody id="usersBody"></tbody>
      </table>
    </div>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
      <button class="btn" id="prevPageBtn">Prev</button>
      <span id="pageMeta"></span>
      <button class="btn" id="nextPageBtn">Next</button>
    </div>
    <div class="empty-state" id="usersEmpty" style="margin-top:1rem;display:none;">No users found.</div>
  `);

  await loadMasterLists();
  bindCreateForm();
  bindFilters();
  await loadUsers();
}

async function loadUsers() {
  allUsers = await listUsers();
  renderUsers();
}

function getFilteredUsers() {
  const q = (qs("#userSearch")?.value || "").trim().toLowerCase();
  if (!q) return allUsers;
  return allUsers.filter((u) => {
    const role = (u.user_roles || []).map((x) => x.roles?.name || x.roles?.code).join(" ").toLowerCase();
    const divisions = (u.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).join(" ").toLowerCase();
    return [u.display_name || "", u.email || "", role, divisions].join(" ").toLowerCase().includes(q);
  });
}

function renderUsers() {
  const rows = getFilteredUsers();
  const body = qs("#usersBody");
  const empty = qs("#usersEmpty");
  const pageMeta = qs("#pageMeta");
  if (!body) return;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  if (pageMeta) pageMeta.textContent = `Page ${currentPage} / ${totalPages}`;

  if (!pageRows.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No user records available.</td></tr>`;
    if (empty) empty.style.display = "block";
    return;
  }

  if (empty) empty.style.display = "none";
  body.innerHTML = pageRows.map((u) => {
    const role = (u.user_roles || []).map((x) => x.roles?.name || x.roles?.code).filter(Boolean).join(", ") || "-";
    const divisions = (u.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "all";
    const nextStatus = u.status === "active" ? "disabled" : "active";
    return `
      <tr>
        <td>${u.display_name || u.email}</td>
        <td>${role}</td>
        <td>
          <span class="meta-pill">${u.status === "active" ? "Active" : "Disabled"}</span>
          ${u.is_locked ? '<span class="meta-pill" style="margin-left:0.4rem;">Locked</span>' : '<span class="meta-pill" style="margin-left:0.4rem;">Unlocked</span>'}
        </td>
        <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}</td>
        <td>${divisions}</td>
        <td>
          <button class="btn" data-user-id="${u.id}" data-next-status="${nextStatus}">${nextStatus === "active" ? "Enable" : "Disable"}</button>
          <button class="btn" data-lock-user-id="${u.id}" data-next-lock="${u.is_locked ? "false" : "true"}">${u.is_locked ? "Unlock" : "Lock"}</button>
          <button class="btn" data-reset-user-id="${u.id}">Reset Password*</button>
          <select data-role-user-id="${u.id}">${renderRoleOptions((u.user_roles || [])[0]?.roles?.id)}</select>
          <select data-division-user-id="${u.id}">${renderDivisionOptions((u.user_divisions || [])[0]?.divisions?.id)}</select>
          <button class="btn" data-save-user-id="${u.id}">Save</button>
        </td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("button[data-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-user-id");
      const nextStatus = btn.getAttribute("data-next-status");
      try {
        if (String(userId) === String(currentAppUserId)) {
          const ok = window.confirm("You are modifying your own account status. Continue?");
          if (!ok) return;
        }
        await updateUserStatus(userId, nextStatus);
        await logUserRoleEvent("user_status_change", { entityType: "app_users", entityId: userId, status: nextStatus });
        showToast(nextStatus === "active" ? "User activated" : "User disabled", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update user status", "error");
      }
    });
  });

  body.querySelectorAll("button[data-save-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-save-user-id");
      const roleId = qs(`select[data-role-user-id='${userId}']`)?.value || null;
      const divisionId = qs(`select[data-division-user-id='${userId}']`)?.value || null;
      try {
        if (roleId) await assignUserRole(userId, roleId);
        await assignUserDivision(userId, divisionId || null);
        await logUserRoleEvent("user_mapping_change", { entityType: "app_users", entityId: userId, roleId, divisionId });
        showToast("User mappings saved", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to save mappings", "error");
      }
    });
  });

  body.querySelectorAll("button[data-lock-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-lock-user-id");
      const nextLock = (btn.getAttribute("data-next-lock") || "false") === "true";
      try {
        if (String(userId) === String(currentAppUserId)) {
          const ok = window.confirm("You are changing your own lock state. Continue?");
          if (!ok) return;
        }
        await updateUserSecurity(userId, { is_locked: nextLock });
        await logUserRoleEvent("user_lock_toggle", { entityType: "app_users", entityId: userId, is_locked: nextLock });
        showToast(nextLock ? "User locked" : "User unlocked", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update lock state", "error");
      }
    });
  });

  body.querySelectorAll("button[data-reset-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-reset-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));
      if (!user?.email) {
        showToast("Cannot reset password: user email missing", "error");
        return;
      }
      try {
        await requestUserPasswordReset(user.email);
        await logUserRoleEvent("password_reset_requested", { entityType: "app_users", entityId: userId, email: user.email });
        showToast("Password reset email triggered", "success");
      } catch (error) {
        showToast(error?.message || "Failed to request password reset", "error");
      }
    });
  });
}

async function loadMasterLists() {
  const [roles, divisions] = await Promise.all([listRoles(), listDivisions()]);
  allRoles = roles;
  allDivisions = divisions;
  const roleSelect = qs("#newUserRole");
  const divisionSelect = qs("#newUserDivision");
  if (roleSelect) roleSelect.innerHTML = renderRoleOptions();
  if (divisionSelect) divisionSelect.innerHTML = `<option value="">No Division</option>${renderDivisionOptions()}`;
}

function renderRoleOptions(selected = "") {
  return allRoles.map((r) => `<option value="${r.id}" ${String(selected) === String(r.id) ? "selected" : ""}>${r.name}</option>`).join("");
}

function renderDivisionOptions(selected = "") {
  return allDivisions.map((d) => `<option value="${d.id}" ${String(selected) === String(d.id) ? "selected" : ""}>${d.name}</option>`).join("");
}

function bindCreateForm() {
  const form = qs("#createUserForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const email = qs("#newUserEmail")?.value?.trim();
      const password = qs("#newUserPassword")?.value || undefined;
      const displayName = qs("#newUserName")?.value?.trim() || undefined;
      const roleId = qs("#newUserRole")?.value;
      const divisionId = qs("#newUserDivision")?.value || undefined;
      const role = allRoles.find((r) => String(r.id) === String(roleId));
      const division = allDivisions.find((d) => String(d.id) === String(divisionId));

      if (!email || !role?.code) {
        showToast("Email and role are required", "error");
        return;
      }

      await provisionUserViaEdge({ email, password, displayName, roleCode: role.code, divisionCode: division?.code });
      showToast("User provisioned", "success");
      form.reset();
      await loadUsers();
    } catch (error) {
      showToast(error?.message || "Provisioning failed", "error");
    }
  });
}

function bindFilters() {
  qs("#userSearch")?.addEventListener("input", () => {
    currentPage = 1;
    renderUsers();
  });

  qs("#prevPageBtn")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderUsers();
    }
  });

  qs("#nextPageBtn")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredUsers().length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage += 1;
      renderUsers();
    }
  });
}

init();
