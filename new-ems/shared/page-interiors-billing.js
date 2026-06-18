import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const client = getSupabaseClient();

const PAGE_STATE = { boot: null, projects: [], bills: [], lines: [], clients: [], isSavingHeader: false };

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.INTERIORS_BILLING, pageTitle: "Billing", pageDescription: "Prepare business billing workflow without any posting, GST, or accounting integration.", workspace: WORKSPACES.INTERIORS });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, billsRes, linesRes, clientsRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_client_id, status, material_source_type, interior_clients(client_name)").order("project_name"),
    client.from("interior_billing_headers").select("*").order("created_at", { ascending: false }),
    client.from("interior_billing_lines").select("*").order("created_at", { ascending: false }),
    client.from("interior_clients").select("id, client_name").order("client_name")
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (billsRes.error) throw billsRes.error;
  if (linesRes.error) throw linesRes.error;
  if (clientsRes.error) throw clientsRes.error;
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id);
  PAGE_STATE.bills = billsRes.data || [];
  PAGE_STATE.lines = linesRes.data || [];
  PAGE_STATE.clients = clientsRes.data || [];
}

function render() {
  const draftBills = PAGE_STATE.bills.filter((row) => row.status === "draft").length;
  const submittedBills = PAGE_STATE.bills.filter((row) => row.status === "submitted").length;
  const approvedBills = PAGE_STATE.bills.filter((row) => row.status === "approved").length;
  const readyForAccounts = PAGE_STATE.bills.filter((row) => row.status === "ready_for_accounts").length;

  renderModuleContent(`
    <section class="card">
      <style>.bl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.bl-grid .full{grid-column:1/-1}.bl-grid label{display:block;font-weight:600;margin-bottom:.35rem}.bl-grid input,.bl-grid select,.bl-grid textarea{width:100%}@media (max-width:980px){.bl-grid{grid-template-columns:1fr}}</style>
      <h3>Billing</h3>
      <p class="muted">Business billing workflow only. No GST posting, accounting posting, invoice engine, or journal creation is introduced here.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Draft Bills: ${draftBills}</span>
        <span class="meta-pill">Submitted Bills: ${submittedBills}</span>
        <span class="meta-pill">Approved Bills: ${approvedBills}</span>
        <span class="meta-pill">Ready For Accounts: ${readyForAccounts}</span>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Create Bill</h4>
      <div class="bl-grid" style="margin-top:1rem;">
        <div><label for="billProjectId">Project *</label><select id="billProjectId"><option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.shared_project_id}">${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="billType">Bill Type *</label><select id="billType">${renderOptions(["advance", "progress", "change", "final"], "advance")}</select></div>
        <div><label for="billDate">Bill Date *</label><input id="billDate" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div><label for="billStatus">Status *</label><select id="billStatus">${renderOptions(["draft", "submitted", "approved", "rejected", "ready_for_accounts"], "draft")}</select></div>
        <div><label for="billTaxAmount">Tax Amount</label><input id="billTaxAmount" type="number" min="0" step="0.01" value="0" /></div>
        <div class="full"><label for="billRemarks">Remarks</label><textarea id="billRemarks" rows="2"></textarea></div>
        <div class="full"><label for="billLineDescription">Line Description *</label><input id="billLineDescription" type="text" /></div>
        <div><label for="billLineQuantity">Quantity *</label><input id="billLineQuantity" type="number" min="0" step="0.001" value="1" /></div>
        <div><label for="billLineRate">Rate *</label><input id="billLineRate" type="number" min="0" step="0.01" value="0" /></div>
        <div><label for="billLineSourceType">Source Type</label><select id="billLineSourceType">${renderOptions(["quote", "change", "manual"], "manual")}</select></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="createBillBtn" type="button">Create Bill</button></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Billing Workflow</h4>
      <div class="table-container"><table><thead><tr><th>Bill Number</th><th>Project</th><th>Client</th><th>Bill Type</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>
        ${PAGE_STATE.bills.length ? PAGE_STATE.bills.map((row) => `<tr><td>${escapeHtml(row.bill_number || "-")}</td><td>${escapeHtml(projectName(row.project_id))}</td><td>${escapeHtml(projectClientName(row.project_id))}</td><td>${escapeHtml(labelForBillType(row.bill_type))}</td><td>${escapeHtml(row.status || "draft")}</td><td>${formatMoney(row.total_amount || 0)}</td><td>${row.status === "draft" ? `<button class="btn btn-sm" data-submit-bill="${row.id}" type="button">Submit For Approval</button>` : ""} <button class="btn btn-sm" data-view-bill="${row.id}" type="button">View Bill</button></td></tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:2rem;">No bills created yet.</td></tr>`}
      </tbody></table></div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("createBillBtn")?.addEventListener("click", createBill);
  document.querySelectorAll("[data-submit-bill]").forEach((btn) => btn.addEventListener("click", () => updateBillStatus(btn.dataset.submitBill, "submitted")));
  document.querySelectorAll("[data-view-bill]").forEach((btn) => btn.addEventListener("click", () => showBillDetails(btn.dataset.viewBill)));
}

async function createBill() {
  if (PAGE_STATE.isSavingHeader) return;
  const projectId = document.getElementById("billProjectId")?.value || "";
  const billType = document.getElementById("billType")?.value || "advance";
  const billDate = document.getElementById("billDate")?.value || new Date().toISOString().slice(0,10);
  const status = document.getElementById("billStatus")?.value || "draft";
  const taxAmount = Number(document.getElementById("billTaxAmount")?.value || 0);
  const remarks = String(document.getElementById("billRemarks")?.value || "").trim() || null;
  const lineDescription = String(document.getElementById("billLineDescription")?.value || "").trim();
  const lineQuantity = Number(document.getElementById("billLineQuantity")?.value || 0);
  const lineRate = Number(document.getElementById("billLineRate")?.value || 0);
  const lineSourceType = document.getElementById("billLineSourceType")?.value || "manual";
  if (!projectId || !lineDescription || lineQuantity <= 0) return showToast("Project and at least one valid billing line are required.", TOAST_TYPES.ERROR);

  PAGE_STATE.isSavingHeader = true;
  try {
    const { data: billNumber, error: billNumberError } = await client.rpc("next_interior_bill_number");
    if (billNumberError) throw billNumberError;
    const { data: header, error: headerError } = await client.from("interior_billing_headers").insert({
      project_id: projectId,
      bill_number: billNumber,
      bill_type: billType,
      bill_date: billDate,
      tax_amount: taxAmount,
      status,
      remarks,
      created_by: PAGE_STATE.boot?.appUser?.id || null
    }).select("id").single();
    if (headerError) throw headerError;
    const { error: lineError } = await client.from("interior_billing_lines").insert({
      billing_header_id: header.id,
      description: lineDescription,
      quantity: lineQuantity,
      rate: lineRate,
      source_type: lineSourceType
    });
    if (lineError) throw lineError;
    if (taxAmount > 0) {
      const { error: recalcError } = await client.rpc("recalc_interior_billing_header_total", { p_billing_header_id: header.id });
      if (recalcError) throw recalcError;
    }
    showToast("Bill created.", TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || "Failed to create bill.", TOAST_TYPES.ERROR);
  } finally {
    PAGE_STATE.isSavingHeader = false;
  }
}

async function updateBillStatus(id, status) {
  if (!id) return;
  try {
    const { error } = await client.from("interior_billing_headers").update({ status }).eq("id", id);
    if (error) throw error;
    showToast(`Bill marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to mark bill ${status}.`, TOAST_TYPES.ERROR);
  }
}

function showBillDetails(id) {
  const header = PAGE_STATE.bills.find((row) => String(row.id) === String(id));
  const lines = PAGE_STATE.lines.filter((row) => String(row.billing_header_id) === String(id));
  if (!header) return;
  showToast(`${header.bill_number}: ${lines.length} line(s), total ${formatMoney(header.total_amount || 0)}`, TOAST_TYPES.INFO);
}

function renderOptions(options, selected) { return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join(""); }
function labelForBillType(value) { return ({ advance: "Advance Bill", progress: "Progress Bill", change: "Change Bill", final: "Final Bill" }[value] || value); }
function projectName(sharedProjectId) { const row = PAGE_STATE.projects.find((item) => String(item.shared_project_id) === String(sharedProjectId)); return row ? `${row.project_code || ""} - ${row.project_title || row.project_name || "Project"}` : String(sharedProjectId || "-"); }
function projectClientName(sharedProjectId) { const row = PAGE_STATE.projects.find((item) => String(item.shared_project_id) === String(sharedProjectId)); return row?.interior_clients?.client_name || "-"; }
function formatMoney(value) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0)); }

init().catch((error) => { console.error(error); showToast(error?.message || "Failed to load Billing page.", TOAST_TYPES.ERROR); });