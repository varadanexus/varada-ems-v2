import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { deleteEmailTemplate, listEmailTemplates, saveEmailTemplate } from "./email-api.js";
import { showToast } from "./utils.js";

const state = { templates: [], editing: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function render() {
  const t = state.editing || {};
  renderModuleContent(`
    <style>
      .em-tpl-grid{display:grid;grid-template-columns:minmax(320px,1fr) minmax(340px,1.2fr);gap:1rem;align-items:start}
      .em-field{display:grid;gap:.3rem;margin-bottom:.7rem}
      .em-field label{font-weight:800}
      .em-field input,.em-field textarea,.em-field select{width:100%;min-width:0}
      @media(max-width:980px){.em-tpl-grid{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Email Templates</h3>
      <p class="muted">Reusable subject and body blocks. Use <code>{{variable}}</code> tokens for substitution when sending programmatically. Alias must be unique.</p>
    </section>

    <div class="em-tpl-grid" style="margin-top:1rem;">
      <section class="card">
        <h3>${state.editing ? "Edit Template" : "New Template"}</h3>
        <form id="emTplForm">
          <input type="hidden" name="id" value="${escapeHtml(t.id || "")}" />
          <div class="em-field"><label>Alias</label><input name="alias" value="${escapeHtml(t.alias || "")}" placeholder="welcome_email" ${t.id ? "readonly" : ""} /></div>
          <div class="em-field"><label>Title</label><input name="title" value="${escapeHtml(t.title || "")}" placeholder="Welcome Email" /></div>
          <div class="em-field"><label>Module</label><input name="module_name" value="${escapeHtml(t.module_name || "general")}" placeholder="general" /></div>
          <div class="em-field"><label>Category</label><input name="category" value="${escapeHtml(t.category || "transactional")}" placeholder="transactional" /></div>
          <div class="em-field"><label>Subject</label><input name="subject" value="${escapeHtml(t.subject || "")}" placeholder="Welcome to {{company}}" /></div>
          <div class="em-field"><label>Text Body</label><textarea name="text_body" rows="6" placeholder="Hello {{name}}, ...">${escapeHtml(t.text_body || "")}</textarea></div>
          <div class="em-field"><label>HTML Body (optional)</label><textarea name="html_body" rows="5" placeholder="<p>Hello {{name}}</p>">${escapeHtml(t.html_body || "")}</textarea></div>
          <div class="em-field"><label>Variables (comma separated)</label><input name="variables" value="${escapeHtml((t.variables || []).join(", "))}" placeholder="name, company" /></div>
          <label class="notification-checkbox"><input type="checkbox" name="is_active" ${t.is_active === false ? "" : "checked"} /> <span>Active</span></label>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.8rem;">
            <button class="btn" type="submit">${state.editing ? "Update" : "Create"}</button>
            ${state.editing ? '<button class="btn btn-ghost" type="button" id="emTplCancel">Cancel</button>' : ""}
          </div>
        </form>
      </section>

      <section class="card">
        <h3>Existing Templates</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>Alias</th><th>Title</th><th>Subject</th><th>Active</th><th></th></tr></thead>
            <tbody>
              ${state.templates.map((row) => `
                <tr>
                  <td>${escapeHtml(row.alias)}</td>
                  <td>${escapeHtml(row.title)}</td>
                  <td>${escapeHtml(row.subject || "-")}</td>
                  <td><span class="meta-pill">${row.is_active ? "Active" : "Inactive"}</span></td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-ghost em-tpl-edit" data-id="${escapeHtml(row.id)}" type="button">Edit</button>
                    <button class="btn btn-ghost em-tpl-del" data-id="${escapeHtml(row.id)}" type="button">Delete</button>
                  </td>
                </tr>
              `).join("") || '<tr><td colspan="5">No templates yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `);
  bind();
}

function bind() {
  document.querySelector("#emTplForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      alias: form.elements.alias.value.trim(),
      title: form.elements.title.value.trim(),
      moduleName: form.elements.module_name.value.trim(),
      category: form.elements.category.value.trim(),
      subject: form.elements.subject.value.trim(),
      textBody: form.elements.text_body.value,
      htmlBody: form.elements.html_body.value,
      variables: form.elements.variables.value.split(",").map((v) => v.trim()).filter(Boolean),
      isActive: form.elements.is_active.checked
    };
    if (!payload.alias || !payload.title) return showToast("Alias and title are required.", TOAST_TYPES.ERROR);
    try {
      await saveEmailTemplate(payload);
      showToast("Template saved.", TOAST_TYPES.SUCCESS);
      state.editing = null;
      await reload();
    } catch (error) {
      showToast(error?.message || "Save failed.", TOAST_TYPES.ERROR);
    }
  });

  document.querySelector("#emTplCancel")?.addEventListener("click", () => { state.editing = null; render(); });

  document.querySelectorAll(".em-tpl-edit").forEach((btn) => btn.addEventListener("click", () => {
    state.editing = state.templates.find((t) => t.id === btn.getAttribute("data-id")) || null;
    render();
  }));

  document.querySelectorAll(".em-tpl-del").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Delete this template?")) return;
    try {
      await deleteEmailTemplate(btn.getAttribute("data-id"));
      showToast("Template deleted.", TOAST_TYPES.SUCCESS);
      if (state.editing && state.editing.id === btn.getAttribute("data-id")) state.editing = null;
      await reload();
    } catch (error) {
      showToast(error?.message || "Delete failed.", TOAST_TYPES.ERROR);
    }
  }));
}

async function reload() {
  const data = await listEmailTemplates().catch(() => ({ templates: [] }));
  state.templates = data.templates || [];
  render();
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.EMAIL_TEMPLATES,
    pageTitle: "Email Templates",
    pageDescription: "Reusable email subject and body templates with variables",
    workspace: WORKSPACES.EMAIL
  });
  if (!boot) return;
  await reload();
}

init();
