import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { ensureHospitalProjectDriveFolders, uploadHospitalProjectDocumentToDrive } from "./drive-api.js";
import { logAuditEvent } from "./audit.js";
import { showToast } from "./utils.js";
import { listEmailHistory } from "./email-api.js";
import { listWhatsAppHistory } from "./whatsapp-api.js";

const db = getSupabaseClient();
const projectId = new URLSearchParams(location.search).get("project_id") || "";
const SERVICE_SCOPES = {
  hospital_construction: "Hospital Construction", hospital_consultancy: "Hospital Consultancy",
  licensing_regulatory: "Licensing & Regulatory", medical_equipment_procurement: "Medical Equipment Procurement",
  interior_design: "Interior Design", hospital_renovation: "Hospital Renovation",
  medical_gas_pipeline: "Medical Gas Pipeline", modular_ot: "Modular OT", cssd: "CSSD",
  icu_setup: "ICU Setup", laboratory_setup: "Laboratory Setup", radiology_setup: "Radiology Setup",
  nabh_accreditation: "NABH Accreditation", pmc: "PMC", turnkey_project: "Turnkey Project"
};
const PAGE_META = {
  overview: ["Project Overview", "Project scope, delivery status and commercial summary"],
  planning: ["Planning & Design", "Planning, design and consultancy work packages"],
  construction: ["Construction", "Civil, MEP, interiors and site execution scopes"],
  procurement: ["Procurement", "Project procurement requirements and vendor sourcing"],
  "medical-equipment": ["Medical Equipment", "Medical equipment sourcing, delivery, installation and commissioning"],
  licensing: ["Licensing & Compliance", "Regulatory approvals, accreditation and statutory compliance"],
  contractors: ["Contractors", "Project-specific contractor and specialist vendor assignments"],
  documents: ["Documents", "Google Drive project archive and document upload"],
  "client-payments": ["Client Payments", "Invoices, receipts and outstanding client balances"],
  "vendor-payments": ["Vendor Payments", "Project vendor bill creation and payment-status register"],
  communications: ["Communications", "Project query history with Email and WhatsApp service access"],
  reports: ["Project Reports", "Delivery, billing, cost and margin reporting"],
  settings: ["Project Settings", "Project status, dates, progress and service scope configuration"]
};
const ROUTE_BY_VIEW = {
  overview: ROUTES.HOSPITAL_PROJECT_OVERVIEW, planning: ROUTES.HOSPITAL_PROJECT_PLANNING,
  construction: ROUTES.HOSPITAL_PROJECT_CONSTRUCTION, procurement: ROUTES.HOSPITAL_PROJECT_PROCUREMENT,
  "medical-equipment": ROUTES.HOSPITAL_PROJECT_MEDICAL_EQUIPMENT, licensing: ROUTES.HOSPITAL_PROJECT_LICENSING,
  contractors: ROUTES.HOSPITAL_PROJECT_CONTRACTORS, documents: ROUTES.HOSPITAL_PROJECT_DOCUMENTS,
  "client-payments": ROUTES.HOSPITAL_PROJECT_CLIENT_PAYMENTS, "vendor-payments": ROUTES.HOSPITAL_PROJECT_VENDOR_PAYMENTS,
  communications: ROUTES.HOSPITAL_PROJECT_COMMUNICATIONS, reports: ROUTES.HOSPITAL_PROJECT_REPORTS,
  settings: ROUTES.HOSPITAL_PROJECT_SETTINGS
};
const state = { view: "overview", boot: null, project: null, scopes: [], packages: [], items: [], licenses: [], vendors: [], assignments: [], invoices: [], credits: [], vendorBills: [], queries: [], messages: [], documents: [], emails: [], whatsapp: [] };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const label = (value) => String(value || "—").replaceAll("_", " ");
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const route = (view) => `${ROUTE_BY_VIEW[view]}?project_id=${encodeURIComponent(projectId)}`;
const can = (action) => hasAnyRolePermission(state.boot?.roleCodes || [], MODULES.HOSPITAL_PROJECTS, action, { allowedModules: state.boot?.allowedModules || [] });
const hasScope = (...codes) => state.scopes.includes("turnkey_project") || codes.some((code) => state.scopes.includes(code));

function workspaceItems() {
  const items = [{ view: "overview", label: "Overview", show: true }];
  items.push({ view: "planning", label: "Planning & Design", show: hasScope("hospital_construction", "hospital_consultancy", "interior_design", "hospital_renovation", "medical_gas_pipeline", "modular_ot", "cssd", "icu_setup", "laboratory_setup", "radiology_setup", "pmc") });
  items.push({ view: "construction", label: "Construction", show: hasScope("hospital_construction", "interior_design", "hospital_renovation", "medical_gas_pipeline", "modular_ot", "pmc") });
  items.push({ view: "procurement", label: "Procurement", show: hasScope("medical_equipment_procurement", "modular_ot", "cssd", "icu_setup", "laboratory_setup", "radiology_setup") });
  items.push({ view: "medical-equipment", label: "Medical Equipment", show: hasScope("medical_equipment_procurement", "modular_ot", "cssd", "icu_setup", "laboratory_setup", "radiology_setup") });
  items.push({ view: "licensing", label: "Licensing & Compliance", show: hasScope("licensing_regulatory", "nabh_accreditation") });
  items.push({ view: "contractors", label: "Contractors", show: hasScope("hospital_construction", "interior_design", "hospital_renovation", "medical_gas_pipeline", "modular_ot", "pmc") });
  items.push({ view: "documents", label: "Documents", show: true }, { view: "client-payments", label: "Client Payments", show: true });
  items.push({ view: "vendor-payments", label: "Vendor Payments", show: true });
  items.push({ view: "communications", label: "Communications", show: true }, { view: "reports", label: "Reports", show: true });
  return items.filter((item) => item.show);
}

function sidebarContext(project) {
  return {
    title: project.title,
    subtitle: project.project_code,
    backHref: ROUTES.HOSPITAL_PROJECTS,
    backLabel: "← Hospital Projects",
    sections: [
      { title: "Project Workspace", items: workspaceItems().map((item) => ({ module: MODULES.HOSPITAL_PROJECTS, label: item.label, href: route(item.view) })) },
      { title: "Administration", items: [{ module: MODULES.HOSPITAL_PROJECTS, label: "Project Settings", href: route("settings") }] }
    ]
  };
}

async function query(table, select = "*") {
  const { data, error } = await db.from(table).select(select);
  if (error) throw error;
  return data || [];
}

async function prefetchProject() {
  if (!projectId) return null;
  const { data, error } = await db.from("hospital_projects")
    .select("*,hospital_clients(id,hospital_name,client_code,email,phone),hospital_project_service_scopes(scope_code)")
    .eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  state.project = data;
  state.scopes = (data.hospital_project_service_scopes || []).map((row) => row.scope_code);
  return data;
}

async function loadView() {
  const id = projectId;
  if (state.view === "overview") {
    [state.packages, state.items, state.licenses, state.invoices, state.queries] = await Promise.all([
      query("hospital_work_packages").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_procurement_items").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_license_requirements").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_invoice_register").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_queries").then((rows) => rows.filter((x) => x.project_id === id))
    ]);
  } else if (["planning", "construction"].includes(state.view)) {
    state.packages = (await query("hospital_work_packages")).filter((x) => x.project_id === id);
  } else if (["procurement", "medical-equipment"].includes(state.view)) {
    state.items = (await query("hospital_procurement_items", "*,hospital_vendors(id,legal_name,vendor_code)")).filter((x) => x.project_id === id);
  } else if (state.view === "licensing") {
    state.licenses = (await query("hospital_license_requirements", "*,hospital_vendors!hospital_license_requirements_responsible_vendor_id_fkey(id,legal_name,vendor_code)")).filter((x) => x.project_id === id);
  } else if (state.view === "contractors") {
    [state.vendors, state.assignments, state.packages] = await Promise.all([
      query("hospital_vendors"), query("hospital_project_vendors", "*,hospital_vendors(id,legal_name,vendor_code)").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_work_packages", "*,hospital_vendors(id,legal_name,vendor_code)").then((rows) => rows.filter((x) => x.project_id === id))
    ]);
  } else if (state.view === "documents") {
    state.documents = (await query("drive_documents")).filter((x) => x.category === "HOSPITAL_PROJECT" && x.entity_id === id && !x.deleted_at);
  } else if (state.view === "client-payments") {
    [state.invoices, state.credits] = await Promise.all([
      query("hospital_invoice_register").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_credit_notes", "*,hospital_invoices(invoice_number)").then((rows) => rows.filter((x) => x.project_id === id))
    ]);
  } else if (state.view === "vendor-payments") {
    [state.vendors, state.assignments, state.vendorBills] = await Promise.all([
      query("hospital_vendors"),
      query("hospital_project_vendors", "*,hospital_vendors(id,legal_name,vendor_code)").then((rows) => rows.filter((x) => x.project_id === id && x.status !== "cancelled")),
      query("hospital_vendor_bill_register").then((rows) => rows.filter((x) => x.project_id === id))
    ]);
  } else if (state.view === "communications") {
    const [queries, emailHistory, whatsappHistory] = await Promise.all([query("hospital_queries"), listEmailHistory().catch(() => ({ outbox: [] })), listWhatsAppHistory().catch(() => ({ messages: [], logs: [] }))]);
    state.queries = queries.filter((x) => x.project_id === id);
    const queryIds = new Set(state.queries.map((x) => x.id));
    state.messages = (await query("hospital_query_messages")).filter((x) => queryIds.has(x.query_id));
    state.emails = (emailHistory.outbox || []).filter((x) => x.source_module === "hospital-projects" && x.source_event === state.project.project_code);
    state.whatsapp = [...(whatsappHistory.messages || []), ...(whatsappHistory.logs || [])].filter((x) => x.source_module === "hospital-projects" && x.source_event === state.project.project_code);
  } else if (state.view === "reports") {
    [state.packages, state.items, state.licenses, state.invoices] = await Promise.all([
      query("hospital_work_packages").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_procurement_items").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_license_requirements").then((rows) => rows.filter((x) => x.project_id === id)),
      query("hospital_invoice_register").then((rows) => rows.filter((x) => x.project_id === id))
    ]);
  }
}

function table(headers, rows, empty = "No records yet") {
  return `<div class="table-container"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="hp-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
}
function kpi(title, value, note) { return `<article class="hp-kpi"><span>${esc(title)}</span><strong>${value}</strong><small>${esc(note)}</small></article>`; }
function projectHeader() { return `<section class="hp-hero"><div><span class="hp-eyebrow">${esc(state.project.project_code)}</span><h2>${esc(state.project.title)}</h2><p>${esc(state.project.hospital_clients?.hospital_name || "Hospital project")} · ${esc(state.project.location || "Location pending")}</p></div><span class="meta-pill">${esc(label(state.project.status))}</span></section>`; }

function overview() {
  const billed = state.invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const outstanding = state.invoices.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
  const margin = [...state.packages, ...state.items, ...state.licenses].reduce((sum, row) => sum + Number(row.margin_amount || 0), 0);
  const links = workspaceItems().filter((x) => x.view !== "overview").map((x) => `<a class="hp-workspace-link" href="${route(x.view)}"><strong>${esc(x.label)}</strong><small>Open dedicated project page</small></a>`).join("");
  return `${projectHeader()}<div class="hp-kpis">${kpi("Progress", `${Number(state.project.progress_percent || 0)}%`, date(state.project.target_date))}${kpi("Client billing", money(billed), `${money(outstanding)} outstanding`)}${kpi("Planned margin", money(margin), "Internal only")}${kpi("Open queries", state.queries.filter((x) => !["resolved", "closed"].includes(x.status)).length, `${state.queries.length} total`)}</div><section class="hp-card"><h3>Service scopes</h3><div class="hp-actions">${state.scopes.map((x) => `<span class="meta-pill">${esc(SERVICE_SCOPES[x] || label(x))}</span>`).join("")}</div></section><section class="hp-card"><h3>Project workspace</h3><div class="hp-workspace-links">${links}</div></section>`;
}

function packagesPage(kind) {
  const allowed = kind === "planning" ? ["planning_design"] : ["civil_construction", "mep", "healthcare_interiors", "commissioning"];
  const rows = state.packages.filter((x) => allowed.includes(x.service_type));
  return `${projectHeader()}<section class="hp-card"><div class="hp-actions"><div><h3>${esc(PAGE_META[kind][0])}</h3><p class="muted">Work packages remain in the shared Hospital commercial register.</p></div><a class="btn" href="${ROUTES.HOSPITAL_WORK_PACKAGES}?project_id=${encodeURIComponent(projectId)}">Manage work packages</a></div>${table(["Package", "Service", "Delivery", "Client price", "Margin", "Status"], rows.map((x) => `<tr><td><strong>${esc(x.title)}</strong><br><small>${esc(x.package_code)}</small></td><td>${esc(label(x.service_type))}</td><td>${esc(label(x.delivery_model))}</td><td>${money(x.client_price)}</td><td>${money(x.margin_amount)}</td><td>${esc(label(x.status))}</td></tr>`).join(""), `No ${kind} work packages`)}</section>`;
}
function equipmentPage(title) { return `${projectHeader()}<section class="hp-card"><div class="hp-actions"><div><h3>${esc(title)}</h3><p class="muted">Uses the shared equipment procurement and vendor-margin register.</p></div><a class="btn" href="${ROUTES.HOSPITAL_EQUIPMENT}?project_id=${encodeURIComponent(projectId)}">Manage equipment</a></div>${table(["Equipment", "Vendor", "Quantity", "Landed cost", "Hospital price", "Margin", "Status"], state.items.map((x) => `<tr><td><strong>${esc(x.equipment_name)}</strong><br><small>${esc(x.make_model || "")}</small></td><td>${esc(x.hospital_vendors?.legal_name || "Unassigned")}</td><td>${Number(x.quantity) || 0}</td><td>${money(x.total_vendor_cost)}</td><td>${money(x.total_client_price)}</td><td>${money(x.margin_amount)}</td><td>${esc(label(x.status))}</td></tr>`).join(""), "No equipment requirements")}</section>`; }
function licensingPage() { return `${projectHeader()}<section class="hp-card"><div class="hp-actions"><div><h3>Licensing & Compliance</h3><p class="muted">Regulatory approvals use the shared Hospital licence register.</p></div><a class="btn" href="${ROUTES.HOSPITAL_LICENSES}?project_id=${encodeURIComponent(projectId)}">Manage licences</a></div>${table(["Requirement", "Authority", "Consultant", "Target", "Client price", "Status"], state.licenses.map((x) => `<tr><td><strong>${esc(x.license_name)}</strong></td><td>${esc(x.authority_name)}</td><td>${esc(x.hospital_vendors?.legal_name || "Internal")}</td><td>${date(x.target_date)}</td><td>${money(x.client_price)}</td><td>${esc(label(x.status))}</td></tr>`).join(""), "No licence requirements")}</section>`; }

function contractorsPage() {
  const vendorOptions = state.vendors.map((x) => `<option value="${x.id}">${esc(x.vendor_code)} · ${esc(x.legal_name)}</option>`).join("");
  return `${projectHeader()}${can(PERMISSIONS.CREATE) ? `<section class="hp-card"><h3>Assign contractor or specialist vendor</h3><form id="contractorForm" class="hp-form"><label>Vendor<select name="vendor_id" required><option value="">Select</option>${vendorOptions}</select></label><label>Package name<input name="package_name" required></label><label>Awarded value<input name="awarded_value" type="number" min="0" step=".01"></label><label class="wide">Scope summary<textarea name="scope_summary"></textarea></label><button class="btn">Assign vendor</button></form></section>` : ""}<section class="hp-card"><h3>Project contractors</h3>${table(["Vendor", "Package", "Scope", "Awarded value", "Status"], state.assignments.map((x) => `<tr><td><strong>${esc(x.hospital_vendors?.legal_name || "—")}</strong><br><small>${esc(x.hospital_vendors?.vendor_code || "")}</small></td><td>${esc(x.package_name)}</td><td>${esc(x.scope_summary || "—")}</td><td>${money(x.awarded_value)}</td><td>${esc(label(x.status))}</td></tr>`).join(""), "No contractors assigned")}</section>`;
}

function documentsPage() {
  return `${projectHeader()}<section class="hp-card"><h3>Google Drive project archive</h3><p class="muted">Files use the existing EMS Google Drive service and are stored in this project's folder hierarchy.</p><div class="hp-actions"><span class="meta-pill">Folder: ${esc(label(state.project.drive_folder_status))}</span>${state.project.drive_folder_path ? `<span class="meta-pill">${esc(state.project.drive_folder_path)}</span>` : ""}<button class="btn" id="ensureDriveFolders" type="button">Prepare folders</button></div>${can(PERMISSIONS.CREATE) ? `<form id="documentForm" class="hp-form" style="margin-top:1rem"><label>Document type<select name="document_type"><option>Documents</option><option>Planning & Design</option><option>Construction</option><option>Procurement</option><option>Medical Equipment</option><option>Licensing & Compliance</option><option>Contractors</option><option>Commercial</option></select></label><label class="span2">Files<input name="files" type="file" multiple required></label><button class="btn">Upload to Google Drive</button></form>` : ""}</section><section class="hp-card"><h3>Project documents</h3>${table(["File", "Type", "Uploaded", "Status", "Open"], state.documents.map((x) => `<tr><td><strong>${esc(x.file_name)}</strong></td><td>${esc(x.document_type || "Documents")}</td><td>${date(x.created_at)}</td><td>${esc(label(x.upload_status))}</td><td>${x.web_view_link ? `<a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(x.web_view_link)}">Open</a>` : "—"}</td></tr>`).join(""), "No documents uploaded")}</section>`;
}

function clientPaymentsPage() {
  const today = new Date().toISOString().slice(0, 10);
  return `${projectHeader()}${can(PERMISSIONS.CREATE) ? `<section class="hp-card"><h3>Create client bill</h3><p class="muted">Bills are created only inside this Level 2 project. The invoice number is generated from the centralized Hospital billing sequence.</p><form id="projectInvoiceForm" class="hp-form"><label>Invoice type<select name="invoice_type"><option value="advance">Advance</option><option value="progress" selected>Progress</option><option value="retention">Retention</option><option value="final">Final</option><option value="other">Other</option></select></label><label>Issue date<input name="issue_date" type="date" value="${today}" required></label><label>Due date<input name="due_date" type="date"></label><label>Taxable amount<input name="taxable_amount" type="number" min="0" step=".01" required></label><label>GST rate %<input name="tax_rate" type="number" min="0" max="100" step=".001" value="18" required></label><label class="wide">Description<textarea name="description" required></textarea></label><button class="btn">Generate client bill</button></form></section>` : ""}<section class="hp-card"><h3>Project client bills and payment status</h3><p class="muted">This register shows only bills generated for this project and the payments credited against them.</p>${table(["Invoice", "Issue / due", "Total", "Paid", "Credited", "Balance", "Status"], state.invoices.map((x) => `<tr><td><strong>${esc(x.invoice_number)}</strong></td><td>${date(x.issue_date)}<br><small>${date(x.due_date)}</small></td><td>${money(x.total_amount)}</td><td>${money(x.paid_amount)}</td><td>${money(x.credited_amount)}</td><td>${money(x.balance_amount)}</td><td>${esc(label(x.status))}</td></tr>`).join(""), "No client bills generated")}</section>`;
}
function vendorPaymentsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const assignedVendorIds = new Set(state.assignments.map((x) => x.vendor_id));
  const vendorOptions = state.vendors.filter((x) => assignedVendorIds.has(x.id)).map((x) => `<option value="${x.id}">${esc(x.vendor_code)} · ${esc(x.legal_name)}</option>`).join("");
  return `${projectHeader()}${can(PERMISSIONS.CREATE) ? `<section class="hp-card"><h3>Create vendor bill</h3><p class="muted">Enter the vendor's bill against this Level 2 project. A centralized Hospital vendor-bill number is generated automatically.</p><form id="projectVendorBillForm" class="hp-form"><label>Assigned vendor<select name="vendor_id" required><option value="">Select vendor</option>${vendorOptions}</select></label><label>Vendor invoice number<input name="vendor_invoice_number" placeholder="Vendor's reference"></label><label>Bill date<input name="bill_date" type="date" value="${today}" required></label><label>Due date<input name="due_date" type="date"></label><label>Taxable amount<input name="taxable_amount" type="number" min="0" step=".01" required></label><label>GST rate %<input name="tax_rate" type="number" min="0" max="100" step=".001" value="18" required></label><label class="wide">Description<textarea name="description" required></textarea></label><button class="btn" ${vendorOptions ? "" : "disabled"}>Generate vendor bill</button></form>${vendorOptions ? "" : `<p class="muted">Assign a vendor to this project before creating a bill.</p>`}</section>` : ""}<section class="hp-card"><h3>Project vendor bills and payment status</h3><p class="muted">This register contains only vendor bills generated inside this project and payments applied to them.</p>${table(["Bill", "Vendor reference", "Vendor", "Bill / due", "Total", "Paid", "Balance", "Status"], state.vendorBills.map((x) => `<tr><td><strong>${esc(x.bill_number)}</strong></td><td>${esc(x.vendor_invoice_number || "—")}</td><td>${esc(x.vendor_name)}</td><td>${date(x.bill_date)}<br><small>${date(x.due_date)}</small></td><td>${money(x.total_amount)}</td><td>${money(x.paid_amount)}</td><td>${money(x.balance_amount)}</td><td>${esc(label(x.status))}</td></tr>`).join(""), "No vendor bills generated")}</section>`;
}
function communicationsPage() { const serviceHistory=[...state.emails.map(x=>({channel:"Email",recipient:x.to_email,subject:x.subject,status:x.status,at:x.created_at})),...state.whatsapp.map(x=>({channel:"WhatsApp",recipient:x.phone,subject:x.message||x.message_text||x.template_alias,status:x.status,at:x.created_at}))];return `${projectHeader()}<section class="hp-card"><h3>Communication services</h3><p>Email, WhatsApp and Query Desk remain centralized EMS services.</p><div class="hp-workspace-links"><a class="hp-workspace-link" href="${ROUTES.EMAIL_COMPOSE}?to=${encodeURIComponent(state.project.hospital_clients?.email || "")}&subject=${encodeURIComponent(`${state.project.project_code} - ${state.project.title}`)}&source_module=hospital-projects&source_event=${encodeURIComponent(state.project.project_code)}"><strong>Compose Email</strong><small>Open the EMS Email service</small></a><a class="hp-workspace-link" href="${ROUTES.WHATSAPP_COMMAND_CENTER}?project_id=${encodeURIComponent(projectId)}"><strong>WhatsApp</strong><small>Open the EMS WhatsApp service</small></a><a class="hp-workspace-link" href="${ROUTES.HOSPITAL_QUERIES}?project_id=${encodeURIComponent(projectId)}"><strong>Query Desk</strong><small>Open project queries</small></a></div></section><section class="hp-card"><h3>Query history</h3>${table(["Query", "Audience", "Status", "Messages", "Last activity"], state.queries.map((x) => `<tr><td><strong>${esc(x.subject)}</strong><br><small>${esc(x.query_number)}</small></td><td>${esc(label(x.audience))}</td><td>${esc(label(x.status))}</td><td>${state.messages.filter((m) => m.query_id === x.id).length}</td><td>${date(x.last_message_at)}</td></tr>`).join(""), "No project queries")}</section><section class="hp-card"><h3>Email and WhatsApp history</h3>${table(["Channel","Recipient","Message / subject","Status","Sent"],serviceHistory.map(x=>`<tr><td>${esc(x.channel)}</td><td>${esc(x.recipient||"—")}</td><td>${esc(x.subject||"—")}</td><td>${esc(label(x.status))}</td><td>${date(x.at)}</td></tr>`).join(""),"No tagged Email or WhatsApp history")}</section>`; }
function reportsPage() { const packageMargin=state.packages.reduce((a,x)=>a+Number(x.margin_amount||0),0),equipmentMargin=state.items.reduce((a,x)=>a+Number(x.margin_amount||0),0),licenseMargin=state.licenses.reduce((a,x)=>a+Number(x.margin_amount||0),0),billed=state.invoices.reduce((a,x)=>a+Number(x.total_amount||0),0),outstanding=state.invoices.reduce((a,x)=>a+Number(x.balance_amount||0),0);return `${projectHeader()}<div class="hp-kpis">${kpi("Contract value",money(state.project.contract_value),"Project master")}${kpi("Billed",money(billed),`${money(outstanding)} outstanding`)}${kpi("Planned margin",money(packageMargin+equipmentMargin+licenseMargin),"Internal commercial view")}${kpi("Progress",`${Number(state.project.progress_percent||0)}%`,date(state.project.target_date))}</div><section class="hp-card"><h3>Margin by service</h3>${table(["Service area","Planned margin"],[['Work packages',packageMargin],['Equipment procurement',equipmentMargin],['Licensing & compliance',licenseMargin]].map(([name,value])=>`<tr><td>${name}</td><td>${money(value)}</td></tr>`).join(""))}<div class="hp-actions" style="margin-top:1rem"><a class="btn" href="${ROUTES.CENTRAL_ACCOUNTS_REPORTING}?source_module=hospital-projects&project_id=${encodeURIComponent(projectId)}">Open Central Accounts reporting</a></div></section>`; }
function settingsPage() { const scopeOptions=Object.entries(SERVICE_SCOPES).map(([code,name])=>`<label class="hp-scope-option"><input type="checkbox" name="scope_codes" value="${code}" ${state.scopes.includes(code)?"checked":""}><span>${esc(name)}</span></label>`).join("");return `${projectHeader()}<section class="hp-card"><h3>Project Settings</h3>${can(PERMISSIONS.EDIT)?`<form id="settingsForm" class="hp-form"><label>Status<select name="status">${["planning","design","procurement","execution","commissioning","completed","on_hold","cancelled"].map(x=>`<option value="${x}" ${state.project.status===x?"selected":""}>${label(x)}</option>`).join("")}</select></label><label>Priority<select name="priority">${["low","normal","high","critical"].map(x=>`<option value="${x}" ${state.project.priority===x?"selected":""}>${x}</option>`).join("")}</select></label><label>Progress %<input name="progress_percent" type="number" min="0" max="100" step=".01" value="${Number(state.project.progress_percent||0)}"></label><label>Start date<input name="start_date" type="date" value="${state.project.start_date||""}"></label><label>Target date<input name="target_date" type="date" value="${state.project.target_date||""}"></label><label class="wide">Scope summary<textarea name="scope_summary">${esc(state.project.scope_summary||"")}</textarea></label><fieldset class="wide"><legend>Service scopes</legend><div class="hp-scope-options">${scopeOptions}</div></fieldset><button class="btn">Save project settings</button></form>`:"<p>You have read-only access to this project.</p>"}</section>`; }

function body() { if(state.view==="overview")return overview();if(state.view==="planning")return packagesPage("planning");if(state.view==="construction")return packagesPage("construction");if(state.view==="procurement")return equipmentPage("Procurement");if(state.view==="medical-equipment")return equipmentPage("Medical Equipment");if(state.view==="licensing")return licensingPage();if(state.view==="contractors")return contractorsPage();if(state.view==="documents")return documentsPage();if(state.view==="client-payments")return clientPaymentsPage();if(state.view==="vendor-payments")return vendorPaymentsPage();if(state.view==="communications")return communicationsPage();if(state.view==="reports")return reportsPage();return settingsPage(); }

function values(form) { return Object.fromEntries([...new FormData(form)].map(([key,value]) => [key, typeof value === "string" && !value.trim() ? null : value])); }
function readBase64(file) { return new Promise((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||"").split(",").pop()||"");reader.onerror=()=>reject(reader.error||new Error("File read failed"));reader.readAsDataURL(file); }); }

function bind() {
  document.getElementById("projectInvoiceForm")?.addEventListener("submit", async (event) => { event.preventDefault();try{const payload=values(event.currentTarget);const {data,error}=await db.rpc("hospital_create_invoice",{p_project_id:projectId,p_invoice_type:payload.invoice_type,p_issue_date:payload.issue_date,p_due_date:payload.due_date,p_description:payload.description,p_taxable_amount:Number(payload.taxable_amount||0),p_tax_rate:Number(payload.tax_rate||0)});if(error)throw error;await logAuditEvent("hospital_client_bill_created",{moduleCode:MODULES.HOSPITAL_PROJECTS,entityType:"hospital_invoices",entityId:data?.id,afterData:{project_id:projectId,invoice_number:data?.invoice_number}});showToast(`Client bill ${data?.invoice_number||""} generated.`,TOAST_TYPES.SUCCESS);await loadView();render();}catch(error){showToast(error.message,TOAST_TYPES.ERROR);} });
  document.getElementById("projectVendorBillForm")?.addEventListener("submit", async (event) => { event.preventDefault();try{const payload=values(event.currentTarget);const {data,error}=await db.rpc("hospital_create_vendor_bill",{p_project_id:projectId,p_vendor_id:payload.vendor_id,p_vendor_invoice_number:payload.vendor_invoice_number,p_bill_date:payload.bill_date,p_due_date:payload.due_date,p_description:payload.description,p_taxable_amount:Number(payload.taxable_amount||0),p_tax_rate:Number(payload.tax_rate||0)});if(error)throw error;await logAuditEvent("hospital_vendor_bill_created",{moduleCode:MODULES.HOSPITAL_PROJECTS,entityType:"hospital_vendor_bills",entityId:data?.id,afterData:{project_id:projectId,bill_number:data?.bill_number}});showToast(`Vendor bill ${data?.bill_number||""} generated.`,TOAST_TYPES.SUCCESS);await loadView();render();}catch(error){showToast(error.message,TOAST_TYPES.ERROR);} });
  document.getElementById("contractorForm")?.addEventListener("submit", async (event) => { event.preventDefault(); try { const payload=values(event.currentTarget);payload.project_id=projectId;payload.awarded_value=Number(payload.awarded_value||0);const {error}=await db.from("hospital_project_vendors").insert(payload);if(error)throw error;await logAuditEvent("hospital_contractor_assigned",{moduleCode:MODULES.HOSPITAL_PROJECTS,entityType:"hospital_projects",entityId:projectId,afterData:payload});showToast("Contractor assigned.",TOAST_TYPES.SUCCESS);await loadView();render(); } catch(error) { showToast(error.message,TOAST_TYPES.ERROR); } });
  document.getElementById("ensureDriveFolders")?.addEventListener("click", async () => { try { const result=await ensureHospitalProjectDriveFolders(projectId);state.project.drive_folder_status="ready";state.project.drive_folder_path=result.folderPath;showToast("Google Drive project folders are ready.",TOAST_TYPES.SUCCESS);render(); } catch(error) { showToast(error.message,TOAST_TYPES.ERROR); } });
  document.getElementById("documentForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const form=event.currentTarget,files=[...form.elements.files.files];if(!files.length)return;try{for(const file of files){await uploadHospitalProjectDocumentToDrive({projectId,documentType:form.elements.document_type.value,fileName:file.name,mimeType:file.type||"application/octet-stream"},await readBase64(file));}showToast(`${files.length} document(s) uploaded to Google Drive.`,TOAST_TYPES.SUCCESS);await loadView();render();}catch(error){showToast(error.message,TOAST_TYPES.ERROR);} });
  document.getElementById("settingsForm")?.addEventListener("submit", async (event) => { event.preventDefault();try{const form=event.currentTarget,payload=values(form),scopeCodes=[...form.querySelectorAll('input[name="scope_codes"]:checked')].map(x=>x.value);if(!scopeCodes.length)throw new Error("Select at least one service scope.");delete payload.scope_codes;payload.progress_percent=Number(payload.progress_percent||0);const {error}=await db.from("hospital_projects").update(payload).eq("id",projectId);if(error)throw error;const {error:scopeError}=await db.rpc("hospital_set_project_scopes",{p_project_id:projectId,p_scope_codes:scopeCodes});if(scopeError)throw scopeError;await logAuditEvent("hospital_project_settings_updated",{moduleCode:MODULES.HOSPITAL_PROJECTS,entityType:"hospital_projects",entityId:projectId,afterData:{...payload,scope_codes:scopeCodes}});showToast("Project settings updated.",TOAST_TYPES.SUCCESS);location.reload();}catch(error){showToast(error.message,TOAST_TYPES.ERROR);} });
}
function render() { renderModuleContent(body()); bind(); }

export async function initHospitalProjectWorkspace(view) {
  state.view = Object.hasOwn(PAGE_META, view) ? view : "overview";
  let project = null;
  try { project = await prefetchProject(); } catch (error) { console.warn("[HOSPITAL_PROJECT_PREFETCH_FAILED]", error); }
  const meta = PAGE_META[state.view];
  state.boot = await bootstrapProtectedPage({ moduleCode: MODULES.HOSPITAL_PROJECTS, pageTitle: project ? `${project.title} · ${meta[0]}` : meta[0], pageDescription: meta[1], workspace: WORKSPACES.HOSPITAL_PROJECTS, sidebarContext: project ? sidebarContext(project) : null });
  if (!state.boot) return;
  if (!projectId || !project) { renderModuleContent(`<section class="hp-card"><h3>Project unavailable</h3><p>Select a Hospital project from the project register.</p><a class="btn" href="${ROUTES.HOSPITAL_PROJECTS}">Back to Hospital Projects</a></section>`); return; }
  try { await loadView(); render(); } catch (error) { console.error("[HOSPITAL_PROJECT_WORKSPACE_FAILED]", error); showToast(error.message || "Project workspace failed to load", TOAST_TYPES.ERROR); }
}
