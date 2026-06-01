import { TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { createMasterRecord, existsActiveDuplicate, listActiveOptions, listMasterRecords, softDeleteMasterRecord, updateMasterRecord } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

export async function initMasterDataPage({
  moduleCode,
  pageTitle,
  pageDescription,
  workspace = WORKSPACES.MASTER_DATA,
  table,
  fields,
  searchColumns = ["name", "code"],
  divisionScoped = true,
  uniqueChecks = [],
  validate = null
}) {
  let page = 1;
  const pageSize = 10;
  let currentRows = [];

  await bootstrapProtectedPage({ moduleCode, pageTitle, pageDescription, workspace });
  const divisionScope = localStorage.getItem("ems_division_scope") || "all";
  const divisionId = divisionScope !== "all" ? divisionScope : null;

  renderModuleContent(`
    <div class="card" style="margin-bottom:1rem;">
      <h3>${pageTitle} - Create</h3><p class="muted">Division scope: ${divisionScope}</p>
      <form id="masterCreateForm" class="form-row"></form>
    </div>
    <div class="card" style="margin-bottom:1rem;">
       <input id="masterSearch" type="text" placeholder="Search records" />
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
    form.innerHTML = `${formFields.map((f) => renderField(f, null, "create")).join("")}
      <div id="masterFormError" class="muted"></div>
      <button class="btn" type="submit">Create</button>`;
    hydrateSelectOptions("create", null);
  }

  function renderField(f, rowId = null, mode = "create", value = "") {
    const attr = mode === "create" ? `data-field="${f.key}"` : `data-edit-${f.key}="${rowId}"`;
    const id = `${mode}-${f.key}-${rowId || "new"}`;
    if (f.type === "select") return `<label for="${id}">${f.label}${f.required ? " *" : ""}</label><select id="${id}" ${attr}></select>`;
    return `<label for="${id}">${f.label}${f.required ? " *" : ""}</label><input id="${id}" ${attr} type="${f.type || "text"}" placeholder="${f.label}" value="${value || ""}" ${f.required ? "required" : ""} />`;
  }

  async function hydrateSelectOptions(mode, rowId) {
    for (const f of fields.filter((x) => x.type === "select")) {
      const sel = mode === "create" ? qs(`[data-field='${f.key}']`) : qs(`[data-edit-${f.key}='${rowId}']`);
      if (!sel) continue;
      const opts = await listActiveOptions(f.optionTable, {
        labelField: f.optionLabel || "name",
        valueField: f.optionValue || "id",
        divisionId: f.divisionScoped ? divisionId : null
      });
      sel.innerHTML = `<option value="">Select ${f.label}</option>${opts.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}`;
    }
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
      if (divisionScoped && divisionId && !payload.division_id) payload.division_id = divisionId;

      const validationError = await validatePayload(payload);
      if (validationError) {
        showFormError(validationError);
        return;
      }

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
        showFormError("");
        form.reset();
        hydrateSelectOptions("create", null);
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
    const { rows, count } = await listMasterRecords(table, { search, page, pageSize, divisionId: divisionScoped ? divisionId : null, searchColumns });
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
      body.innerHTML = `<tr><td colspan="${fields.length + 2}">No active records found for current filters.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((row) => {
      return `
        <tr>
          ${fields.map((f) => `<td>${f.type === "select" ? `<select data-edit-${f.key}="${row.id}"></select>` : `<input data-edit-${f.key}="${row.id}" value="${row[f.key] || ""}" />`}</td>`).join("")}
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
    for (const row of rows) {
      for (const f of fields.filter((x) => x.type === "select")) {
        await hydrateSelectOptions("edit", row.id);
        const sel = qs(`[data-edit-${f.key}='${row.id}']`);
        if (sel) sel.value = row[f.key] || "";
      }
    }
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
        const validationError = await validatePayload(payload, { id, before });
        if (validationError) {
          showToast(validationError, TOAST_TYPES.ERROR);
          return;
        }
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

  async function validatePayload(payload, context = null) {
    for (const f of fields) {
      if (f.required && !payload[f.key]) return `${f.label} is required.`;
      if (f.validator) {
        const result = await f.validator(payload[f.key], payload, context);
        if (result) return result;
      }
    }
    for (const check of uniqueChecks) {
      const filters = {};
      check.keys.forEach((k) => (filters[k] = payload[k]));
      const duplicate = await existsActiveDuplicate(table, filters, context?.id || null);
      if (duplicate) return check.message || "Duplicate active record found.";
    }
    if (validate) return await validate(payload, context);
    return null;
  }

  function showFormError(message) {
    const target = qs("#masterFormError");
    if (!target) return;
    target.textContent = message || "";
  }
}
