import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { listClients, saveClient } from "./digital-services-api.js";
import { showToast } from "./utils.js";

const state = { clients: [], editing: null };
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function render() {
  const c = state.editing || {};
  renderModuleContent(`
    <style>
      .ds-grid{display:grid;grid-template-columns:minmax(300px,1fr) minmax(340px,1.4fr);gap:1rem;align-items:start}
      .ds-field{display:grid;gap:.3rem;margin-bottom:.7rem}.ds-field label{font-weight:700;font-size:.8rem}
      .ds-field input,.ds-field select,.ds-field textarea{width:100%}
      @media(max-width:980px){.ds-grid{grid-template-columns:1fr}}
    </style>
    <section class="card"><h3>Clients</h3><p class="muted">Won accounts you deliver digital services to.</p></section>
    <div class="ds-grid" style="margin-top:1rem">
      <section class="card">
        <h3>${state.editing ? "Edit Client" : "New Client"}</h3>
        <form id="dsClientForm">
          <input type="hidden" name="id" value="${esc(c.id || "")}" />
          <div class="ds-field"><label>Name *</label><input name="name" value="${esc(c.name || "")}" required /></div>
          <div class="ds-field"><label>Company</label><input name="company_name" value="${esc(c.company_name || "")}" /></div>
          <div class="ds-field"><label>Email</label><input name="email" type="email" value="${esc(c.email || "")}" /></div>
          <div class="ds-field"><label>Phone</label><input name="phone" value="${esc(c.phone || "")}" /></div>
          <div class="ds-field"><label>WhatsApp</label><input name="whatsapp" value="${esc(c.whatsapp || "")}" /></div>
          <div class="ds-field"><label>GSTIN</label><input name="gstin" value="${esc(c.gstin || "")}" /></div>
          <div class="ds-field"><label>City</label><input name="city" value="${esc(c.city || "")}" /></div>
          <div class="ds-field"><label>Status</label><select name="status"><option value="active" ${c.status === "active" ? "selected" : ""}>Active</option><option value="prospect" ${c.status === "prospect" ? "selected" : ""}>Prospect</option><option value="inactive" ${c.status === "inactive" ? "selected" : ""}>Inactive</option></select></div>
          <div class="ds-field"><label>Notes</label><textarea name="notes" rows="2">${esc(c.notes || "")}</textarea></div>
          <div style="display:flex;gap:.6rem"><button class="btn" type="submit">${state.editing ? "Update" : "Add Client"}</button>${state.editing ? '<button class="btn btn-ghost" type="button" id="dsCancel">Cancel</button>' : ""}</div>
        </form>
      </section>
      <section class="card">
        <h3>All Clients (${state.clients.length})</h3>
        <div class="table-shell"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th></th></tr></thead>
          <tbody>${state.clients.map((row) => `<tr>
            <td><strong>${esc(row.company_name || row.name)}</strong><br><span class="muted">${esc(row.name)}</span></td>
            <td>${esc(row.email || "-")}<br><span class="muted">${esc(row.phone || "")}</span></td>
            <td><span class="meta-pill">${esc(row.status)}</span></td>
            <td><button class="btn btn-ghost ds-edit" data-id="${esc(row.id)}" type="button">Edit</button></td>
          </tr>`).join("") || '<tr><td colspan="4">No clients yet.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>
  `);
  bind();
}

function bind() {
  document.querySelector("#dsClientForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const payload = { name: f.name.value.trim(), companyName: f.company_name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), whatsapp: f.whatsapp.value.trim(), gstin: f.gstin.value.trim(), city: f.city.value.trim(), status: f.status.value, notes: f.notes.value.trim() };
    if (!payload.name) return showToast("Name is required.", TOAST_TYPES.ERROR);
    try { await saveClient(payload, f.id.value || null); showToast("Client saved.", TOAST_TYPES.SUCCESS); state.editing = null; await reload(); }
    catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelector("#dsCancel")?.addEventListener("click", () => { state.editing = null; render(); });
  document.querySelectorAll(".ds-edit").forEach((b) => b.addEventListener("click", () => { state.editing = state.clients.find((x) => x.id === b.getAttribute("data-id")) || null; render(); }));
}

async function reload() { state.clients = await listClients().catch(() => []); render(); }

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_CLIENTS, pageTitle: "Clients", pageDescription: "Digital Services clients", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  await reload();
}
init();
