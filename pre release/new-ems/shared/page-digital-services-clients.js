import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { convertLeadToClient, deleteClient, listClients, listLeads, saveClient } from "./digital-services-api.js";
import { showToast } from "./utils.js";

const state = { clients: [], leads: [], editing: null };
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function render() {
  const c = state.editing || {};
  const availableLeads = state.leads.filter((lead) => !lead.converted_client_id && lead.stage !== "lost");
  renderModuleContent(`
    <style>
      .ds-field input,.ds-field select,.ds-field textarea{width:100%}
    </style>
    <section class="card"><h3>Clients</h3><p class="muted">Won accounts served by Digital Marketing & Services.</p></section>
    <section class="card" style="margin-top:1rem">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:start;flex-wrap:wrap"><div><h3>Available Leads (${availableLeads.length})</h3><p class="muted">Convert an existing lead and reuse its name, company, email, phone, and source information automatically.</p></div></div>
      <div class="table-shell"><table>
        <thead><tr><th>Lead</th><th>Contact</th><th>Stage</th><th>Source</th><th>Action</th></tr></thead>
        <tbody>${availableLeads.map((lead) => `<tr><td><strong>${esc(lead.company_name || lead.name)}</strong><br><span class="muted">${esc(lead.name)}</span></td><td>${esc(lead.email || lead.phone || "—")}</td><td><span class="meta-pill">${esc(lead.stage)}</span></td><td>${esc(lead.source || "—")}</td><td><button class="btn btn-ghost ds-lead-convert" data-id="${esc(lead.id)}" type="button">Convert to Client</button></td></tr>`).join("") || '<tr><td colspan="5">No unconverted leads are available.</td></tr>'}</tbody>
      </table></div>
    </section>
    <div class="ds-workspace-grid" style="margin-top:1rem">
      <section class="card ds-form-card">
        <h3>${state.editing ? "Edit Client" : "New Client"}</h3>
        <form id="dsClientForm" class="ds-compact-form">
          <input type="hidden" name="id" value="${esc(c.id || "")}" />
          <div class="ds-field"><label>Name *</label><input name="name" value="${esc(c.name || "")}" required /></div>
          <div class="ds-field"><label>Company</label><input name="company_name" value="${esc(c.company_name || "")}" /></div>
          <div class="ds-field"><label>Email</label><input name="email" type="email" value="${esc(c.email || "")}" /></div>
          <div class="ds-field"><label>Phone</label><input name="phone" value="${esc(c.phone || "")}" /></div>
          <div class="ds-field"><label>WhatsApp</label><input name="whatsapp" value="${esc(c.whatsapp || "")}" /></div>
          <div class="ds-field"><label>GSTIN</label><input name="gstin" value="${esc(c.gstin || "")}" /></div>
          <div class="ds-field"><label>City</label><input name="city" value="${esc(c.city || "")}" /></div>
          <div class="ds-field ds-field--wide"><label>Address</label><textarea name="address" rows="2">${esc(c.address || "")}</textarea></div>
          <div class="ds-field"><label>Status</label><select name="status"><option value="active" ${c.status === "active" ? "selected" : ""}>Active</option><option value="prospect" ${c.status === "prospect" ? "selected" : ""}>Prospect</option><option value="inactive" ${c.status === "inactive" ? "selected" : ""}>Inactive</option></select></div>
          <div class="ds-field ds-field--wide"><label>Notes</label><textarea name="notes" rows="2">${esc(c.notes || "")}</textarea></div>
          <div class="ds-form-actions"><button class="btn" type="submit">${state.editing ? "Update" : "Add Client"}</button>${state.editing ? '<button class="btn btn-ghost" type="button" id="dsCancel">Cancel</button>' : ""}</div>
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
            <td style="white-space:nowrap"><button class="btn btn-ghost ds-edit" data-id="${esc(row.id)}" type="button">Edit</button><button class="btn btn-ghost ds-delete" data-id="${esc(row.id)}" type="button">Delete</button></td>
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
    const payload = { name: f.name.value.trim(), companyName: f.company_name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), whatsapp: f.whatsapp.value.trim(), gstin: f.gstin.value.trim(), address: f.address.value.trim(), city: f.city.value.trim(), status: f.status.value, notes: f.notes.value.trim() };
    if (!payload.name) return showToast("Name is required.", TOAST_TYPES.ERROR);
    try { await saveClient(payload, f.id.value || null); showToast("Client saved.", TOAST_TYPES.SUCCESS); state.editing = null; await reload(); }
    catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelector("#dsCancel")?.addEventListener("click", () => { state.editing = null; render(); });
  document.querySelectorAll(".ds-edit").forEach((b) => b.addEventListener("click", () => { state.editing = state.clients.find((x) => x.id === b.getAttribute("data-id")) || null; render(); }));
  document.querySelectorAll(".ds-delete").forEach((button) => button.addEventListener("click", async () => {
    const client = state.clients.find((row) => row.id === button.dataset.id);
    if (!client || !confirm(`Delete client "${client.company_name || client.name}"? This is allowed only when no projects or billing records are linked.`)) return;
    button.disabled = true;
    try { await deleteClient(client.id); showToast("Client deleted.", TOAST_TYPES.SUCCESS); if (state.editing?.id === client.id) state.editing = null; await reload(); }
    catch (error) { showToast(error?.message || "Client could not be deleted.", TOAST_TYPES.ERROR); button.disabled = false; }
  }));
  document.querySelectorAll(".ds-lead-convert").forEach((button) => button.addEventListener("click", async () => {
    const lead = state.leads.find((row) => row.id === button.dataset.id);
    if (!lead || !confirm(`Convert "${lead.company_name || lead.name}" to a client using the existing lead details?`)) return;
    button.disabled = true;
    try { await convertLeadToClient(lead); showToast("Lead converted to client.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (error) { showToast(error?.message || "Lead conversion failed.", TOAST_TYPES.ERROR); button.disabled = false; }
  }));
}

async function reload() {
  [state.clients, state.leads] = await Promise.all([listClients().catch(() => []), listLeads().catch(() => [])]);
  render();
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_CLIENTS, pageTitle: "Clients", pageDescription: "Digital Marketing & Services clients", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  await reload();
}
init();
