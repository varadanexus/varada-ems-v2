import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { LEGAL_AGREEMENTS, LEGAL_AUDIT_EVENTS, escapeHtml, statusPill } from "./legal-workflow-data.js";
import { listLegalData } from "./legal-api.js";

function countStatus(rows, status) {
  return rows.filter((row) => String(row.status || row.request_status || "").toLowerCase() === String(status).toLowerCase()).length;
}

function renderActionCard({ title, detail, href, accent }) {
  return `
    <a class="legal-action-card" href="${href}">
      <span class="legal-action-mark">${accent}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </a>
  `;
}

function agreementLabel(row) {
  return row.agreement_no || row.id || "-";
}

function renderPage(data = {}) {
  const hasLiveData = Array.isArray(data.agreements) || Array.isArray(data.providerEvents);
  const agreements = hasLiveData ? (data.agreements || []) : LEGAL_AGREEMENTS;
  const requests = data.signingRequests || [];
  const events = hasLiveData ? (data.providerEvents || []) : LEGAL_AUDIT_EVENTS;
  const draftingCount = countStatus(agreements, "drafting");
  const signedCount = agreements.filter((row) => String(row.status || "").toLowerCase() === "signed").length;
  const readyCount = agreements.filter((row) => ["ready to send", "approved_for_signing"].includes(String(row.status || "").toLowerCase())).length;
  const riskCount = events.filter((row) => ["blocked", "failed", "high"].includes(String(row.status || row.risk || "").toLowerCase())).length;
  renderModuleContent(`
    <style>
      .legal-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}
      .legal-overview .cardlet{border:1px solid rgba(230,200,126,.15);border-radius:14px;padding:.85rem;background:linear-gradient(145deg,rgba(230,200,126,.04),#07080d 68%);color:#c9c5b8}
      .legal-overview strong{display:block;font-size:1.55rem}
      .legal-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin-top:1rem}
      .legal-action-card{display:grid;gap:.45rem;min-height:132px;border:1px solid rgba(230,200,126,.15);border-radius:14px;padding:1rem;background:linear-gradient(145deg,rgba(230,200,126,.04),#07080d 68%);text-decoration:none;color:#f7f4ec}
      .legal-action-card:hover{border-color:#d4b26a;box-shadow:0 12px 30px rgba(0,0,0,.22)}
      .legal-action-mark{width:42px;height:42px;border:1px solid rgba(230,200,126,.16);border-radius:10px;display:grid;place-items:center;background:#090a0e;color:#e6c87e;font-weight:900}
      .legal-action-card small{color:#9b9788;line-height:1.45}
      .legal-two-col{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
      @media (max-width: 980px){.legal-overview,.legal-action-grid,.legal-two-col{grid-template-columns:1fr}}
    </style>

    <section class="card">
      <h3>Legal Dashboard</h3>
      <p class="muted">A clean control point for legal work. Use the sidebar or action tiles to open each dedicated workflow page.</p>
      <div class="legal-overview">
        <div class="cardlet"><span class="muted">Drafting</span><strong>${draftingCount}</strong></div>
        <div class="cardlet"><span class="muted">Ready To Send</span><strong>${readyCount}</strong></div>
        <div class="cardlet"><span class="muted">Signed</span><strong>${signedCount}</strong></div>
        <div class="cardlet"><span class="muted">Risk Alerts</span><strong>${riskCount}</strong></div>
      </div>
    </section>

    <section class="legal-action-grid">
      ${renderActionCard({ title: "Legal Drafting", detail: "Create drafts manually or prepare Gemini AI prompts for advocate review.", href: ROUTES.LEGAL_DRAFTING, accent: "DR" })}
      ${renderActionCard({ title: "Send To User", detail: "Select a final draft, choose recipient, and prepare Didit KYC/signing request.", href: ROUTES.LEGAL_SEND, accent: "SU" })}
      ${renderActionCard({ title: "View Agreements", detail: "Track draft, pending, signed, rejected, archived and expired agreements.", href: ROUTES.LEGAL_AGREEMENTS, accent: "AG" })}
      ${renderActionCard({ title: "Signing Evidence", detail: "Capture consent, live photo, GPS, IP, VPN risk and evidence hash.", href: ROUTES.LEGAL_SIGNING, accent: "SE" })}
      ${renderActionCard({ title: "Google Drive Archive", detail: "Review final signed PDFs, evidence bundles and Drive file references.", href: ROUTES.LEGAL_ARCHIVE, accent: "GD" })}
      ${renderActionCard({ title: "Audit Trail", detail: "Inspect legal events, blocked attempts, provider callbacks and evidence logs.", href: ROUTES.LEGAL_AUDIT, accent: "AT" })}
      ${renderActionCard({ title: "Provider Settings", detail: "Prepare Didit, Twilio WhatsApp, Google Drive and public URL secrets.", href: ROUTES.LEGAL_SETTINGS, accent: "PS" })}
    </section>

    <div class="legal-two-col">
      <section class="card">
        <h3>Recent Agreements</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>Agreement</th><th>Party</th><th>Status</th></tr></thead>
            <tbody>
              ${agreements.slice(0, 6).map((row) => `<tr><td><strong>${escapeHtml(agreementLabel(row))}</strong><br><span class="muted">${escapeHtml(row.title || "")}</span></td><td>${escapeHtml(row.party_name || row.party || "-")}</td><td>${statusPill(row.status || "-")}</td></tr>`).join("") || '<tr><td colspan="3">No agreements recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h3>Recent Legal Activity</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>Time</th><th>Event</th><th>Risk</th></tr></thead>
            <tbody>
              ${events.slice(0, 6).map((row) => `<tr><td>${escapeHtml(row.received_at || row.at || "-")}</td><td>${escapeHtml(row.event_type || row.event || "-")}<br><span class="muted">${escapeHtml(row.provider || row.agreement || "-")}</span></td><td>${statusPill(row.status || row.risk || "-")}</td></tr>`).join("") || '<tr><td colspan="3">No legal activity recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_COMMAND_CENTER,
    pageTitle: "Legal Dashboard",
    pageDescription: "Dedicated workflows for drafting, sending, signing, archive and audit",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  let data = {};
  try {
    data = await listLegalData();
  } catch {}
  renderPage(data);
}

init();
