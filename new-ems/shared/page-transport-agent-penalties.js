import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { listMasterRecords, MASTER_TABLES } from "./admin-api.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, qsa, showToast } from "./utils.js";
import { escapeHtml, formatDate, formatMoney } from "./transport-portal-auth.js";

const client = getSupabaseClient();
const BACKEND_READY = Boolean(window.EMS_RUNTIME_CONFIG?.transportAgentPenaltiesReady);

const STATE = {
  rows: [],
  filteredRows: [],
  agents: [],
  status: "",
  search: "",
  editingId: null,
  selectedAgentId: ""
};

init();

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_AGENT_PENALTIES,
    pageTitle: "Agent Penalties",
    pageDescription: "Create and manage penalties that reduce agent withdrawal eligibility",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  renderModuleContent(shell());
  bind();
  await loadAll();
}

function shell() {
  return `
    <style>
      .pen-wrap{display:flex;flex-direction:column;gap:1rem;width:100%}
      .pen-wrap > *{width:100%;min-width:0}
      .pen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;width:100%}
      .pen-grid > .card{grid-column:auto !important;min-width:0}
      .pen-card{padding:1rem}
      .pen-card strong{display:block;font-size:1.4rem;margin-top:.35rem}
      .pen-panel{padding:1rem}
      .pen-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem}
      .pen-form label{display:block;font-size:.82rem;font-weight:600;margin-bottom:.35rem;color:#9fb0c7}
      .pen-form input,.pen-form select,.pen-form textarea{width:100%;box-sizing:border-box}
      .pen-form textarea{min-height:88px;resize:vertical}
      .pen-form .full{grid-column:1/-1}
      .pen-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.35rem}
      .pen-toolbar{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:end}
      .pen-toolbar .filters{display:flex;gap:.75rem;flex-wrap:wrap;align-items:end}
      .pen-toolbar label{display:block;font-size:.82rem;font-weight:600;margin-bottom:.35rem;color:#9fb0c7}
      .pen-toolbar input,.pen-toolbar select{min-width:220px}
      .pen-table td,.pen-table th{padding:.8rem .85rem;vertical-align:top}
      .pen-row-actions{display:flex;gap:.45rem;flex-wrap:wrap}
      .pill{display:inline-flex;align-items:center;padding:.25rem .55rem;border-radius:999px;font-size:.75rem;font-weight:700;background:rgba(245,193,108,.08);border:1px solid rgba(245,193,108,.2);color:#f5c16c}
      .pill.active{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.2);color:#4ade80}
      .pill.waived{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.2);color:#fbbf24}
      .pill.reversed{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.2);color:#f87171}
      @media (max-width: 1100px){.pen-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pen-form{grid-template-columns:1fr}.pen-toolbar input,.pen-toolbar select{min-width:180px}}
      @media (max-width: 640px){.pen-grid{grid-template-columns:1fr}}
    </style>

    <div class="pen-wrap">
      ${BACKEND_READY ? "" : `<section class="card"><strong>Agent penalties are not yet deployed</strong><p class="muted" style="margin:.4rem 0 0;">The screen is visible, but the live Supabase table/function still needs to be deployed. Once the deployment lands, set <code>transportAgentPenaltiesReady</code> to true in runtime config.</p></section>`}
      <section class="card">
        <div class="pen-toolbar">
          <div>
            <h3 style="margin:0 0 .25rem;">Penalty Approval Workspace</h3>
            <p class="muted" style="margin:0;">Apply, adjust, waive, or reverse agent penalties. Active penalties reduce available withdrawal balance.</p>
          </div>
          <div class="filters">
            <div>
              <label for="penaltySearch">Search</label>
              <input id="penaltySearch" type="text" placeholder="Penalty no, agent, reason" value="${escapeHtml(STATE.search)}" />
            </div>
            <div>
              <label for="penaltyStatus">Status</label>
              <select id="penaltyStatus">
                <option value="">All</option>
                ${["active","waived","reversed"].map((s) => `<option value="${s}" ${STATE.status === s ? "selected" : ""}>${label(s)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="pen-grid" ${BACKEND_READY ? "" : 'style="opacity:.55;pointer-events:none;"'}>
        ${[
          ["Active Penalties", countByStatus("active")],
          ["Waived", countByStatus("waived")],
          ["Reversed", countByStatus("reversed")],
          ["Active Amount", formatMoney(totalByStatus("active"))]
        ].map(([labelText, value]) => `<article class="card pen-card" style="grid-column:auto !important;min-width:0;"><span class="muted">${escapeHtml(labelText)}</span><strong>${escapeHtml(String(value))}</strong></article>`).join("")}
      </section>

      <section class="card pen-panel" ${BACKEND_READY ? "" : 'style="opacity:.55;pointer-events:none;"'}>
        <h3 style="margin-top:0;">${STATE.editingId ? "Edit Penalty" : "New Penalty"}</h3>
        <form id="penaltyForm" class="pen-form">
          <input type="hidden" id="penaltyId" value="${escapeHtml(STATE.editingId || "")}" />
          <div>
            <label for="penaltyAgent">Agent *</label>
            <select id="penaltyAgent" required>
              <option value="">Select Agent</option>
              ${STATE.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}${agent.code ? ` (${escapeHtml(agent.code)})` : ""}</option>`).join("")}
            </select>
          </div>
          <div>
            <label for="penaltyAmount">Amount *</label>
            <input id="penaltyAmount" type="number" min="0.01" step="0.01" required />
          </div>
          <div>
            <label for="penaltyStatusForm">Status *</label>
            <select id="penaltyStatusForm" required>
              ${["active","waived","reversed"].map((s) => `<option value="${s}">${label(s)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label for="penaltyEffectiveDate">Effective Date *</label>
            <input id="penaltyEffectiveDate" type="date" required />
          </div>
          <div class="full">
            <label for="penaltyReason">Reason *</label>
            <input id="penaltyReason" type="text" maxlength="300" required placeholder="Damage, shortage, delay, or recovery reason" />
          </div>
          <div class="full">
            <label for="penaltyRemarks">Remarks</label>
            <textarea id="penaltyRemarks" maxlength="500" placeholder="Optional internal note"></textarea>
          </div>
          <div class="full pen-actions">
            <button class="btn" id="penaltySaveBtn" type="submit">Save Penalty</button>
            <button class="btn btn-ghost" id="penaltyResetBtn" type="button">Reset</button>
          </div>
        </form>
      </section>

      <section class="card" ${BACKEND_READY ? "" : 'style="opacity:.55;pointer-events:none;"'}>
        <div class="table-container">
          <table class="pen-table">
            <thead>
              <tr>
                <th>Penalty</th>
                <th>Agent</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Effective</th>
                <th>Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="penaltyBody"></tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function label(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadAll() {
  if (!BACKEND_READY) {
    STATE.rows = [];
    STATE.filteredRows = [];
    render();
    return;
  }
  try {
    const [agentListRes, penaltiesRes] = await Promise.all([
      loadPenaltyAgents(),
      client.rpc("transport_agent_penalty_list_admin", { p_status: STATE.status || null })
    ]);
    STATE.agents = agentListRes;
    if (penaltiesRes.error) throw penaltiesRes.error;
    STATE.rows = penaltiesRes.data || [];
    applySearchFilter();
    render();
    renderAgentSelector();
  } catch (error) {
    showToast(error?.message || "Unable to load penalties.", TOAST_TYPES.ERROR);
  }
}

async function loadPenaltyAgents() {
  try {
    const { rows } = await listMasterRecords(MASTER_TABLES.transportAgents, { page: 1, pageSize: 500, searchColumns: ["name", "display_name", "code"] });
    if (Array.isArray(rows) && rows.length) return rows;
  } catch (error) {
    console.warn("Penalty agent master list failed, using direct transport_agents query.", error);
  }
  const { data, error } = await client
    .from("transport_agents")
    .select("id,name,display_name,code,is_active,deleted_at")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderAgentSelector() {
  const select = qs("#penaltyAgent");
  if (!select) return;
  const selectedValue = String(STATE.selectedAgentId || select.value || "");
  select.innerHTML = [
    `<option value="">Select Agent</option>`,
    ...STATE.agents.map((agent) => {
      const labelText = `${escapeHtml(agent.name || agent.display_name || "Unnamed Agent")}${agent.code ? ` (${escapeHtml(agent.code)})` : ""}`;
      const isSelected = String(agent.id) === selectedValue ? "selected" : "";
      return `<option value="${escapeHtml(agent.id)}" ${isSelected}>${labelText}</option>`;
    })
  ].join("");
  if (selectedValue) select.value = selectedValue;
}

function applySearchFilter() {
  const search = STATE.search.trim().toLowerCase();
  STATE.filteredRows = (STATE.rows || []).filter((row) => {
    if (!search) return true;
    return [
      row.penalty_no,
      row.agent_name,
      row.agent_code,
      row.reason,
      row.remarks,
      row.status
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function countByStatus(status) {
  return (STATE.rows || []).filter((row) => row.status === status).length;
}

function totalByStatus(status) {
  return (STATE.rows || []).filter((row) => row.status === status).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function render() {
  renderAgentSelector();
  qs("#penaltyBody").innerHTML = STATE.filteredRows.length ? STATE.filteredRows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.penalty_no || "—")}</strong><br><span class="muted">${escapeHtml(formatDate(row.created_at))}</span></td>
      <td><strong>${escapeHtml(row.agent_name || "—")}</strong><br><span class="muted">${escapeHtml(row.agent_code || "—")}</span></td>
      <td><strong>${escapeHtml(formatMoney(row.amount))}</strong></td>
      <td>${escapeHtml(row.reason || "—")}</td>
      <td><span class="pill ${escapeHtml(String(row.status || "").toLowerCase())}">${escapeHtml(label(row.status))}</span></td>
      <td>${escapeHtml(formatDate(row.effective_date))}</td>
      <td>${escapeHtml(row.remarks || "—")}</td>
      <td>
        <div class="pen-row-actions">
          <button class="btn btn-sm" data-pen-edit="${escapeHtml(row.id)}" type="button">Edit</button>
          ${row.status !== "waived" ? `<button class="btn btn-sm btn-ghost" data-pen-waive="${escapeHtml(row.id)}" type="button">Waive</button>` : ""}
          ${row.status !== "active" ? `<button class="btn btn-sm btn-ghost" data-pen-activate="${escapeHtml(row.id)}" type="button">Activate</button>` : ""}
          ${row.status !== "reversed" ? `<button class="btn btn-sm btn-danger" data-pen-reverse="${escapeHtml(row.id)}" type="button">Reverse</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="8" style="text-align:center;padding:2rem;">No penalties found.</td></tr>`;

  qsa("[data-pen-edit]").forEach((btn) => btn.addEventListener("click", () => loadEditForm(btn.dataset.penEdit)));
  qsa("[data-pen-waive]").forEach((btn) => btn.addEventListener("click", () => updateStatus(btn.dataset.penWaive, "waived")));
  qsa("[data-pen-activate]").forEach((btn) => btn.addEventListener("click", () => updateStatus(btn.dataset.penActivate, "active")));
  qsa("[data-pen-reverse]").forEach((btn) => btn.addEventListener("click", () => updateStatus(btn.dataset.penReverse, "reversed")));
}

function bind() {
  qs("#penaltyStatus")?.addEventListener("change", async (e) => {
    STATE.status = e.target.value;
    await loadAll();
  });
  qs("#penaltySearch")?.addEventListener("input", (e) => {
    STATE.search = e.target.value;
    applySearchFilter();
    render();
  });
  qs("#penaltyForm")?.addEventListener("submit", submitPenalty);
  qs("#penaltyResetBtn")?.addEventListener("click", resetForm);
}

async function submitPenalty(event) {
  event.preventDefault();
  const payload = {
    p_penalty_id: qs("#penaltyId")?.value || null,
    p_transport_agent_id: qs("#penaltyAgent")?.value || null,
    p_amount: Number(qs("#penaltyAmount")?.value || 0),
    p_reason: String(qs("#penaltyReason")?.value || "").trim(),
    p_effective_date: qs("#penaltyEffectiveDate")?.value || null,
    p_status: qs("#penaltyStatusForm")?.value || "active",
    p_remarks: String(qs("#penaltyRemarks")?.value || "").trim() || null
  };
  try {
    const { data, error } = payload.p_penalty_id
      ? await client.rpc("transport_agent_penalty_upsert_admin", payload)
      : await client.rpc("transport_agent_penalty_upsert_admin", { ...payload, p_penalty_id: null });
    if (error) throw error;
    showToast(payload.p_penalty_id ? "Penalty updated." : "Penalty created.", TOAST_TYPES.SUCCESS);
    resetForm();
    await loadAll();
  } catch (error) {
    showToast(error?.message || "Unable to save penalty.", TOAST_TYPES.ERROR);
  }
}

async function updateStatus(id, status) {
  const labelText = label(status);
  if (!window.confirm(`Set this penalty to ${labelText.toLowerCase()}?`)) return;
  try {
    const { error } = await client.rpc("transport_agent_penalty_update_status_admin", {
      p_penalty_id: id,
      p_status: status,
      p_remarks: null
    });
    if (error) throw error;
    showToast(`Penalty marked ${labelText.toLowerCase()}.`, TOAST_TYPES.SUCCESS);
    await loadAll();
  } catch (error) {
    showToast(error?.message || "Unable to update penalty status.", TOAST_TYPES.ERROR);
  }
}

async function loadEditForm(id) {
  const row = STATE.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  STATE.editingId = row.id;
  STATE.selectedAgentId = row.transport_agent_id || "";
  renderAgentSelector();
  qs("#penaltyId").value = row.id;
  qs("#penaltyAgent").value = row.transport_agent_id || "";
  qs("#penaltyAmount").value = row.amount || "";
  qs("#penaltyReason").value = row.reason || "";
  qs("#penaltyStatusForm").value = row.status || "active";
  qs("#penaltyEffectiveDate").value = row.effective_date || "";
  qs("#penaltyRemarks").value = row.remarks || "";
  qs("#penaltySaveBtn").textContent = "Update Penalty";
  qs("#penaltyForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  STATE.editingId = null;
  STATE.selectedAgentId = "";
  renderAgentSelector();
  const form = qs("#penaltyForm");
  form?.reset();
  qs("#penaltyId").value = "";
  qs("#penaltyStatusForm").value = "active";
  qs("#penaltySaveBtn").textContent = "Save Penalty";
}
