import { MODULES, WORKSPACES } from "../config/constants.js";
import { logUserRoleEvent } from "./audit.js";
import { listDivisions, listRoles, listUsers, provisionUserViaEdge, provisionLocalUser, deleteAppUser, updateAppUserDetails, setLocalUserPassword, setSupabaseUserPassword, syncUserAccessMappings, updateUserStatus } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";
import { updateUserSecurity } from "./admin-api.js";
import { getCurrentAppUser } from "./auth.js";
import { requestUserPasswordReset } from "./admin-api.js";
import { sendUserCredentialEmail } from "./email-api.js";
import { notifyEmsUserCreated } from "./transport-integrations-api.js";

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
    pageDescription: "Admin-only foundation shell for user lifecycle management",
    workspace: WORKSPACES.ADMIN
  });

  const me = await getCurrentAppUser();
  currentAppUserId = me?.id || null;

  renderModuleContent(`
    <div class="card" style="margin-bottom:1rem;">
      <h3>Create User</h3>
      <form id="createUserForm" class="form-row">
        <input id="newUserEmail" type="email" placeholder="Email" required />
        <input id="newUserUsername" type="text" placeholder="Username (optional)" />
        <input id="newUserPhone" type="tel" inputmode="numeric" placeholder="Registered mobile number" required />
        <input id="newUserPassword" type="password" minlength="8" placeholder="Initial password (minimum 8 characters)" required />
        <input id="newUserName" type="text" placeholder="Display name" />
        <select id="newUserAuthMethod" required>
          <option value="" disabled selected>Auth method…</option>
          <option value="local">Local (no Supabase Auth)</option>
          <option value="supabase">Supabase Auth</option>
        </select>
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

function userAccessLabels(user) {
  const roleName = (user.user_roles || []).map((x) => x.roles?.name || x.roles?.code).filter(Boolean).join(", ") || "Assigned role";
  const hasAllScope = (user.user_divisions || []).some((x) => String(x.scope || "").toLowerCase() === "all");
  const divisionName = hasAllScope
    ? "All Divisions"
    : ((user.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "No Division");
  return { roleName, divisionName };
}

async function deliverStaffCredentials(user, password, sourceEvent = "ems_user_credentials_created") {
  const recipientEmail = String(user.email || "").trim().toLowerCase();
  const recipientPhone = String(user.phone || "").trim();
  const username = user.auth_provider === "supabase" ? recipientEmail : (String(user.username || "").trim() || recipientEmail);
  if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) throw new Error("A valid user email is required before credentials can be sent");
  if (recipientPhone.replace(/\D/g, "").length < 10) throw new Error("A valid registered mobile number is required before credentials can be sent");
  const { roleName, divisionName } = userAccessLabels(user);
  const warnings = [];
  try {
    const emailResult = await sendUserCredentialEmail({
      recipientEmail,
      recipientName: user.display_name || recipientEmail,
      username,
      initialPassword: password,
      registeredMobile: recipientPhone,
      roleName,
      divisionName,
      sourceEvent
    });
    if (!(emailResult?.sent > 0)) warnings.push("credential email was not delivered");
  } catch (error) {
    warnings.push(`email failed: ${error?.message || "Unknown error"}`);
  }
  try {
    const notification = await notifyEmsUserCreated({
      recipientName: user.display_name || recipientEmail,
      recipientPhone,
      username,
      password,
      roleName,
      portalLoginUrl: "https://www.varadanexus.com/login",
      sourceEvent
    });
    if (!notification?.whatsapp?.sent) warnings.push(`WhatsApp was not delivered${notification?.whatsapp?.reason ? `: ${notification.whatsapp.reason}` : ""}`);
  } catch (error) {
    warnings.push(`WhatsApp failed: ${error?.message || "Unknown error"}`);
  }
  return warnings;
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
    const hasAllScope = (u.user_divisions || []).some((x) => String(x.scope || "").toLowerCase() === "all");
    const divisions = hasAllScope
      ? "All Divisions"
      : ((u.user_divisions || []).map((x) => x.divisions?.name || x.divisions?.code).filter(Boolean).join(", ") || "—");
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
          <button class="btn" data-reset-user-id="${u.id}">${u.auth_provider === "supabase" ? "Reset Password*" : "Set Password"}</button>
          <button class="btn" data-resend-user-id="${u.id}">Resend credentials</button>
          <button class="btn" data-edit-user-id="${u.id}">Edit</button>
          ${u.auth_provider === "supabase" ? "" : `<button class="btn" data-delete-user-id="${u.id}" style="color:#f87171;border-color:#f8717155;">Delete</button>`}
          <div data-edit-form="${u.id}" style="display:none;margin-top:.5rem;padding:.5rem;border:1px solid rgba(255,255,255,.12);border-radius:8px;">
            <input data-edit-name="${u.id}" placeholder="Display name" value="${escAttr(u.display_name)}" style="display:block;width:100%;margin-bottom:.35rem;" />
            <input data-edit-email="${u.id}" placeholder="Email" value="${escAttr(u.email)}" style="display:block;width:100%;margin-bottom:.35rem;" ${u.auth_provider === "supabase" ? "disabled title='Managed by Supabase Auth'" : ""} />
            <input data-edit-username="${u.id}" placeholder="Username" value="${escAttr(u.username)}" style="display:block;width:100%;margin-bottom:.35rem;" ${u.auth_provider === "supabase" ? "disabled" : ""} />
            <input data-edit-phone="${u.id}" placeholder="Phone" value="${escAttr(u.phone)}" style="display:block;width:100%;margin-bottom:.35rem;" ${u.auth_provider === "supabase" ? "disabled" : ""} />
            <button class="btn" data-edit-save="${u.id}">Save details</button>
            <button class="btn" data-edit-cancel="${u.id}">Cancel</button>
          </div>
          <label class="muted" style="display:block;margin-top:.35rem;">Roles</label>
          <select data-role-user-id="${u.id}" multiple size="4" style="min-width:12rem;">${renderRoleOptions((u.user_roles || []).map((x) => x.roles?.id))}</select>
          <label class="muted" style="display:block;margin-top:.35rem;">Divisions</label>
          <select data-division-user-id="${u.id}" multiple size="4" style="min-width:12rem;">${renderDivisionOptions((u.user_divisions || []).map((x) => x.divisions?.id))}</select>
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
      const roleIds = getSelectedValues(qs(`select[data-role-user-id='${userId}']`));
      const divisionIds = getSelectedValues(qs(`select[data-division-user-id='${userId}']`));
      try {
        await syncUserAccessMappings(userId, roleIds, divisionIds);
        await logUserRoleEvent("user_mapping_change", { entityType: "app_users", entityId: userId, roleIds, divisionIds });
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

  body.querySelectorAll("button[data-edit-user-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-edit-user-id");
      const form = qs(`div[data-edit-form='${userId}']`);
      if (form) form.style.display = form.style.display === "none" ? "block" : "none";
    });
  });

  body.querySelectorAll("button[data-edit-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-edit-cancel");
      const form = qs(`div[data-edit-form='${userId}']`);
      if (form) form.style.display = "none";
    });
  });

  body.querySelectorAll("button[data-edit-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-edit-save");
      const displayName = qs(`input[data-edit-name='${userId}']`)?.value?.trim() || "";
      const email = qs(`input[data-edit-email='${userId}']`)?.value?.trim() || "";
      const username = qs(`input[data-edit-username='${userId}']`)?.value?.trim() || "";
      const phone = qs(`input[data-edit-phone='${userId}']`)?.value?.trim() || "";
      try {
        await updateAppUserDetails(userId, { email, username, phone, displayName });
        await logUserRoleEvent("user_updated", { entityType: "app_users", entityId: userId });
        showToast("Details updated", "success");
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to update details", "error");
      }
    });
  });

  body.querySelectorAll("button[data-delete-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-delete-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));
      const label = user?.display_name || user?.email || "this user";
      if (String(userId) === String(currentAppUserId)) {
        showToast("You cannot delete your own account", "error");
        return;
      }
      if (!window.confirm(`Delete ${label}? This removes their login and access. This cannot be undone.`)) {
        return;
      }
      try {
        const outcome = await deleteAppUser(userId);
        await logUserRoleEvent("user_deleted", { entityType: "app_users", entityId: userId, outcome });
        showToast(
          outcome === "soft_deleted"
            ? "User had records — disabled and removed from lists"
            : "User deleted",
          "success"
        );
        await loadUsers();
      } catch (error) {
        showToast(error?.message || "Failed to delete user", "error");
      }
    });
  });

  body.querySelectorAll("button[data-reset-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-reset-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));

      // LOCAL accounts: no Supabase Auth email — set the password directly.
      if (user && user.auth_provider !== "supabase") {
        const pw = window.prompt(`Enter a new password for ${user.display_name || user.email || "this user"}:`);
        if (!pw) return;
        try {
          await setLocalUserPassword(userId, pw);
          await logUserRoleEvent("password_set", { entityType: "app_users", entityId: userId });
          showToast("Password updated. The user's active sessions were signed out.", "success");
        } catch (error) {
          showToast(error?.message || "Failed to set password", "error");
        }
        return;
      }

      // Supabase-backed accounts (super admin): trigger the reset email.
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

  body.querySelectorAll("button[data-resend-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-resend-user-id");
      const user = allUsers.find((x) => String(x.id) === String(userId));
      if (!user) return showToast("User record not found", "error");
      if (!/^\S+@\S+\.\S+$/.test(String(user.email || "")) || String(user.phone || "").replace(/\D/g, "").length < 10) {
        return showToast("Add a valid email and registered mobile number before resending credentials", "error");
      }
      const label = user.display_name || user.email || "this user";
      const password = window.prompt(`Enter a new temporary password for ${label} (minimum 8 characters):`);
      if (password === null) return;
      if (password.length < 8) return showToast("Temporary password must be at least 8 characters", "error");
      const confirmation = window.prompt("Re-enter the new temporary password to confirm:");
      if (confirmation === null) return;
      if (password !== confirmation) return showToast("Password confirmation does not match", "error");
      if (!window.confirm(`Set this new temporary password and resend credentials to ${user.email} and the registered WhatsApp number?`)) return;
      btn.disabled = true;
      try {
        if (user.auth_provider === "supabase") await setSupabaseUserPassword(user.id, password);
        else await setLocalUserPassword(user.id, password);
        const warnings = await deliverStaffCredentials(user, password, "ems_user_credentials_resent");
        await logUserRoleEvent("user_credentials_resent", { entityType: "app_users", entityId: user.id, email: user.email, deliveryWarnings: warnings });
        if (warnings.length) showToast(`Password updated. ${warnings.join("; ")}`, "warning");
        else showToast("New credentials sent successfully by email and WhatsApp", "success");
      } catch (error) {
        showToast(error?.message || "Failed to resend credentials", "error");
      } finally {
        btn.disabled = false;
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
  if (divisionSelect) {
    divisionSelect.innerHTML =
      `<option value="">No Division</option>` +
      `<option value="__ALL__">All Divisions</option>` +
      renderCreateDivisionOptions();
  }
}

// Create-form division options: active only, de-duplicated by name (guards
// against any residual duplicate rows).
function renderCreateDivisionOptions() {
  const seen = new Set();
  return allDivisions
    .filter((d) => d.is_active !== false)
    .filter((d) => {
      const key = String(d.name || "").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((d) => `<option value="${d.id}">${d.name}</option>`)
    .join("");
}

function renderRoleOptions(selected = []) {
  const selectedSet = new Set((Array.isArray(selected) ? selected : [selected]).filter(Boolean).map((value) => String(value)));
  return allRoles.map((r) => `<option value="${r.id}" ${selectedSet.has(String(r.id)) ? "selected" : ""}>${r.name}</option>`).join("");
}

function renderDivisionOptions(selected = "") {
  const selectedSet = new Set((Array.isArray(selected) ? selected : [selected]).filter(Boolean).map((value) => String(value)));
  return allDivisions.map((d) => `<option value="${d.id}" ${selectedSet.has(String(d.id)) ? "selected" : ""}>${d.name}</option>`).join("");
}

function getSelectedValues(select) {
  if (!(select instanceof HTMLSelectElement)) return [];
  return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function escAttr(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bindCreateForm() {
  const form = qs("#createUserForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const email = qs("#newUserEmail")?.value?.trim();
      const username = qs("#newUserUsername")?.value?.trim() || undefined;
      const phone = qs("#newUserPhone")?.value?.trim() || undefined;
      const password = qs("#newUserPassword")?.value || "";
      const displayName = qs("#newUserName")?.value?.trim() || undefined;
      const authMethod = qs("#newUserAuthMethod")?.value;
      const roleId = qs("#newUserRole")?.value;
      const divisionValue = qs("#newUserDivision")?.value || "";
      const role = allRoles.find((r) => String(r.id) === String(roleId));

      if (!authMethod) {
        showToast("Choose an auth method (Local or Supabase)", "error");
        return;
      }
      if (!email || !role?.code) {
        showToast("Email and role are required", "error");
        return;
      }
      if (password.length < 8) {
        showToast("Initial password must be at least 8 characters", "error");
        return;
      }
      if (String(phone || "").replace(/\D/g, "").length < 10) {
        showToast("A valid registered mobile number is required for WhatsApp and the protected credential PDF", "error");
        return;
      }

      // Division: "" = none, "__ALL__" = global scope, otherwise a specific division.
      let divisionCode;
      let divisionScope = "assigned";
      if (divisionValue === "__ALL__") {
        divisionScope = "all";
      } else if (divisionValue) {
        const division = allDivisions.find((d) => String(d.id) === String(divisionValue));
        divisionCode = division?.code;
      }

      if (authMethod === "local") {
        // Sprint 13F: LOCAL account (no Supabase Auth).
        await provisionLocalUser({ email, username, phone, displayName, password, roleCode: role.code, divisionCode, divisionScope });
      } else {
        // Supabase Auth account via the admin-provision-user edge function.
        // (Edge path assigns a single division; global scope is role-derived.)
        await provisionUserViaEdge({ email, username, phone, password, displayName, roleCode: role.code, divisionCode });
      }
      showToast("User provisioned", "success");
      const divisionLabel = divisionValue === "__ALL__"
        ? "All Divisions"
        : (allDivisions.find((d) => String(d.id) === String(divisionValue))?.name || "No Division");
      const loginUsername = authMethod === "supabase" ? email : (username || email);
      const deliveryWarnings = await deliverStaffCredentials({
        email,
        username: loginUsername,
        phone,
        display_name: displayName || email,
        auth_provider: authMethod,
        user_roles: [{ roles: { name: role.name || role.code } }],
        user_divisions: divisionValue === "__ALL__"
          ? [{ scope: "all", divisions: null }]
          : [{ scope: "assigned", divisions: { name: divisionLabel } }]
      }, password);
      if (deliveryWarnings.length) showToast(`User created. ${deliveryWarnings.join("; ")}`, "warning");
      else showToast("Protected credentials sent by email and WhatsApp", "info");
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
