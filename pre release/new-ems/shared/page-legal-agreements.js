import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { escapeHtml, statusPill } from "./legal-workflow-data.js";
import { deleteLegalAgreement, listLegalData } from "./legal-api.js";
import { showToast } from "./utils.js";
import { TOAST_TYPES } from "../config/constants.js";

function row(item) {
  const agreementNo = item.agreement_no || item.id;
  const title = item.title || item.agreement_title || "-";
  const party = item.party_name || item.party || "-";
  const signer = item.signer_name || item.signer || "-";
  const type = item.agreement_type || item.type || "-";
  const status = item.status || "-";
  const risk = item.risk_level || item.risk || "-";
  const updatedValue = item.updated_at || item.updatedAt;
  const updated = updatedValue
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedValue))
    : "-";
  const viewUrl = `${ROUTES.LEGAL_AGREEMENT_VIEW}?id=${encodeURIComponent(item.id)}`;
  return `<tr>
    <td><strong>${escapeHtml(agreementNo)}</strong><br><span class="muted">${escapeHtml(title)}</span></td>
    <td>${escapeHtml(type)}</td>
    <td>${escapeHtml(party)}<br><span class="muted">${escapeHtml(signer)}</span></td>
    <td>${statusPill(status)}</td>
    <td>${escapeHtml(risk)}</td>
    <td>${escapeHtml(updated)}</td>
    <td class="legal-actions-cell">
      <div class="legal-row-actions">
        <a class="btn btn-sm" href="${viewUrl}">Open</a>
        <a class="btn btn-sm btn-secondary" href="${ROUTES.LEGAL_SIGNING}?agreement=${encodeURIComponent(agreementNo)}">Evidence</a>
        <button class="btn btn-sm btn-danger" type="button" data-delete-agreement="${escapeHtml(item.id)}" data-agreement-no="${escapeHtml(agreementNo)}">Delete</button>
      </div>
    </td>
  </tr>`;
}

function requestRow(item) {
  const agreement = item.legal_agreements || {};
  const agreementNo = agreement.agreement_no || item.agreement_no || item.agreement_id || "-";
  const title = agreement.title || item.title || "-";
  const publicUrl = item.public_sign_url || "";
  return `<tr>
    <td><strong>${escapeHtml(agreementNo)}</strong><br><span class="muted">${escapeHtml(title)}</span></td>
    <td>${escapeHtml(item.recipient_name || "-")}<br><span class="muted">${escapeHtml(item.recipient_mobile || "")}</span></td>
    <td>${statusPill(item.request_status || "-")}</td>
    <td>${statusPill(item.didit_status || "-")}</td>
    <td>${statusPill(item.whatsapp_status || (item.whatsapp_message_id ? "sent" : "-"))}<br><span class="muted">${escapeHtml(item.whatsapp_message_id || "")}</span></td>
    <td>${statusPill(item.final_archive_status || "pending")}</td>
    <td>${escapeHtml(item.accepted_at || item.sent_at || item.created_at || "-")}</td>
    <td>${publicUrl ? `<a class="btn btn-sm" href="${escapeHtml(publicUrl)}" target="_blank" rel="noreferrer">Open Link</a>` : "-"}</td>
  </tr>`;
}

function renderPage(rows = [], requests = []) {
  renderModuleContent(`
    <section class="card">
      <h3>View Agreements</h3>
      <p class="muted">Register for all drafts, sent requests, signed contracts, rejected versions and archived records.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Total: ${rows.length}</span>
        <span class="meta-pill">Signed: ${rows.filter((x) => String(x.status || "").toLowerCase() === "signed").length}</span>
        <span class="meta-pill">Ready To Send: ${rows.filter((x) => ["Ready To Send", "approved_for_signing"].includes(String(x.status || ""))).length}</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h3>Agreement Register</h3>
      <div class="table-shell">
        <table class="legal-agreements-register-table">
          <thead><tr><th>Agreement</th><th>Type</th><th>Party</th><th>Status</th><th>Risk</th><th>Updated</th><th>Action</th></tr></thead>
          <tbody>${rows.map(row).join("") || '<tr><td colspan="7">No agreements recorded.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h3>Signing Requests</h3>
      <p class="muted">Live tracking for public signing links, Didit sessions, WhatsApp delivery and archive status.</p>
      <div class="table-shell">
        <table class="legal-signing-requests-table">
          <thead><tr><th>Agreement</th><th>Recipient</th><th>Request</th><th>Didit</th><th>WhatsApp</th><th>Archive</th><th>Last Event</th><th>Action</th></tr></thead>
          <tbody>${requests.map(requestRow).join("") || '<tr><td colspan="8">No signing requests recorded.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `);
}

async function loadAndRender() {
  let rows = [];
  let requests = [];
  try {
    const data = await listLegalData();
    rows = data?.agreements || [];
    requests = data?.signingRequests || [];
  } catch {}
  renderPage(rows, requests);
}

function bind() {
  document.querySelectorAll("[data-delete-agreement]").forEach((button) => {
    button.addEventListener("click", async () => {
      const agreementId = button.getAttribute("data-delete-agreement");
      const agreementNo = button.getAttribute("data-agreement-no") || "this agreement";
      const confirmed = window.confirm(`Delete ${agreementNo} from both EMS and Google Drive? This cannot be undone.`);
      if (!confirmed) return;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Deleting...";
      try {
        const result = await deleteLegalAgreement(agreementId);
        showToast(
          `Deleted ${agreementNo}. Removed ${result.deletedDriveFileCount || 0} Drive file(s).`,
          TOAST_TYPES.SUCCESS
        );
        await loadAndRender();
        bind();
      } catch (error) {
        button.disabled = false;
        button.textContent = original;
        showToast(error.message || "Agreement delete failed.", TOAST_TYPES.ERROR);
      }
    });
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_AGREEMENTS,
    pageTitle: "View Agreements",
    pageDescription: "Agreement register and execution status tracking",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  await loadAndRender();
  bind();
}

init();
