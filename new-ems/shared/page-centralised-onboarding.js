// Staff-facing Centralised Onboarding module: send onboarding links and review
// submissions. Lives under the Communications area.

import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import {
  createOnboardingRequest, sendOnboardingLink, listOnboardingRequests,
  getOnboardingSubmission, approveOnboarding
} from "./onboarding-api.js";

const DIVISIONS = [
  { code: "hospital-projects", label: "Hospital Projects" },
  { code: "interiors", label: "Interiors" },
  { code: "transport", label: "Transport" },
  { code: "digital-services", label: "Digital Marketing & Services" }
];
const DIVISION_LABEL = Object.fromEntries(DIVISIONS.map((d) => [d.code, d.label]));
const ENTITY_TYPES = [
  "Private Limited Company", "Public Limited Company", "Limited Liability Partnership (LLP)",
  "Partnership Firm", "Sole Proprietorship", "One Person Company (OPC)", "Trust", "Society",
  "Hindu Undivided Family (HUF)", "Cooperative Society", "Government / PSU", "Individual", "Other"
];

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusPill(s) {
  const map = { draft: "#8b8f99", sent: "#c39a44", verified: "#5aa0e0", in_progress: "#e0a95a", submitted: "#7fd6a2", approved: "#4fd18b", rejected: "#e06a6a", cancelled: "#8b8f99" };
  return `<span class="meta-pill" style="border-color:${map[s] || "#555"};color:${map[s] || "#ccc"}">${esc(s)}</span>`;
}

let cache = { requests: [] };

function renderShell() {
  const _initialView = new URLSearchParams(location.search).get("view") === "records" ? "records" : "send";
  renderModuleContent(`
    <style>
      .onb-tabs{display:flex;gap:.5rem;margin-bottom:1rem}
      .onb-tab{padding:.5rem .9rem;border:1px solid rgba(225,189,104,.25);border-radius:8px;cursor:pointer;color:#cfd3db;background:#0d0f14}
      .onb-tab.active{background:#c39a44;color:#050609;font-weight:800}
      .onb-form{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;max-width:760px}
      .onb-form .full{grid-column:1/-1}
      .onb-l{display:block;margin:.4rem 0 .2rem;font-size:.76rem;color:#c9cdd6}
      .onb-in{width:100%;box-sizing:border-box;background:#0a0b0e;border:1px solid #2a2d36;border-radius:8px;color:#eee;padding:.55rem .65rem}
      table.onb-tbl{width:100%;border-collapse:collapse;margin-top:.5rem}
      .onb-tbl th,.onb-tbl td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid #23262e;font-size:.85rem}
      .onb-link{color:#e6c87e;cursor:pointer;text-decoration:underline}
      .onb-detail{border:1px solid #23262e;border-radius:10px;padding:1rem;margin-top:1rem;background:#0b0c10}
      .onb-kv{display:grid;grid-template-columns:180px 1fr;gap:.3rem .8rem;font-size:.85rem}
      @media(max-width:760px){.onb-form{grid-template-columns:1fr}.onb-kv{grid-template-columns:1fr}}
    </style>
    <div class="onb-tabs">
      <div class="onb-tab ${_initialView === "send" ? "active" : ""}" data-tab="send">Send onboarding</div>
      <div class="onb-tab ${_initialView === "records" ? "active" : ""}" data-tab="records">Submissions</div>
    </div>
    <div id="onbBody"></div>
  `);
  document.querySelectorAll(".onb-tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".onb-tab").forEach((x) => x.classList.toggle("active", x === t));
    t.dataset.tab === "send" ? renderSend() : renderRecords();
  }));
  _initialView === "records" ? renderRecords() : renderSend();
}

function renderSend() {
  document.querySelector("#onbBody").innerHTML = `
    <section class="card"><h3>Send a new onboarding</h3>
      <p class="muted">Creates a secure link and sends it by email and WhatsApp (approved template).</p>
      <div class="onb-form">
        <div><label class="onb-l">Division</label>
          <select class="onb-in" id="s_div">${DIVISIONS.map((d) => `<option value="${d.code}">${d.label}</option>`).join("")}</select></div>
        <div><label class="onb-l">Entity / client name</label><input class="onb-in" id="s_entity" /></div>
        <div><label class="onb-l">Entity type</label>
          <select class="onb-in" id="s_type"><option value="">Select entity type…</option>${ENTITY_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></div>
        <div><label class="onb-l">Contact person</label><input class="onb-in" id="s_cname" /></div>
        <div><label class="onb-l">Contact phone (WhatsApp)</label><input class="onb-in" id="s_phone" placeholder="10-digit or +91…" /></div>
        <div><label class="onb-l">Contact email</label><input class="onb-in" id="s_email" /></div>
        <div class="full"><label class="onb-l">Notes (internal)</label><input class="onb-in" id="s_notes" /></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem">
        <button class="btn" id="s_send">Create &amp; send</button>
        <button class="btn btn-ghost" id="s_create">Create link only</button>
      </div>
      <div id="s_result" style="margin-top:.8rem"></div>
    </section>`;
  document.querySelector("#s_send").addEventListener("click", () => submitSend(true));
  document.querySelector("#s_create").addEventListener("click", () => submitSend(false));
}

async function submitSend(send) {
  const g = (id) => (document.querySelector(id)?.value || "").trim();
  const entity = g("#s_entity");
  if (!entity) return showToast("Entity name is required", "error");
  const btns = document.querySelectorAll("#s_send,#s_create");
  btns.forEach((b) => (b.disabled = true));
  try {
    const created = await createOnboardingRequest({
      division_code: g("#s_div"), entity_name: entity, entity_type: g("#s_type"),
      contact_name: g("#s_cname"), contact_phone: g("#s_phone"), contact_email: g("#s_email"),
      notes: g("#s_notes")
    });
    let msg = `Link created: <a class="onb-link" href="${esc(created.link)}" target="_blank">${esc(created.link)}</a>`;
    if (send) {
      const r = await sendOnboardingLink({ request_id: created.request_id });
      msg += `<br>Email: <strong>${esc(r.email || "n/a")}</strong> · WhatsApp: <strong>${esc(r.whatsapp || "n/a")}</strong>`;
    }
    document.querySelector("#s_result").innerHTML = `<div class="onb-detail">${msg}</div>`;
    showToast(send ? "Onboarding sent" : "Link created", "success");
  } catch (e) { showToast(e.message, "error"); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

async function renderRecords() {
  const body = document.querySelector("#onbBody");
  body.innerHTML = `<section class="card"><p class="muted">Loading submissions…</p></section>`;
  try {
    const r = await listOnboardingRequests({ limit: 200 });
    cache.requests = r.requests || [];
    body.innerHTML = `
      <section class="card"><h3>Onboarding submissions</h3>
        <table class="onb-tbl">
          <thead><tr><th>Entity</th><th>Division</th><th>Status</th><th>Contact</th><th>Created</th><th></th></tr></thead>
          <tbody>${cache.requests.map((row) => `
            <tr>
              <td>${esc(row.entity_name)}</td>
              <td>${esc(DIVISION_LABEL[row.division_code] || row.division_code)}</td>
              <td>${statusPill(row.status)}</td>
              <td>${esc(row.contact_name || row.contact_phone || row.contact_email || "-")}</td>
              <td>${esc((row.created_at || "").slice(0, 10))}</td>
              <td><span class="onb-link" data-view="${esc(row.id)}">View</span></td>
            </tr>`).join("") || `<tr><td colspan="6" class="muted">No onboardings yet.</td></tr>`}
          </tbody>
        </table>
        <div id="onbDetail"></div>
      </section>`;
    body.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", () => openDetail(el.dataset.view)));
  } catch (e) { body.innerHTML = `<section class="card"><p class="danger-text">${esc(e.message)}</p></section>`; }
}

async function openDetail(id) {
  const host = document.querySelector("#onbDetail");
  host.innerHTML = `<div class="onb-detail muted">Loading…</div>`;
  try {
    const r = await getOnboardingSubmission({ request_id: id });
    const req = r.request || {}; const sub = r.submission || {}; const d = sub.details || {};
    host.innerHTML = `
      <div class="onb-detail">
        <h4>${esc(req.entity_name)} — ${esc(DIVISION_LABEL[req.division_code] || req.division_code)} ${statusPill(req.status)}</h4>
        <div class="onb-kv">
          <div>Legal name</div><div>${esc(d.legal_name || "-")}</div>
          <div>Entity type</div><div>${esc(d.entity_type || req.entity_type || "-")}</div>
          <div>Registration / CIN</div><div>${esc(d.registration_no || "-")}</div>
          <div>PAN</div><div>${esc(d.pan || "-")}</div>
          <div>GSTIN</div><div>${esc(d.gstin || "-")}</div>
          <div>Authorised signatory</div><div>${esc(d.signatory_name || "-")} ${esc(d.signatory_designation ? "(" + d.signatory_designation + ")" : "")}</div>
          <div>Contact</div><div>${esc(d.contact_phone || req.contact_phone || "-")} · ${esc(d.contact_email || req.contact_email || "-")}</div>
          <div>Address</div><div>${esc(d.address || "-")}</div>
        </div>
        <h4 style="margin-top:1rem">Documents</h4>
        ${(r.documents || []).length ? `<ul>${r.documents.map((x) => `<li>${esc(x.document_label || x.document_key)}: ${x.web_view_link ? `<a class="onb-link" target="_blank" href="${esc(x.web_view_link)}">${esc(x.file_name)}</a>` : esc(x.file_name)}</li>`).join("")}</ul>` : `<p class="muted">No documents.</p>`}
        <h4 style="margin-top:1rem">Live image &amp; T&amp;C</h4>
        <p class="muted">${sub.live_image_link ? `<a class="onb-link" target="_blank" href="${esc(sub.live_image_link)}">View live photo</a> · ` : ""}
        T&amp;C ${(r.acceptances || []).length ? `accepted (${esc(r.acceptances[0].terms_version)}) on ${esc((r.acceptances[0].accepted_at || "").slice(0, 19).replace("T", " "))}` : "not yet accepted"}</p>
        ${req.status === "submitted" ? `<div style="margin-top:1rem;display:flex;gap:.5rem">
          <button class="btn" id="onbApprove">Approve</button>
          <button class="btn btn-ghost" id="onbReject">Reject</button></div>` : ""}
      </div>`;
    document.querySelector("#onbApprove")?.addEventListener("click", () => decide(id, "approve"));
    document.querySelector("#onbReject")?.addEventListener("click", () => decide(id, "reject"));
  } catch (e) { host.innerHTML = `<div class="onb-detail danger-text">${esc(e.message)}</div>`; }
}

async function decide(id, decision) {
  try {
    await approveOnboarding({ request_id: id, decision });
    showToast(decision === "approve" ? "Approved" : "Rejected", "success");
    renderRecords();
  } catch (e) { showToast(e.message, "error"); }
}

(async function init() {
  const ctx = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRALISED_ONBOARDING,
    pageTitle: "Centralised Onboarding",
    pageDescription: "Send division-specific onboarding links and review client submissions.",
    workspace: WORKSPACES.ONBOARDING
  });
  if (!ctx) return;
  renderShell();
})();
