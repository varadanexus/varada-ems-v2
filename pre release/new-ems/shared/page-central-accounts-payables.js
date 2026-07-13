import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { approvePurchaseBill, getVendorAccountingDataset, listCentralPayables, postPurchaseBill, saveAccountingVendor, savePurchaseBill, saveVendorAdvance } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const PAGE_STATE = { rows: [], vendorData: null, canEdit: false, canApprove: false, canPost: false };

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.CENTRAL_ACCOUNTS_PAYABLES,
    pageTitle: "Payables",
    pageDescription: "Read-only payable working book with aging snapshot",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;
  const ps=new Set((boot.permissions||[]).map(p=>`${p.module_code}:${p.action_code}`));
  const admin = boot.roleCodes?.some(r=>["super_admin","admin"].includes(r));
  PAGE_STATE.canEdit=admin||ps.has(`${MODULES.CENTRAL_ACCOUNTS_PAYABLES}:edit`)||ps.has(`${MODULES.CENTRAL_ACCOUNTS_PAYABLES}:create`);
  PAGE_STATE.canApprove=admin||ps.has(`${MODULES.CENTRAL_ACCOUNTS_PAYABLES}:approve`);
  PAGE_STATE.canPost=admin||ps.has(`${MODULES.CENTRAL_ACCOUNTS_PAYABLES}:post`);
  if(PAGE_STATE.canEdit || PAGE_STATE.canApprove || PAGE_STATE.canPost) PAGE_STATE.vendorData=await getVendorAccountingDataset();

  renderModuleContent(renderShell());
  bindEvents();
  await loadPayables();
}

function renderShell() {
  const d=PAGE_STATE.vendorData;
  return `
    ${PAGE_STATE.canEdit?`<section class="card" style="margin-bottom:1rem"><h3>Vendor Accounting</h3><div class="form-row"><form id="vendorForm" class="form-row"><input data-v="vendor_code" placeholder="Vendor Code" required><input data-v="legal_name" placeholder="Legal Name" required><input data-v="gstin" placeholder="GSTIN"><input data-v="pan" placeholder="PAN"><select data-v="payable_account_id"><option value="">Payable Account</option>${accountOptions(d?.accounts)}</select><button class="btn">Add Vendor</button></form></div><hr><form id="purchaseBillForm" class="form-row"><select data-b="vendor_id" required><option value="">Vendor</option>${(d?.vendors||[]).map(v=>`<option value="${v.id}">${escapeHtml(v.vendor_code)} - ${escapeHtml(v.legal_name)}</option>`).join("")}</select><select data-b="division_id"><option value="">Company</option>${(d?.divisions||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}</select><input data-b="bill_no" placeholder="Bill No" required><input data-b="bill_date" type="date" required><input data-b="due_date" type="date"><select data-b="expense_account_id" required><option value="">Expense Account</option>${accountOptions(d?.accounts)}</select><select data-b="input_tax_account_id"><option value="">Input Tax Account</option>${accountOptions(d?.accounts)}</select><select data-b="payable_account_id" required><option value="">Payable Account</option>${accountOptions(d?.accounts)}</select><select data-b="tds_payable_account_id"><option value="">TDS Payable Account</option>${accountOptions(d?.accounts)}</select><input data-b="taxable_amount" type="number" placeholder="Taxable"><input data-b="cgst_amount" type="number" placeholder="CGST"><input data-b="sgst_amount" type="number" placeholder="SGST"><input data-b="igst_amount" type="number" placeholder="IGST"><input data-b="tds_amount" type="number" placeholder="TDS"><input data-b="total_amount" type="number" placeholder="Total" required><button class="btn">Add Purchase Bill</button></form><hr><form id="advanceForm" class="form-row"><select data-a="vendor_id" required><option value="">Vendor Advance</option>${(d?.vendors||[]).map(v=>`<option value="${v.id}">${escapeHtml(v.legal_name)}</option>`).join("")}</select><input data-a="advance_date" type="date" required><input data-a="amount" type="number" placeholder="Amount" required><input data-a="reference_no" placeholder="Reference"><button class="btn">Record Advance</button></form></section>`:""}
    <section class="card" style="margin-bottom:1rem;">
      <h3>Purchase Bills</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Bill</th><th>Vendor</th><th>Date</th><th>Total</th><th>Status</th><th>Voucher</th><th>Action</th></tr></thead>
          <tbody>${renderPurchaseBillRows()}</tbody>
        </table>
      </div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Filters</h3>
      <div class="form-row">
        <input id="caPaySearch" type="text" placeholder="Search document / counterparty / status" />
        <button class="btn" id="caPayApply" type="button">Apply</button>
      </div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Summary</h3>
      <div class="hero-kpis" id="caPaySummary"></div>
    </section>
    <section class="card" style="margin-bottom:1rem;">
      <h3>Aging Buckets</h3>
      <div class="hero-kpis" id="caPayAging"></div>
    </section>
    <section class="card">
      <h3>Payable Open Items</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Financial Document</th><th>Counterparty</th><th>Due Date</th><th>Original Amount</th><th>Open Amount</th><th>Status</th></tr></thead>
          <tbody id="caPayBody"><tr><td colspan="6">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;
}

function bindEvents() {
  qs("#caPayApply")?.addEventListener("click", loadPayables);
  qs("#vendorForm")?.addEventListener("submit",saveVendor);
  qs("#purchaseBillForm")?.addEventListener("submit",saveBill);
  qs("#advanceForm")?.addEventListener("submit",saveAdvance);
  document.querySelectorAll("[data-approve-bill]").forEach((button)=>button.addEventListener("click",async()=>{await approvePurchaseBill(button.dataset.approveBill);showToast("Purchase bill approved","success");location.reload();}));
  document.querySelectorAll("[data-post-bill]").forEach((button)=>button.addEventListener("click",async()=>{await postPurchaseBill(button.dataset.postBill);showToast("Purchase bill posted to voucher and journal","success");location.reload();}));
}
const collect=(form,key)=>{const p={};form.querySelectorAll(`[data-${key}]`).forEach(x=>p[x.dataset[key]]=x.value||null);return p};
async function saveVendor(e){e.preventDefault();await saveAccountingVendor(collect(e.target,"v"));showToast("Vendor added","success");location.reload()}
async function saveBill(e){e.preventDefault();const p=collect(e.target,"b");["taxable_amount","cgst_amount","sgst_amount","igst_amount","tds_amount","total_amount"].forEach(k=>p[k]=Number(p[k]||0));if(!p.tds_payable_account_id)delete p.tds_payable_account_id;await savePurchaseBill(p);showToast("Purchase bill added","success");location.reload()}
async function saveAdvance(e){e.preventDefault();const p=collect(e.target,"a");p.amount=Number(p.amount||0);await saveVendorAdvance(p);showToast("Vendor advance recorded","success");location.reload()}
function accountOptions(a=[]){return a.map(x=>`<option value="${x.id}">${escapeHtml(x.code)} - ${escapeHtml(x.name)}</option>`).join("")}
function renderPurchaseBillRows(){
  const rows=PAGE_STATE.vendorData?.bills||[];
  if(!rows.length)return `<tr><td colspan="7">No purchase bills recorded.</td></tr>`;
  return rows.map((b)=>`<tr><td>${escapeHtml(b.bill_no)}</td><td>${escapeHtml(b.accounting_vendors?.legal_name||"-")}</td><td>${escapeHtml(b.bill_date)}</td><td>₹${Number(b.total_amount||0).toFixed(2)}</td><td><span class="meta-pill">${escapeHtml(b.status)}</span></td><td>${escapeHtml(b.accounting_vouchers?.voucher_no||"-")}</td><td>${PAGE_STATE.canApprove&&["draft","submitted"].includes(b.status)?`<button class="btn btn-sm" data-approve-bill="${b.id}">Approve</button>`:""} ${PAGE_STATE.canPost&&b.status==="approved"?`<button class="btn btn-sm" data-post-bill="${b.id}">Post</button>`:""}</td></tr>`).join("");
}

async function loadPayables() {
  try {
    PAGE_STATE.rows = await listCentralPayables({ search: qs("#caPaySearch")?.value || "" });
    renderSummary();
    renderRows();
  } catch (error) {
    showToast(error?.message || "Failed to load payables", TOAST_TYPES.ERROR);
  }
}

function renderSummary() {
  const host = qs("#caPaySummary");
  const agingHost = qs("#caPayAging");
  if (!host || !agingHost) return;
  const summary = getSummary(PAGE_STATE.rows);
  const aging = getAging(PAGE_STATE.rows);
  host.innerHTML = `
    <span class="meta-pill">Total Original: ₹${summary.totalOriginal.toFixed(2)}</span>
    <span class="meta-pill">Total Open: ₹${summary.totalOpen.toFixed(2)}</span>
    <span class="meta-pill">Open Count: ${summary.openCount}</span>
    <span class="meta-pill">Settled / Partial: ${summary.settledPartialCount}</span>
  `;
  agingHost.innerHTML = `
    <span class="meta-pill">0-30: ₹${aging.bucket0to30.toFixed(2)}</span>
    <span class="meta-pill">31-60: ₹${aging.bucket31to60.toFixed(2)}</span>
    <span class="meta-pill">61-90: ₹${aging.bucket61to90.toFixed(2)}</span>
    <span class="meta-pill">90+: ₹${aging.bucket90Plus.toFixed(2)}</span>
  `;
}

function renderRows() {
  const body = qs("#caPayBody");
  if (!body) return;
  if (!PAGE_STATE.rows.length) {
    body.innerHTML = `<tr><td colspan="6">No payable items found.</td></tr>`;
    return;
  }
  body.innerHTML = PAGE_STATE.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.financial_documents?.source_document_no || row.financial_document_id || "—")}</td>
      <td>${escapeHtml(row.reporting_dimensions?.name || row.reporting_dimensions?.code || "—")}</td>
      <td>${escapeHtml(row.due_date || row.financial_documents?.document_date || "—")}</td>
      <td>₹${Number(row.original_amount || 0).toFixed(2)}</td>
      <td>₹${Number(row.open_amount || 0).toFixed(2)}</td>
      <td><span class="meta-pill">${escapeHtml(row.status || "—")}</span></td>
    </tr>
  `).join("");
}

function getSummary(rows) {
  return rows.reduce((acc, row) => {
    acc.totalOriginal += Number(row.original_amount || 0);
    acc.totalOpen += Number(row.open_amount || 0);
    if (row.status === "open") acc.openCount += 1;
    if (["settled", "partially_settled"].includes(row.status)) acc.settledPartialCount += 1;
    return acc;
  }, { totalOriginal: 0, totalOpen: 0, openCount: 0, settledPartialCount: 0 });
}

function getAging(rows) {
  const today = new Date();
  return rows.reduce((acc, row) => {
    const due = new Date(row.due_date || row.financial_documents?.document_date || today.toISOString().slice(0, 10));
    const days = Math.max(0, Math.floor((today - due) / 86400000));
    const amount = Number(row.open_amount || 0);
    if (days <= 30) acc.bucket0to30 += amount;
    else if (days <= 60) acc.bucket31to60 += amount;
    else if (days <= 90) acc.bucket61to90 += amount;
    else acc.bucket90Plus += amount;
    return acc;
  }, { bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucket90Plus: 0 });
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

init();
