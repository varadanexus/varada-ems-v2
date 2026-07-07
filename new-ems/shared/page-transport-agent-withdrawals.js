import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { PERMISSIONS } from "../config/roles.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { qs, showToast } from "./utils.js";

const client = getSupabaseClient();
const STATE = { rows: [], status: "", canApprove: false, canMarkPaid: false };

init();

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_AGENT_WITHDRAWALS,
    pageTitle: "Agent Withdrawals",
    pageDescription: "Review, approve, reject, and settle agent withdrawal requests",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;
  STATE.canApprove = hasAnyRolePermission(boot.roleCodes || [], MODULES.TRANSPORT_AGENT_WITHDRAWALS, PERMISSIONS.APPROVE, { allowedModules: boot.allowedModules || [] });
  STATE.canMarkPaid = hasAnyRolePermission(boot.roleCodes || [], MODULES.TRANSPORT_AGENT_WITHDRAWALS, PERMISSIONS.EDIT, { allowedModules: boot.allowedModules || [] });
  renderModuleContent(shell());
  bind();
  await load();
}

function shell() {
  return `
    <style>
      .withdraw-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1rem;width:100%}
      .withdraw-kpis > .withdraw-kpi{grid-column:auto !important;min-width:0}
      .withdraw-kpi{padding:1rem;border:1px solid var(--border);border-radius:14px}.withdraw-kpi strong{display:block;font-size:1.35rem;margin-top:.35rem}
      .withdraw-actions{display:flex;gap:.45rem;flex-wrap:wrap}.withdraw-table td,.withdraw-table th{padding:.75rem;vertical-align:top}
      @media(max-width:900px){.withdraw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style>
    <section class="card" style="margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:end;flex-wrap:wrap;">
        <div><h3 style="margin:0;">Withdrawal Approval Queue</h3><p class="muted">Approve valid requests, reject with a reason, then record payment reference after settlement.</p></div>
        <div><label for="withdrawStatus">Status</label><select id="withdrawStatus"><option value="">All</option>${["pending","approved","paid","rejected","cancelled"].map(s => `<option value="${s}">${label(s)}</option>`).join("")}</select></div>
      </div>
    </section>
    <div id="withdrawKpis" class="withdraw-kpis"></div>
    <section class="card"><div class="table-container"><table class="withdraw-table"><thead><tr>
      <th>Request</th><th>Agent</th><th>Amount</th><th>Bank</th><th>Status</th><th>Notes</th><th>Action</th>
    </tr></thead><tbody id="withdrawBody"></tbody></table></div></section>
  `;
}

function bind() {
  qs("#withdrawStatus")?.addEventListener("change", async (e) => { STATE.status = e.target.value; await load(); });
}

async function load() {
  const { data, error } = await client.rpc("transport_agent_withdrawal_list_admin", { p_status: STATE.status || null });
  if (error) return showToast(error.message, TOAST_TYPES.ERROR);
  STATE.rows = data || [];
  render();
}

function render() {
  const totals = Object.fromEntries(["pending","approved","paid","rejected"].map(s => [s, STATE.rows.filter(r => r.status === s).length]));
  qs("#withdrawKpis").innerHTML = [
    ["Pending", totals.pending], ["Approved", totals.approved], ["Paid", totals.paid],
    ["Visible Amount", money(STATE.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0))]
  ].map(([k,v]) => `<div class="withdraw-kpi card"><span class="muted">${k}</span><strong>${v}</strong></div>`).join("");
  qs("#withdrawBody").innerHTML = STATE.rows.length ? STATE.rows.map(row => `
    <tr>
      <td><strong>${esc(row.request_no)}</strong><br><span class="muted">${dateTime(row.requested_at)}</span></td>
      <td><strong>${esc(row.agent_name)}</strong><br><span class="muted">${esc(row.agent_code || "-")}</span></td>
      <td><strong>${money(row.amount)}</strong></td>
      <td>${esc(row.bank_name || "-")}<br><span class="muted">${esc(maskAccount(row.account_number))} · ${esc(row.ifsc_code || "-")}</span></td>
      <td>${badge(row.status)}</td>
      <td><span class="muted">Agent:</span> ${esc(row.agent_note || "-")}<br><span class="muted">Review:</span> ${esc(row.review_note || "-")}${row.payment_reference ? `<br><span class="muted">Payment:</span> ${esc(row.payment_reference)}` : ""}</td>
      <td><div class="withdraw-actions">${actions(row)}</div></td>
    </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:2rem;">No withdrawal requests found.</td></tr>`;
  document.querySelectorAll("[data-withdraw-action]").forEach(btn => btn.addEventListener("click", () => act(btn.dataset.withdrawAction, btn.dataset.id)));
}

function actions(row) {
  if (row.status === "pending" && STATE.canApprove) return `<button class="btn btn-sm" data-withdraw-action="approve" data-id="${row.id}">Approve</button><button class="btn btn-sm btn-danger" data-withdraw-action="reject" data-id="${row.id}">Reject</button>`;
  if (row.status === "approved" && STATE.canMarkPaid) return `<button class="btn btn-sm" data-withdraw-action="mark_paid" data-id="${row.id}">Mark Paid</button>`;
  return `<span class="muted">No action</span>`;
}

async function act(action, id) {
  let reviewNote = null;
  let paymentReference = null;
  if (action === "reject") {
    reviewNote = window.prompt("Reason for rejection:");
    if (!reviewNote) return;
  } else if (action === "approve") {
    reviewNote = window.prompt("Approval note (optional):") || null;
    if (!window.confirm("Approve this withdrawal request?")) return;
  } else {
    paymentReference = window.prompt("Enter bank/UPI payment reference:");
    if (!paymentReference) return;
  }
  const { error } = await client.rpc("transport_agent_withdrawal_decide_admin", {
    p_request_id: id, p_action: action, p_review_note: reviewNote, p_payment_reference: paymentReference
  });
  if (error) return showToast(error.message, TOAST_TYPES.ERROR);
  showToast(action === "mark_paid" ? "Withdrawal marked paid." : `Withdrawal ${action}d.`, TOAST_TYPES.SUCCESS);
  await load();
}

function money(v) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v || 0)); }
function label(v) { return String(v || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function badge(v) { return `<span class="badge">${esc(label(v))}</span>`; }
function dateTime(v) { return v ? new Date(v).toLocaleString("en-IN") : "-"; }
function maskAccount(v) { const s = String(v || ""); return s ? `••••${s.slice(-4)}` : "-"; }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
