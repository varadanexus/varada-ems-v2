import { ROUTES } from "../config/constants.js";
import {
  addMarketingMessage, createMarketingQuery, getMarketingIdentity,
  getMarketingPortalSessionToken, listMarketingAssignments, listMarketingDeliverables,
  listMarketingMessages, listMarketingProjects, listMarketingQueries,
  listMarketingVendorInvoices, listMarketingVendorPayments, marketingSetupMessage,
  signOutMarketingPortal, subscribeToMarketingQueries, updateMarketingAssignment,
  updateMarketingDeliverable, updateMarketingQuery
} from "./marketing-api.js?v=marketing-whatsapp-1";
import { uploadMarketingVendorInvoiceToDrive } from "./drive-api.js?v=vendor-workspace-1";
import { enforceMarketingPortalDisclaimer } from "./marketing-disclaimer-gate.js?v=terms-face-handoff-2";

const state = {
  identity: null, projects: [], assignments: [], deliverables: [], queries: [], invoices: [], payments: [],
  section: "dashboard", activeProjectId: "", activeQueryId: "", deliverableProjectFilter: "", messages: [], channel: null, notice: null,
  customBillOpen: false
};
const sections = {
  dashboard: ["Dashboard", "Your delivery work, actions, and earnings at a glance"],
  projects: ["Projects", "Manage the status of every assigned engagement"],
  deliverables: ["Deliverables", "Update work items and handoffs in real time"],
  queries: ["Queries", "Contact Varada Nexus or the client-facing desk separately"],
  invoices: ["Invoices", "Create invoices and upload supporting bills"],
  payments: ["Payments", "Payments recorded against your work"]
};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
const label = (value) => String(value || "").replaceAll("_", " ");
const badge = (value, tone = "") => `<span class="cp-badge ${tone}">${esc(label(value))}</span>`;
const icon = (text) => `<span class="cp-nav-icon">${text}</span>`;
const empty = (text) => `<div class="mkt-empty">${esc(text)}</div>`;
const assignmentFor = (projectId) => state.assignments.find((row) => row.project_id === projectId);
const projectFor = (projectId) => state.projects.find((row) => row.id === projectId);
const openQueries = () => state.queries.filter((row) => !["resolved", "closed"].includes(row.status));
const paidTotal = () => state.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);

document.querySelector("#app").innerHTML = `<main class="cp-loading"><div class="mkt-brand">VARADA NEXUS</div><h1>Preparing your vendor workspace</h1><p>Securely loading assigned work and finance records…</p></main>`;

function projectProgress(projectId) {
  const rows = state.deliverables.filter((row) => row.project_id === projectId);
  if (!rows.length) return 0;
  return Math.round(rows.filter((row) => ["approved", "done"].includes(row.status)).length / rows.length * 100);
}
function pendingDeliverables() {
  return state.deliverables.filter((row) => !["approved", "done"].includes(row.status));
}
function sidebar() {
  const profile = state.identity.profile;
  const nav = (key, text, glyph, count = "") => `<button class="cp-nav-item ${state.section === key ? "active" : ""}" data-section="${key}">${icon(glyph)}<span>${text}</span>${count !== "" ? `<em>${count}</em>` : ""}</button>`;
  return `<aside class="cp-sidebar" id="cpSidebar">
    <div class="cp-logo"><img class="cp-logo-image" src="/images/logo.png" alt="Varada Nexus"><div class="cp-wordmark"><strong>Varada <span>Nexus</span></strong><small>Private Limited</small></div></div>
    <div class="cp-nav-group"><small>VENDOR WORKSPACE</small>
      ${nav("dashboard", "Dashboard", "D")}${nav("projects", "Projects", "P", state.projects.length)}${nav("deliverables", "Deliverables", "✓", pendingDeliverables().length)}${nav("queries", "Queries", "Q", openQueries().length)}
    </div>
    <div class="cp-nav-group"><small>FINANCE</small>
      ${nav("invoices", "Invoices & bills", "I", state.invoices.length)}${nav("payments", "Payments received", "₹", state.payments.length)}
    </div>
    <div class="cp-sidebar-spacer"></div>
    <div class="cp-profile"><span>${esc((profile.legal_name || "V").slice(0, 1).toUpperCase())}</span><div><strong>${esc(profile.legal_name)}</strong><small>${esc(profile.vendor_code || profile.vendor_type || "Delivery partner")}</small></div></div>
    <button class="cp-signout" id="logout">Sign out</button>
  </aside>`;
}
function kpi(labelText, value, note, tone = "") {
  return `<article class="cp-kpi ${tone}"><div><span>${esc(labelText)}</span><strong>${value}</strong></div><small>${esc(note)}</small></article>`;
}
function projectRow(project) {
  const progress = projectProgress(project.id);
  const assignment = assignmentFor(project.id);
  return `<button class="cp-project-row" data-project="${project.id}"><div class="cp-project-symbol">${esc((project.title || "P").slice(0, 2).toUpperCase())}</div><div class="cp-project-copy"><div><strong>${esc(project.title)}</strong>${badge(assignment?.assignment_status || "assigned")}</div><small>${esc(project.project_code)} · ${esc(project.marketing_clients?.company_name || "Client account")}</small><div class="cp-progress"><span style="width:${progress}%"></span></div></div><b>${progress}%</b></button>`;
}
function dashboardView() {
  const active = state.assignments.filter((row) => row.assignment_status !== "completed");
  const profile = state.identity.profile;
  return `<section class="cp-hero"><div><span class="cp-eyebrow">DELIVERY COMMAND CENTER</span><h2>Welcome, ${esc(profile.contact_name || profile.legal_name)}.</h2><p>Work as the Varada Nexus delivery team while your commercial records remain private.</p></div><div class="cp-hero-date"><small>TODAY</small><strong>${date(new Date())}</strong></div></section>
  <div class="cp-kpi-grid">
    ${kpi("Active assignments", active.length, `${state.projects.length} projects assigned`, "gold")}
    ${kpi("Pending deliverables", pendingDeliverables().length, `${state.deliverables.length} total work items`)}
    ${kpi("Open queries", openQueries().length, "Across company and client desks")}
    ${kpi("Payments received", money(paidTotal()), `${state.payments.length} recorded transactions`, "success")}
  </div>
  <div class="cp-dashboard-grid"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">ASSIGNED WORK</span><h3>Project health</h3></div><button data-section="projects">View all</button></div>${state.projects.slice(0, 5).map(projectRow).join("") || empty("No projects are currently assigned.")}</section>
  <section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">ACTION QUEUE</span><h3>Deliverables due</h3></div><button data-section="deliverables">Manage</button></div>${pendingDeliverables().slice(0, 5).map(deliverableSummary).join("") || empty("All visible deliverables are complete.")}</section></div>`;
}
function assignmentSelect(assignment) {
  const options = ["assigned", "accepted", "in_progress", "completed"];
  return `<select class="cp-status-select" data-assignment="${assignment.id}" aria-label="Project status">${options.map((value) => `<option value="${value}" ${assignment.assignment_status === value ? "selected" : ""} ${value === "assigned" && assignment.assignment_status !== "assigned" ? "disabled" : ""}>${esc(label(value))}</option>`).join("")}</select>`;
}
function deliverableSelect(row) {
  const options = ["todo", "in_progress", "vendor_review", "client_review", "revision", "approved", "done"];
  return `<select class="cp-status-select" data-deliverable="${row.id}" aria-label="Deliverable status">${options.map((value) => `<option value="${value}" ${row.status === value ? "selected" : ""}>${esc(label(value))}</option>`).join("")}</select>`;
}
function projectsView() {
  const selected = projectFor(state.activeProjectId);
  const assignment = selected ? assignmentFor(selected.id) : null;
  const rows = selected ? state.deliverables.filter((row) => row.project_id === selected.id) : [];
  return `<div class="cp-projects-stack"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">PORTFOLIO</span><h3>Assigned projects</h3></div><span>${state.projects.length} engagements</span></div>${state.projects.map(projectRow).join("") || empty("No projects have been assigned.")}${state.projects.length && !selected ? '<p class="cp-project-hint">Select a project to manage its status and deliverables.</p>' : ""}</section>
  ${selected ? `<section class="cp-card cp-project-detail"><div class="cp-detail-head"><div><span class="cp-eyebrow">${esc(selected.project_code)}</span><h3>${esc(selected.title)}</h3><p>${esc(selected.brief || "No project brief has been added.")}</p></div>${assignment ? assignmentSelect(assignment) : badge(selected.status)}</div><div class="cp-detail-meta"><div><small>CLIENT ACCOUNT</small><strong>${esc(selected.marketing_clients?.company_name || "—")}</strong></div><div><small>TARGET DATE</small><strong>${date(selected.target_date)}</strong></div><div><small>DELIVERY PROGRESS</small><strong>${projectProgress(selected.id)}%</strong></div></div><div class="cp-progress large"><span style="width:${projectProgress(selected.id)}%"></span></div><h4>Project deliverables</h4>${rows.map(deliverableEditor).join("") || empty("No deliverables have been added to this project.")}</section>` : ""}</div>`;
}
function deliverableSummary(row) {
  const project = projectFor(row.project_id);
  return `<div class="cp-invoice-mini"><div><strong>${esc(row.title)}</strong><small>${esc(project?.project_code || "Project")} · Due ${date(row.due_date)}</small></div>${badge(row.status)}</div>`;
}
function deliverableEditor(row) {
  const project = projectFor(row.project_id);
  return `<article class="cp-deliverable cp-deliverable-edit"><span class="cp-status-dot ${esc(row.status)}"></span><div><strong>${esc(row.title)}</strong><small>${esc(row.description || project?.title || "Work item")} · Due ${date(row.due_date)}</small></div>${deliverableSelect(row)}</article>`;
}
function deliverablesView() {
  const rows = state.deliverableProjectFilter ? state.deliverables.filter((row) => row.project_id === state.deliverableProjectFilter) : state.deliverables;
  return `<section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">WORK TRACKER</span><h3>All deliverables</h3></div><span>Changes are visible live</span></div><div class="cp-filter-row"><select id="deliverableProjectFilter"><option value="">All projects</option>${state.projects.map((row) => `<option value="${row.id}" ${row.id === state.deliverableProjectFilter ? "selected" : ""}>${esc(row.project_code)} · ${esc(row.title)}</option>`).join("")}</select></div><div id="deliverableRows">${rows.map(deliverableEditor).join("") || empty("No deliverables match this project.")}</div></section>`;
}
function thread() {
  const query = state.queries.find((row) => row.id === state.activeQueryId);
  if (!query) return `<section class="cp-card cp-thread">${empty("Select a query to open its conversation.")}</section>`;
  return `<section class="cp-card cp-thread"><div class="cp-card-head"><div><span class="cp-eyebrow">${esc(query.query_number)} · ${esc(query.audience === "client" ? "CLIENT DESK" : "VARADA NEXUS")}</span><h3>${esc(query.subject)}</h3></div>${query.status === "resolved" ? badge("resolved", "success") : `<button id="resolveQuery">Mark resolved</button>`}</div><div class="mkt-thread">${state.messages.map((message) => `<article class="mkt-message ${message.sender_label === "Varada Nexus Delivery Team" ? "brand" : ""}"><small>${esc(message.sender_label)} · ${new Date(message.created_at).toLocaleString("en-IN")}</small>${esc(message.body).replaceAll("\n", "<br>")}</article>`).join("") || empty("There are no messages in this query yet.")}</div><form id="replyForm" class="mkt-composer"><textarea name="body" rows="2" required placeholder="Write a reply…"></textarea><button class="btn">Send</button></form></section>`;
}
function queriesView() {
  return `<div class="cp-query-grid"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">COMMUNICATIONS</span><h3>Raise a query</h3></div>${badge(`${openQueries().length} open`)}</div><form id="newQuery" class="mkt-form cp-query-form"><label class="wide">Project<select name="projectId" required><option value="">Select project</option>${state.projects.map((row) => `<option value="${row.id}" ${row.id === state.activeProjectId ? "selected" : ""}>${esc(row.project_code)} · ${esc(row.title)}</option>`).join("")}</select></label><label class="wide">Send query to<select name="audience" required><option value="company">Varada Nexus company desk</option><option value="client">Client-facing desk</option></select><small class="cp-field-note">Client-facing messages identify you only as the Varada Nexus Delivery Team.</small></label><label class="wide">Subject<input name="subject" required placeholder="What needs attention?"></label><label>Category<select name="category"><option>general</option><option>requirement</option><option>content</option><option>design</option><option>approval</option><option>timeline</option><option>technical</option></select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><label class="wide">Message<textarea name="message" required placeholder="Add the details needed to respond…"></textarea></label><button class="btn wide">Open query</button></form><div class="cp-query-list">${state.queries.map((row) => `<button class="cp-query-row ${row.id === state.activeQueryId ? "active" : ""}" data-query="${row.id}"><span class="cp-status-dot ${esc(row.status)}"></span><div><strong>${esc(row.subject)}</strong><small>${esc(row.query_number)} · ${row.audience === "client" ? "Client desk" : "Company desk"} · ${date(row.last_message_at)}</small></div>${badge(row.status)}</button>`).join("") || empty("No queries have been raised.")}</div></section>${thread()}</div>`;
}
function invoicesView() {
  return `<div class="cp-invoice-layout"><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">NEW INVOICE</span><h3>Submit invoice or bill</h3></div>${badge("PDF / JPG / PNG")}</div><div class="cp-custom-bill-callout"><div><strong>Need to create a bill?</strong><small>Use the built-in billing module to prepare a professional invoice.</small></div><button type="button" class="btn" id="openCustomBill">Create custom bill</button></div><form id="vendorInvoiceForm" class="mkt-form cp-vendor-invoice-form"><label class="wide">Assigned project<select name="projectId" required><option value="">Select project</option>${state.projects.map((row) => `<option value="${row.id}">${esc(row.project_code)} · ${esc(row.title)}</option>`).join("")}</select></label><label>Invoice number<input name="invoiceNumber" required maxlength="80" placeholder="INV-001"></label><label>Invoice date<input type="date" name="invoiceDate" required></label><label>Due date<input type="date" name="dueDate"></label><label>Taxable amount (₹)<input type="number" name="taxableAmount" min="0.01" step="0.01" required placeholder="0.00"></label><label>GST rate<select name="gstRate"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18" selected>18%</option><option value="28">28%</option></select></label><label class="wide">Description<textarea name="description" rows="2" placeholder="Services covered by this invoice"></textarea></label><label class="wide cp-file-field">Bill file<input type="file" name="billFile" accept="application/pdf,image/jpeg,image/png" required><small>Maximum 10 MB. Accepted formats: PDF, JPG and PNG.</small></label><div class="wide cp-invoice-preview"><span>Calculated invoice total</span><strong id="invoiceTotal">₹0.00</strong></div><button class="btn wide" id="invoiceSubmit">Submit invoice & upload bill</button></form></section>
  <section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">SUBMISSIONS</span><h3>Your invoices</h3></div><span>${state.invoices.length} records</span></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Invoice</th><th>Project</th><th>Date</th><th>Total</th><th>Status</th><th>Bill</th></tr></thead><tbody>${state.invoices.map((row) => `<tr><td><strong>${esc(row.invoice_number)}</strong><small>${esc(row.description || "Vendor invoice")}</small></td><td>${esc(row.project?.title || "—")}</td><td>${date(row.invoice_date)}</td><td>${money(row.total_amount)}</td><td>${badge(row.status, row.status === "paid" ? "success" : "")}</td><td>${row.web_view_link ? `<a class="cp-table-link" href="${esc(row.web_view_link)}" target="_blank" rel="noreferrer">View bill</a>` : "Processing"}</td></tr>`).join("") || '<tr><td colspan="6">No invoices have been submitted.</td></tr>'}</tbody></table></div></section></div>${state.customBillOpen ? customBillModule() : ""}`;
}
function customBillModule() {
  const profile = state.identity.profile;
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="cp-bill-module" role="dialog" aria-modal="true" aria-labelledby="customBillTitle"><div class="cp-bill-module-panel"><header><div><span class="cp-eyebrow">VENDOR BILLING MODULE</span><h2 id="customBillTitle">Create custom bill</h2><p>Build a professional invoice and submit it directly for approval.</p></div><button type="button" class="cp-bill-close" id="closeCustomBill" aria-label="Close">×</button></header><form id="customBillForm" class="mkt-form cp-custom-bill-form"><section class="cp-bill-section"><h3>Invoice details</h3><div class="cp-bill-grid"><label>Assigned project<select name="projectId" required><option value="">Select project</option>${state.projects.map((row) => `<option value="${row.id}">${esc(row.project_code)} · ${esc(row.title)}</option>`).join("")}</select></label><label>Invoice number<input name="invoiceNumber" required maxlength="80" placeholder="INV-001"></label><label>Invoice date<input type="date" name="invoiceDate" value="${today}" required></label><label>Due date<input type="date" name="dueDate"></label></div></section><section class="cp-bill-section"><div class="cp-bill-section-head"><div><h3>Bill items</h3><p>Add each service or deliverable separately.</p></div><button type="button" class="btn btn-ghost" id="addBillItem">+ Add item</button></div><div id="customBillItems"><div class="cp-bill-item" data-custom-item><label>Description<input name="itemDescription" required placeholder="Service or deliverable"></label><label>Quantity<input type="number" name="itemQuantity" min="0.01" step="0.01" value="1" required></label><label>Rate (₹)<input type="number" name="itemRate" min="0.01" step="0.01" placeholder="0.00" required></label><button type="button" data-remove-item aria-label="Remove item">×</button></div></div></section><section class="cp-bill-section"><h3>Tax and payment details</h3><div class="cp-bill-grid"><label>GST rate<select name="gstRate"><option value="0" ${!profile.gstin ? "selected" : ""}>0%</option><option value="5">5%</option><option value="12">12%</option><option value="18" ${profile.gstin ? "selected" : ""}>18%</option><option value="28">28%</option></select></label><label>PAN<input value="${esc(profile.pan || "Not provided")}" readonly></label><label>GSTIN<input value="${esc(profile.gstin || "Not registered")}" readonly></label><label>Bank name<input name="bankName" placeholder="Your bank"></label><label>Account holder<input name="accountHolder" value="${esc(profile.legal_name || "")}" placeholder="Account holder name"></label><label>Account number<input name="accountNumber" autocomplete="off" placeholder="Bank account number"></label><label>IFSC<input name="ifsc" maxlength="11" placeholder="IFSC code" style="text-transform:uppercase"></label><label>UPI ID<input name="upiId" placeholder="name@bank"></label><label class="wide">Notes<textarea name="notes" rows="2" placeholder="Payment terms or additional notes"></textarea></label></div></section><div class="cp-bill-summary"><div><span>Subtotal</span><strong id="customBillSubtotal">₹0.00</strong></div><div><span>GST</span><strong id="customBillTax">₹0.00</strong></div><div class="total"><span>Invoice total</span><strong id="customBillTotal">₹0.00</strong></div></div><footer><button type="button" class="btn btn-ghost" id="downloadCustomBill">Download draft PDF</button><button type="submit" class="btn" id="submitCustomBill">Create & submit bill</button></footer></form></div></div>`;
}
function paymentsView() {
  return `<div class="cp-payment-layout"><section class="cp-card cp-payment-summary"><span class="cp-eyebrow">PAYMENT SUMMARY</span><h2>${money(paidTotal())}</h2><p>Total payments recorded across ${state.payments.length} transaction${state.payments.length === 1 ? "" : "s"}.</p><div><small>Approved invoices</small><strong>${state.invoices.filter((row) => ["approved", "partially_paid", "paid"].includes(row.status)).length}</strong></div></section><section class="cp-card"><div class="cp-card-head"><div><span class="cp-eyebrow">PAYMENT HISTORY</span><h3>Payments received</h3></div><span>${state.payments.length} records</span></div><div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Date</th><th>Project</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${state.payments.map((row) => `<tr><td>${date(row.paid_at)}</td><td>${esc(row.project?.title || "—")}</td><td>${esc(row.invoice?.invoice_number || "—")}</td><td>${esc(label(row.method) || "—")}</td><td>${esc(row.reference || "—")}</td><td class="cp-paid"><strong>${money(row.amount)}</strong></td></tr>`).join("") || '<tr><td colspan="6">No vendor payments have been recorded yet.</td></tr>'}</tbody></table></div></section></div>`;
}
function content() {
  if (state.section === "dashboard") return dashboardView();
  if (state.section === "projects") return projectsView();
  if (state.section === "deliverables") return deliverablesView();
  if (state.section === "queries") return queriesView();
  if (state.section === "invoices") return invoicesView();
  return paymentsView();
}
function render() {
  const [title, subtitle] = sections[state.section];
  document.querySelector("#app").innerHTML = `<div class="cp-shell vendor-workspace">${sidebar()}<main class="cp-main"><header class="cp-topbar"><button class="cp-menu" id="cpMenu">☰</button><div><span class="cp-breadcrumb">VENDOR PORTAL / ${esc(title.toUpperCase())}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="cp-secure"><span></span>Secure vendor session</div></header>${state.notice ? `<div class="cp-notice ${esc(state.notice.tone || "")}">${esc(state.notice.text)}</div>` : ""}<div class="cp-content">${content()}</div><footer>Varada Nexus Private Limited · Secure Vendor Workspace</footer></main></div>`;
  bind();
}
function setNotice(text, tone = "success") {
  state.notice = { text, tone };
  render();
  window.setTimeout(() => { if (state.notice?.text === text) { state.notice = null; render(); } }, 4500);
}
function selectSection(section) { state.section = section; render(); }
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The bill file could not be read"));
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.readAsDataURL(file);
  });
}
function customBillValues(form) {
  const items = [...form.querySelectorAll("[data-custom-item]")].map((row) => ({
    description: row.querySelector('[name="itemDescription"]').value.trim(),
    quantity: Number(row.querySelector('[name="itemQuantity"]').value || 0),
    rate: Number(row.querySelector('[name="itemRate"]').value || 0)
  })).filter((row) => row.description && row.quantity > 0 && row.rate > 0);
  const subtotal = items.reduce((sum, row) => sum + (row.quantity * row.rate), 0);
  const gstRate = Number(form.elements.gstRate.value || 0);
  return { items, subtotal, gstRate, gstAmount: subtotal * gstRate / 100, total: subtotal * (1 + gstRate / 100) };
}
function updateCustomBillTotal(form) {
  const values = customBillValues(form);
  document.querySelector("#customBillSubtotal").textContent = money(values.subtotal);
  document.querySelector("#customBillTax").textContent = money(values.gstAmount);
  document.querySelector("#customBillTotal").textContent = money(values.total);
}
async function generateCustomBillFile(form) {
  const values = customBillValues(form);
  if (!values.items.length) throw new Error("Add at least one complete bill item.");
  const data = Object.fromEntries(new FormData(form));
  const project = projectFor(data.projectId);
  const vendor = state.identity.profile;
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(10, 13, 18); doc.rect(0, 0, width, 37, "F");
  doc.setTextColor(216, 183, 101); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(String(vendor.legal_name || "VENDOR").toUpperCase(), 15, 16);
  doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.text(vendor.vendor_type === "freelancer" ? "INDEPENDENT PROFESSIONAL" : "VENDOR INVOICE", 15, 23);
  doc.setFontSize(22); doc.text(vendor.gstin && values.gstRate ? "TAX INVOICE" : "INVOICE", width - 15, 20, { align: "right" });
  doc.setTextColor(30, 36, 46); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  let y = 48;
  doc.setFont("helvetica", "bold"); doc.text("FROM", 15, y); doc.text("BILL TO", 112, y);
  doc.setFont("helvetica", "normal"); y += 6;
  doc.text(String(vendor.legal_name || "—"), 15, y); doc.text("Varada Nexus Private Limited", 112, y);
  y += 5; doc.text(`PAN: ${vendor.pan || "—"}`, 15, y); doc.text("Digital Marketing and Services Division", 112, y);
  y += 5; doc.text(`GSTIN: ${vendor.gstin || "Not registered"}`, 15, y);
  const addressLines = doc.splitTextToSize(String(vendor.legal_address || ""), 82); if (addressLines.length) { y += 5; doc.text(addressLines, 15, y); }
  y = Math.max(76, y + (addressLines.length * 4));
  doc.setDrawColor(215, 219, 226); doc.line(15, y, width - 15, y); y += 8;
  doc.setFont("helvetica", "bold"); doc.text(`Invoice: ${data.invoiceNumber}`, 15, y); doc.text(`Date: ${date(data.invoiceDate)}`, 76, y); doc.text(`Due: ${date(data.dueDate)}`, 135, y);
  y += 6; doc.setFont("helvetica", "normal"); doc.text(`Project: ${project?.project_code || "—"} · ${project?.title || "—"}`, 15, y); y += 10;
  doc.setFillColor(22, 28, 38); doc.rect(15, y, width - 30, 9, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", 18, y + 6); doc.text("QTY", 135, y + 6, { align: "right" }); doc.text("RATE", 164, y + 6, { align: "right" }); doc.text("AMOUNT", width - 18, y + 6, { align: "right" }); y += 9;
  doc.setTextColor(30, 36, 46); doc.setFont("helvetica", "normal");
  values.items.forEach((item, index) => { const rowHeight = 10; if (index % 2 === 1) { doc.setFillColor(247, 248, 250); doc.rect(15, y, width - 30, rowHeight, "F"); } doc.text(item.description.slice(0, 72), 18, y + 6); doc.text(String(item.quantity), 135, y + 6, { align: "right" }); doc.text(money(item.rate).replace("₹", "Rs. "), 164, y + 6, { align: "right" }); doc.text(money(item.quantity * item.rate).replace("₹", "Rs. "), width - 18, y + 6, { align: "right" }); y += rowHeight; });
  y += 5; doc.setFont("helvetica", "normal"); doc.text("Subtotal", 150, y, { align: "right" }); doc.text(money(values.subtotal).replace("₹", "Rs. "), width - 18, y, { align: "right" });
  y += 6; doc.text(`GST (${values.gstRate}%)`, 150, y, { align: "right" }); doc.text(money(values.gstAmount).replace("₹", "Rs. "), width - 18, y, { align: "right" });
  y += 7; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("TOTAL", 150, y, { align: "right" }); doc.setTextColor(177, 133, 33); doc.text(money(values.total).replace("₹", "Rs. "), width - 18, y, { align: "right" });
  y += 14; doc.setTextColor(30, 36, 46); doc.setFontSize(9); doc.text("PAYMENT DETAILS", 15, y); doc.setFont("helvetica", "normal"); y += 6;
  const payment = [["Bank", data.bankName], ["Account holder", data.accountHolder], ["Account number", data.accountNumber], ["IFSC", data.ifsc?.toUpperCase()], ["UPI", data.upiId]].filter(([, value]) => value);
  payment.forEach(([key, value]) => { doc.text(`${key}: ${value}`, 15, y); y += 5; });
  if (data.notes) { y += 3; doc.setFont("helvetica", "bold"); doc.text("Notes", 15, y); doc.setFont("helvetica", "normal"); y += 5; doc.text(doc.splitTextToSize(data.notes, width - 30), 15, y); }
  doc.setFontSize(7); doc.setTextColor(105, 112, 124); doc.text("System-generated vendor invoice created through the Varada Nexus Vendor Portal.", width / 2, 287, { align: "center" });
  const filename = `${String(data.invoiceNumber || "vendor-invoice").replace(/[^a-z0-9_-]+/gi, "-")}.pdf`;
  return new File([doc.output("blob")], filename, { type: "application/pdf" });
}
async function submitVendorBill(data, file) {
  const base64 = await fileToBase64(file);
  await uploadMarketingVendorInvoiceToDrive({
    sessionToken: getMarketingPortalSessionToken(), projectId: data.projectId,
    invoiceNumber: data.invoiceNumber, invoiceDate: data.invoiceDate, dueDate: data.dueDate,
    taxableAmount: data.taxableAmount, gstRate: data.gstRate, description: data.description,
    fileName: file.name, mimeType: file.type || "application/pdf"
  }, base64);
}
function bind() {
  document.querySelector("#logout")?.addEventListener("click", async () => { await signOutMarketingPortal(); location.replace(ROUTES.LOGIN); });
  document.querySelector("#cpMenu")?.addEventListener("click", () => document.querySelector("#cpSidebar")?.classList.toggle("open"));
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.section === "projects") state.activeProjectId = "";
    selectSection(button.dataset.section);
  }));
  document.querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => { state.activeProjectId = button.dataset.project; selectSection("projects"); }));
  document.querySelectorAll("[data-assignment]").forEach((select) => select.addEventListener("change", async () => {
    try { await updateMarketingAssignment(select.dataset.assignment, { assignment_status: select.value }); await load(); setNotice("Project delivery status updated."); }
    catch (error) { await load(); setNotice(error.message || "Project status could not be updated.", "error"); }
  }));
  document.querySelectorAll("[data-deliverable]").forEach((select) => select.addEventListener("change", async () => {
    try { await updateMarketingDeliverable(select.dataset.deliverable, { status: select.value }); await load(); setNotice("Deliverable status updated."); }
    catch (error) { await load(); setNotice(error.message || "Deliverable status could not be updated.", "error"); }
  }));
  document.querySelector("#deliverableProjectFilter")?.addEventListener("change", (event) => {
    state.deliverableProjectFilter = event.currentTarget.value;
    render();
  });
  document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", async () => { state.activeQueryId = button.dataset.query; state.messages = await listMarketingMessages(state.activeQueryId); render(); }));
  document.querySelector("#newQuery")?.addEventListener("submit", async (event) => { event.preventDefault(); try { const payload = Object.fromEntries(new FormData(event.currentTarget)); const query = await createMarketingQuery(payload); state.activeQueryId = query.id; await load(); setNotice(`Query opened with the ${payload.audience === "client" ? "client-facing" : "company"} desk.`); } catch (error) { setNotice(error.message || "Query could not be opened.", "error"); } });
  document.querySelector("#replyForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget)); try { await addMarketingMessage(state.activeQueryId, payload.body); await load(); } catch (error) { setNotice(error.message || "Reply could not be sent.", "error"); } });
  document.querySelector("#resolveQuery")?.addEventListener("click", async () => { await updateMarketingQuery(state.activeQueryId, { status: "resolved" }); await load(); });
  document.querySelector("#openCustomBill")?.addEventListener("click", () => { state.customBillOpen = true; render(); });
  document.querySelector("#closeCustomBill")?.addEventListener("click", () => { state.customBillOpen = false; render(); });
  document.querySelector(".cp-bill-module")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) { state.customBillOpen = false; render(); } });
  const customBillForm = document.querySelector("#customBillForm");
  const bindBillItem = (row) => { row.querySelector("[data-remove-item]")?.addEventListener("click", () => { if (customBillForm.querySelectorAll("[data-custom-item]").length > 1) row.remove(); updateCustomBillTotal(customBillForm); }); };
  customBillForm?.querySelectorAll("[data-custom-item]").forEach(bindBillItem);
  customBillForm?.addEventListener("input", () => updateCustomBillTotal(customBillForm));
  customBillForm?.addEventListener("change", () => updateCustomBillTotal(customBillForm));
  document.querySelector("#addBillItem")?.addEventListener("click", () => { const row = document.createElement("div"); row.className = "cp-bill-item"; row.dataset.customItem = ""; row.innerHTML = '<label>Description<input name="itemDescription" required placeholder="Service or deliverable"></label><label>Quantity<input type="number" name="itemQuantity" min="0.01" step="0.01" value="1" required></label><label>Rate (₹)<input type="number" name="itemRate" min="0.01" step="0.01" placeholder="0.00" required></label><button type="button" data-remove-item aria-label="Remove item">×</button>'; document.querySelector("#customBillItems").appendChild(row); bindBillItem(row); });
  document.querySelector("#downloadCustomBill")?.addEventListener("click", async (event) => { const button = event.currentTarget; try { if (!customBillForm.reportValidity()) return; button.disabled = true; const file = await generateCustomBillFile(customBillForm); const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { setNotice(error.message || "The bill PDF could not be created.", "error"); } finally { if (button.isConnected) button.disabled = false; } });
  customBillForm?.addEventListener("submit", async (event) => { event.preventDefault(); const button = document.querySelector("#submitCustomBill"); button.disabled = true; button.textContent = "Creating & submitting…"; try { const data = Object.fromEntries(new FormData(customBillForm)); const values = customBillValues(customBillForm); const file = await generateCustomBillFile(customBillForm); await submitVendorBill({ ...data, taxableAmount: values.subtotal, description: values.items.map((item) => item.description).join(", ") }, file); state.customBillOpen = false; await load(); setNotice("Custom bill created and submitted for approval."); } catch (error) { setNotice(error.message || "The custom bill could not be submitted.", "error"); } });
  const invoiceForm = document.querySelector("#vendorInvoiceForm");
  const updateTotal = () => {
    if (!invoiceForm) return;
    const amount = Number(invoiceForm.elements.taxableAmount.value || 0);
    const gst = Number(invoiceForm.elements.gstRate.value || 0);
    document.querySelector("#invoiceTotal").textContent = money(amount + (amount * gst / 100));
  };
  invoiceForm?.elements.taxableAmount?.addEventListener("input", updateTotal);
  invoiceForm?.elements.gstRate?.addEventListener("change", updateTotal);
  invoiceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.billFile.files?.[0];
    if (!file) return setNotice("Choose a bill file to upload.", "error");
    if (file.size > 10 * 1024 * 1024) return setNotice("Bill file must be 10 MB or smaller.", "error");
    const button = document.querySelector("#invoiceSubmit");
    button.disabled = true; button.textContent = "Uploading securely…";
    try {
      const data = Object.fromEntries(new FormData(form));
      await submitVendorBill(data, file);
      await load();
      setNotice("Invoice submitted for approval.");
    } catch (error) {
      setNotice(error.message || "Invoice could not be uploaded.", "error");
    }
  });
}
async function load() {
  [state.projects, state.assignments, state.deliverables, state.queries, state.invoices, state.payments] = await Promise.all([
    listMarketingProjects(), listMarketingAssignments(), listMarketingDeliverables(), listMarketingQueries(),
    listMarketingVendorInvoices(), listMarketingVendorPayments()
  ]);
  if (state.activeQueryId) state.messages = await listMarketingMessages(state.activeQueryId);
  render();
}
async function init() {
  state.identity = await getMarketingIdentity();
  if (!state.identity || state.identity.kind !== "vendor") { location.replace(ROUTES.LOGIN); return; }
  await enforceMarketingPortalDisclaimer("vendor");
  await load();
  state.channel = subscribeToMarketingQueries(() => load().catch(() => {}));
}
init().catch((error) => {
  console.error("[MARKETING_VENDOR_PORTAL_LOAD_FAILED]", error);
  document.querySelector("#app").innerHTML = `<main class="cp-loading"><div class="mkt-brand">VARADA NEXUS</div><h1>Vendor workspace unavailable</h1><p>${esc(marketingSetupMessage(error))}</p><a class="btn" href="${ROUTES.LOGIN}">Return to sign in</a></main>`;
});
