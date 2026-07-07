import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { convertLeadToClient, listLeads, listServiceTypes, saveLead } from "./digital-services-api.js";
import { showToast } from "./utils.js";

const state = { leads: [], services: [], editing: null };
const STAGES = ["new", "contacted", "proposal", "won", "lost"];
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(v) { return "₹" + Number(v || 0).toLocaleString("en-IN"); }

function render() {
  const l = state.editing || {};
  const svcOptions = state.services.map((s) => `<option value="${esc(s.code)}" ${l.service_type === s.code ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  renderModuleContent(`
    <style>
      .ds-grid{display:grid;grid-template-columns:minmax(300px,1fr) minmax(340px,1.5fr);gap:1rem;align-items:start}
      .ds-field{display:grid;gap:.3rem;margin-bottom:.7rem}.ds-field label{font-weight:700;font-size:.8rem}
      .ds-field input,.ds-field select,.ds-field textarea{width:100%}
      @media(max-width:980px){.ds-grid{grid-template-columns:1fr}}
    </style>
    <section class="card"><h3>Leads</h3><p class="muted">CRM pipeline: new → contacted → proposal → won/lost. Convert a won lead into a client.</p></section>
    <div class="ds-grid" style="margin-top:1rem">
      <section class="card">
        <h3>${state.editing ? "Edit Lead" : "New Lead"}</h3>
        <form id="dsLeadForm">
          <input type="hidden" name="id" value="${esc(l.id || "")}" />
          <div class="ds-field"><label>Name *</label><input name="name" value="${esc(l.name || "")}" required /></div>
          <div class="ds-field"><label>Company</label><input name="company_name" value="${esc(l.company_name || "")}" /></div>
          <div class="ds-field"><label>Email</label><input name="email" type="email" value="${esc(l.email || "")}" /></div>
          <div class="ds-field"><label>Phone</label><input name="phone" value="${esc(l.phone || "")}" /></div>
          <div class="ds-field"><label>Service Interest</label><select name="service_type"><option value="">—</option>${svcOptions}</select></div>
          <div class="ds-field"><label>Source</label><input name="source" value="${esc(l.source || "")}" placeholder="Referral, website, ads..." /></div>
          <div class="ds-field"><label>Estimated Value (₹)</label><input name="estimated_value" type="number" value="${esc(l.estimated_value || 0)}" /></div>
          <div class="ds-field"><label>Stage</label><select name="stage">${STAGES.map((s) => `<option value="${s}" ${l.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
          <div class="ds-field"><label>Notes</label><textarea name="notes" rows="2">${esc(l.notes || "")}</textarea></div>
          <div style="display:flex;gap:.6rem"><button class="btn" type="submit">${state.editing ? "Update" : "Add Lead"}</button>${state.editing ? '<button class="btn btn-ghost" type="button" id="dsCancel">Cancel</button>' : ""}</div>
        </form>
      </section>
      <section class="card">
        <h3>Pipeline (${state.leads.length})</h3>
        <div class="table-shell"><table>
          <thead><tr><th>Lead</th><th>Service</th><th>Value</th><th>Stage</th><th></th></tr></thead>
          <tbody>${state.leads.map((row) => `<tr>
            <td><strong>${esc(row.company_name || row.name)}</strong><br><span class="muted">${esc(row.email || row.phone || "")}</span></td>
            <td>${esc((state.services.find((s) => s.code === row.service_type) || {}).label || "-")}</td>
            <td>${money(row.estimated_value)}</td>
            <td><span class="meta-pill">${esc(row.stage)}</span></td>
            <td style="white-space:nowrap"><button class="btn btn-ghost ds-edit" data-id="${esc(row.id)}" type="button">Edit</button>${row.converted_client_id ? "" : `<button class="btn btn-ghost ds-convert" data-id="${esc(row.id)}" type="button">Convert</button>`}</td>
          </tr>`).join("") || '<tr><td colspan="5">No leads yet.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>
  `);
  bind();
}

function bind() {
  document.querySelector("#dsLeadForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const payload = { name: f.name.value.trim(), companyName: f.company_name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), serviceType: f.service_type.value || null, source: f.source.value.trim(), estimatedValue: f.estimated_value.value, stage: f.stage.value, notes: f.notes.value.trim() };
    if (!payload.name) return showToast("Name is required.", TOAST_TYPES.ERROR);
    try { await saveLead(payload, f.id.value || null); showToast("Lead saved.", TOAST_TYPES.SUCCESS); state.editing = null; await reload(); }
    catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelector("#dsCancel")?.addEventListener("click", () => { state.editing = null; render(); });
  document.querySelectorAll(".ds-edit").forEach((b) => b.addEventListener("click", () => { state.editing = state.leads.find((x) => x.id === b.getAttribute("data-id")) || null; render(); }));
  document.querySelectorAll(".ds-convert").forEach((b) => b.addEventListener("click", async () => {
    const lead = state.leads.find((x) => x.id === b.getAttribute("data-id"));
    if (!lead || !confirm(`Convert "${lead.name}" into a client?`)) return;
    try { await convertLeadToClient(lead); showToast("Lead converted to client.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Convert failed.", TOAST_TYPES.ERROR); }
  }));
}

async function reload() { state.leads = await listLeads().catch(() => []); render(); }

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_LEADS, pageTitle: "Leads", pageDescription: "Digital Services pipeline", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  state.services = await listServiceTypes().catch(() => []);
  await reload();
}
init();
