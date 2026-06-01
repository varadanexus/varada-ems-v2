import { TOAST_TYPES } from "../config/constants.js";
import { createMasterRecord, listMasterRecords, softDeleteMasterRecord, updateMasterRecord } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

export async function initMasterDataPage({
  moduleCode,
  pageTitle,
  pageDescription,
  table,
  fields
}) {
  let page = 1;
  const pageSize = 10;
  let currentRows = [];

  await bootstrapProtectedPage({ moduleCode, pageTitle, pageDescription });

  renderModuleContent(`
    <div class="card" style="margin-bottom:1rem;">
      <h3>${pageTitle} - Create</h3>
      <form id="masterCreateForm" class="form-row"></form>
    </div>
    <div class="card" style="margin-bottom:1rem;">
      <input id="masterSearch" type="text" placeholder="Search by code/name" />
    </div>
    <div class="table-shell">
      <table>
        <thead><tr>${fields.map((f) => `<th>${f.label}</th>`).join("")}<th>Status</th><th>Actions</th></tr></thead>
        <tbody id="masterBody"></tbody>
      </table>
    </div>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center;">
      <button class="btn" id="masterPrev">Prev</button>
      <span id="masterPageMeta"></span>
      <button class="btn" id="masterNext">Next</button>
    </div>
  `);

  renderCreateForm(fields);
  bindCreate();
  bindListControls();
  await loadList();

  function renderCreateForm(formFields) {
    const form = qs("#masterCreateForm");
    if (!form) return;
    form.innerHTML = `
      ${formFields.map((f) => `<input data-field="${f.key}" type="text" placeholder="${f.label}" ${f.required ? "required" : ""} />`).join("")}
      <button class="btn" type="submit">Create</button>
    `;
  }

  function bindCreate() {
    const form = qs("#masterCreateForm");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = { is_active: true };
      fields.forEach((f) => {
        const value = qs(`[data-field='${f.key}']`)?.value?.trim();
        if (value) payload[f.key] = value;
      });

      try {
        const created = await createMasterRecord(table, payload);
        await logAuditEvent("master_create", {
          moduleCode,
          entityType: table,
          entityId: created?.id,
          details: payload,
          afterData: payload,
          action: "create"
        });
        showToast("Created successfully", TOAST_TYPES.SUCCESS);
        form.reset();
        await loadList();
      } catch (error) {
        showToast(error?.message || "Create failed", TOAST_TYPES.ERROR);
      }
    });
  }

  function bindListControls() {
    qs("#masterSearch")?.addEventListener("input", async () => {
      page = 1;
      await loadList();
    });

    qs("#masterPrev")?.addEventListener("click", async () => {
      if (page > 1) {
        page -= 1;
        await loadList();
      }
    });

    qs("#masterNext")?.addEventListener("click", async () => {
      page += 1;
      await loadList();
    });
  }

  async function loadList() {
    const search = qs("#masterSearch")?.value?.trim() || "";
    const { rows, count } = await listMasterRecords(table, { search, page, pageSize });
    currentRows = rows;
    const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));
    if (page > totalPages) {
      page = totalPages;
      return loadList();
    }

    const pageMeta = qs("#masterPageMeta");
    if (pageMeta) pageMeta.textContent = `Page ${page} / ${totalPages}`;

    const body = qs("#masterBody");
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${fields.length + 2}">No records found</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((row) => {
      return `
        <tr>
          ${fields.map((f) => `<td><input data-edit-${f.key}="${row.id}" value="${row[f.key] || ""}" /></td>`).join("")}
          <td>
            <select data-edit-status="${row.id}">
              <option value="true" ${row.is_active ? "selected" : ""}>Active</option>
              <option value="false" ${!row.is_active ? "selected" : ""}>Inactive</option>
            </select>
          </td>
          <td>
            <button class="btn" data-save-id="${row.id}">Save</button>
            <button class="btn btn-danger" data-delete-id="${row.id}">Delete</button>
          </td>
        </tr>
      `;
    }).join("");

    bindRowActions();
  }

  function bindRowActions() {
    qs("#masterBody")?.querySelectorAll("button[data-save-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-save-id");
        const before = currentRows.find((r) => String(r.id) === String(id)) || {};
        const payload = { is_active: (qs(`[data-edit-status='${id}']`)?.value || "true") === "true" };
        fields.forEach((f) => {
          const raw = qs(`[data-edit-${f.key}='${id}']`)?.value?.trim() || null;
          if (raw && ["distance_km", "cgst_rate", "sgst_rate", "igst_rate"].includes(f.key)) {
            payload[f.key] = Number(raw);
          } else {
            payload[f.key] = raw;
          }
        });
        try {
          await updateMasterRecord(table, id, payload);
          await logAuditEvent("master_update", {
            moduleCode,
            entityType: table,
            entityId: id,
            beforeData: before,
            afterData: payload,
            details: payload,
            action: "update"
          });
          showToast("Updated", TOAST_TYPES.SUCCESS);
          await loadList();
        } catch (error) {
          showToast(error?.message || "Update failed", TOAST_TYPES.ERROR);
        }
      });
    });

    qs("#masterBody")?.querySelectorAll("button[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-id");
        const before = currentRows.find((r) => String(r.id) === String(id)) || {};
        try {
          await softDeleteMasterRecord(table, id);
          await logAuditEvent("master_soft_delete", {
            moduleCode,
            entityType: table,
            entityId: id,
            beforeData: before,
            afterData: { deleted_at: new Date().toISOString() },
            details: { deleted: true },
            action: "soft_delete"
          });
          showToast("Deleted", TOAST_TYPES.SUCCESS);
          await loadList();
        } catch (error) {
          showToast(error?.message || "Delete failed", TOAST_TYPES.ERROR);
        }
      });
    });
  }
}
