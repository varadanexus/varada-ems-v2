import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { LEGAL_AUDIT_EVENTS, escapeHtml, statusPill } from "./legal-workflow-data.js";
import { listLegalData } from "./legal-api.js";

function normalizeEvent(row) {
  return {
    at: row.received_at || row.at,
    agreement: row.agreement_id || row.agreement || "-",
    event: row.event_type || row.event,
    actor: row.provider || row.actor || "-",
    risk: row.status || row.risk || "-"
  };
}

function renderPage(rows = LEGAL_AUDIT_EVENTS, evidence = []) {
  const events = rows.map(normalizeEvent);
  renderModuleContent(`
    <section class="card">
      <h3>Legal Audit Trail</h3>
      <p class="muted">Court-evidence oriented log for drafting, approval, sending, signing, VPN blocks, provider callbacks and archive actions.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Events: ${events.length}</span>
        <span class="meta-pill">High Risk: ${events.filter((x) => String(x.risk).toLowerCase() === "high").length}</span>
        <span class="meta-pill">Provider Events: ${events.filter((x) => ["didit", "whatsapp", "google_drive"].includes(String(x.actor))).length}</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <div class="table-shell">
        <table>
          <thead><tr><th>Time</th><th>Agreement</th><th>Event</th><th>Actor</th><th>Risk</th></tr></thead>
          <tbody>
            ${events.map((row) => `<tr><td>${escapeHtml(row.at)}</td><td>${escapeHtml(row.agreement)}</td><td>${escapeHtml(row.event)}</td><td>${escapeHtml(row.actor)}</td><td>${statusPill(row.risk)}</td></tr>`).join("") || '<tr><td colspan="5">No legal audit events.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
    ${renderEvidenceSection(evidence)}
  `);
}

function evidenceRow(row) {
  const request = row.legal_signing_requests || {};
  const agreement = request.legal_agreements || {};
  const blocked = row.blocked ? "Blocked" : "Accepted";
  const gps = row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : row.location_status || "-";
  return `<tr>
    <td>${escapeHtml(row.captured_at || "-")}</td>
    <td><strong>${escapeHtml(agreement.agreement_no || "-")}</strong><br><span class="muted">${escapeHtml(agreement.title || "")}</span></td>
    <td>${escapeHtml(request.recipient_name || "-")}<br><span class="muted">${escapeHtml(request.recipient_mobile || "")}</span></td>
    <td>${escapeHtml(gps)}</td>
    <td>${escapeHtml(row.ip_address || "-")}<br><span class="muted">${escapeHtml(row.ip_risk_provider || "")}</span></td>
    <td>${statusPill(blocked)}</td>
    <td><span class="muted">${escapeHtml(row.evidence_sha256 || "-")}</span></td>
  </tr>`;
}

function renderEvidenceSection(evidence = []) {
  return `
    <section class="card" style="margin-top:1rem;">
      <h3>Signing Evidence Records</h3>
      <p class="muted">Live photo, consent, GPS, IP, device and risk evidence captured during public acceptance.</p>
      <div class="table-shell">
        <table>
          <thead><tr><th>Captured</th><th>Agreement</th><th>Signer</th><th>GPS</th><th>IP</th><th>Status</th><th>Evidence Hash</th></tr></thead>
          <tbody>${evidence.map(evidenceRow).join("") || '<tr><td colspan="7">No signing evidence records yet.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_AUDIT,
    pageTitle: "Legal Audit Trail",
    pageDescription: "Immutable legal event and risk evidence register",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  let rows = LEGAL_AUDIT_EVENTS;
  let evidence = [];
  try {
    const data = await listLegalData();
    if (data?.providerEvents?.length) rows = data.providerEvents;
    evidence = data?.signingEvidence || [];
  } catch {}
  renderPage(rows, evidence);
}

init();
