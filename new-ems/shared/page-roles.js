import { MODULES, WORKSPACES } from "../config/constants.js";
import { listPermissions, listRolePermissions, listRoles, setRolePermission } from "./admin-api.js";
import { logUserRoleEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

async function init() {
  await bootstrapProtectedPage({
    moduleCode: MODULES.ROLES,
    pageTitle: "Roles & Permissions",
    pageDescription: "RBAC foundation shell with module-level permission matrix placeholder",
    workspace: WORKSPACES.ADMIN
  });

  renderModuleContent(`
    <div class="card" style="margin-bottom:1rem;">
      <input id="permSearch" type="text" placeholder="Filter by role/module/action" />
    </div>
    <div class="table-shell"><table><thead><tr><th>Role</th><th>Module</th><th>Action</th><th>Allow</th></tr></thead><tbody id="permBody"></tbody></table></div>
  `);
  qs("#permSearch")?.addEventListener("input", () => loadPermissionMatrix());
  await loadPermissionMatrix();
}

async function loadPermissionMatrix() {
  const [roles, permissions, grants] = await Promise.all([listRoles(), listPermissions(), listRolePermissions()]);
  const body = qs("#permBody");
  if (!body) return;

  const grantSet = new Set((grants || []).map((g) => `${g.role_id}:${g.permission_id}`));
  const q = (qs("#permSearch")?.value || "").trim().toLowerCase();
  const rows = [];
  roles.forEach((r) => {
    permissions.forEach((p) => {
      const hay = `${r.name} ${p.module_code} ${p.action_code}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const key = `${r.id}:${p.id}`;
      rows.push(`
        <tr>
          <td>${r.name}</td>
          <td>${p.module_code}</td>
          <td>${p.action_code}</td>
          <td><input type="checkbox" data-role-id="${r.id}" data-perm-id="${p.id}" ${grantSet.has(key) ? "checked" : ""} /></td>
        </tr>
      `);
    });
  });
  body.innerHTML = rows.join("");

  body.querySelectorAll("input[type='checkbox']").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const roleId = chk.getAttribute("data-role-id");
      const permissionId = chk.getAttribute("data-perm-id");
      const allow = chk.checked;
      try {
        await setRolePermission(roleId, permissionId, allow);
        await logUserRoleEvent("role_permission_change", { entityType: "role_permissions", entityId: `${roleId}:${permissionId}`, allow });
        showToast("Permission updated", "success");
      } catch (error) {
        chk.checked = !allow;
        showToast(error?.message || "Failed to update permission", "error");
      }
    });
  });
}

init();
