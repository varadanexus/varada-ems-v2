import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import { uploadInteriorsDocumentToDrive } from "./drive-api.js";
import { notifyInteriorsWhatsApp, notifyInteriorsWhatsAppSafely } from "./interiors-whatsapp-api.js";

const client = getSupabaseClient();

const PAGE_STATE = { boot: null, projects: [], bills: [], lines: [], clients: [], documents: [], selectedProjectId: "", isSavingHeader: false, uploadingBillId: "" };

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.INTERIORS_BILLING, pageTitle: "Billing", pageDescription: "Prepare business billing workflow without any posting, GST, or accounting integration.", workspace: WORKSPACES.INTERIORS });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  PAGE_STATE.selectedProjectId = new URLSearchParams(window.location.search).get("project_id") || "";
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [projectsRes, billsRes, linesRes, clientsRes, documentsRes] = await Promise.all([
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_client_id, status, material_source_type, interior_clients(client_name)").order("project_name"),
    client.from("interior_billing_headers").select("*").order("created_at", { ascending: false }),
    client.from("interior_billing_lines").select("*").order("created_at", { ascending: false }),
    client.from("interior_clients").select("id, client_name").order("client_name"),
    client.from("drive_documents").select("id,category,entity_id,file_name,file_size,web_view_link,upload_status,created_at").eq("category", "INTERIORS_BILL").is("deleted_at", null).order("created_at", { ascending: false })
  ]);
  if (projectsRes.error) throw projectsRes.error;
  if (billsRes.error) throw billsRes.error;
  if (linesRes.error) throw linesRes.error;
  if (clientsRes.error) throw clientsRes.error;
  if (documentsRes.error) throw documentsRes.error;
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id);
  PAGE_STATE.bills = billsRes.data || [];
  PAGE_STATE.lines = linesRes.data || [];
  PAGE_STATE.clients = clientsRes.data || [];
  PAGE_STATE.documents = documentsRes.data || [];
}

function resolveProjectByAnyId(projectId) {
  return PAGE_STATE.projects.find((row) => String(row.id) === String(projectId) || String(row.shared_project_id) === String(projectId)) || null;
}

function render() {
  const draftBills = PAGE_STATE.bills.filter((row) => row.status === "draft").length;
  const submittedBills = PAGE_STATE.bills.filter((row) => row.status === "submitted").length;
  const approvedBills = PAGE_STATE.bills.filter((row) => row.status === "approved").length;
  const readyForAccounts = PAGE_STATE.bills.filter((row) => row.status === "ready_for_accounts").length;

  renderModuleContent(`
    <section class="card">
      <style>.bl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.bl-grid .full{grid-column:1/-1}.bl-grid label{display:block;font-weight:600;margin-bottom:.35rem}.bl-grid input,.bl-grid select,.bl-grid textarea{width:100%}.bill-upload{border:1px dashed rgba(213,176,92,.48);border-radius:14px;padding:1rem;background:linear-gradient(135deg,rgba(213,176,92,.08),rgba(255,255,255,.015))}.bill-upload input[type=file]{padding:.72rem;background:rgba(0,0,0,.22)}.bill-upload small{display:block;margin-top:.45rem;color:var(--muted)}.bill-file-links{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.4rem}@media (max-width:980px){.bl-grid{grid-template-columns:1fr}}</style>
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
        <div><label for="billProjectId">Project *</label><select id="billProjectId"><option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.id}" ${String(PAGE_STATE.selectedProjectId) === String(row.id) ? "selected" : ""}>${escapeHtml(row.project_code || "")} - ${escapeHtml(row.project_title || row.project_name || "")}</option>`).join("")}</select></div>
        <div><label for="billType">Bill Type *</label><select id="billType">${renderOptions(["advance", "progress", "change", "final"], "advance")}</select></div>
        <div><label for="billDate">Bill Date *</label><input id="billDate" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div><label for="billStatus">Status *</label><select id="billStatus">${renderOptions(["draft", "submitted", "approved", "rejected", "ready_for_accounts"], "draft")}</select></div>
        <div><label for="billTaxAmount">Tax Amount</label><input id="billTaxAmount" type="number" min="0" step="0.01" value="0" /></div>
        <div class="full"><label for="billRemarks">Remarks</label><textarea id="billRemarks" rows="2"></textarea></div>
        <div class="full"><label for="billLineDescription">Line Description *</label><input id="billLineDescription" type="text" /></div>
        <div><label for="billLineQuantity">Quantity *</label><input id="billLineQuantity" type="number" min="0" step="0.001" value="1" /></div>
        <div><label for="billLineRate">Rate *</label><input id="billLineRate" type="number" min="0" step="0.01" value="0" /></div>
        <div><label for="billLineSourceType">Source Type</label><select id="billLineSourceType">${renderOptions(["quote", "change", "manual"], "manual")}</select></div>
        <div class="full bill-upload"><label for="billFiles">Bill Documents *</label><input id="billFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip" /><small>Select one or more bill files. Each file can be up to 10 MB and will be archived under Bills / Client / Date / Project / Bill Number.</small></div>
      </div>
      <div style="margin-top:1rem;"><button class="btn" id="createBillBtn" type="button">Create Bill</button></div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h4>Billing Workflow</h4>
      <div class="table-container"><table><thead><tr><th>Bill Number</th><th>Project</th><th>Client</th><th>Bill Type</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>
        ${PAGE_STATE.bills.length ? PAGE_STATE.bills.map((row) => `<tr><td>${escapeHtml(row.bill_number || "-")}${renderBillFiles(row.id)}</td><td>${escapeHtml(projectName(row.project_id))}</td><td>${escapeHtml(projectClientName(row.project_id))}</td><td>${escapeHtml(labelForBillType(row.bill_type))}</td><td>${escapeHtml(row.status || "draft")}</td><td>${formatMoney(row.total_amount || 0)}</td><td>${row.status === "draft" ? `<button class="btn btn-sm" data-submit-bill="${row.id}" type="button">Submit For Approval</button>` : ""} <button class="btn btn-sm" data-view-bill="${row.id}" type="button">View Bill</button> <button class="btn btn-sm" data-upload-bill="${row.id}" type="button">Add Files</button>${["approved", "ready_for_accounts"].includes(row.status) ? ` <button class="btn btn-sm" data-bill-whatsapp="client_invoice" data-bill-id="${row.id}" type="button">Send Invoice</button> <button class="btn btn-sm" data-bill-whatsapp="payment_reminder" data-bill-id="${row.id}" type="button">Payment Reminder</button> <button class="btn btn-sm" data-bill-whatsapp="payment_overdue" data-bill-id="${row.id}" type="button">Overdue Reminder</button> <button class="btn btn-sm" data-bill-whatsapp="payment_received" data-bill-id="${row.id}" type="button">Send Receipt</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:2rem;">No bills created yet.</td></tr>`}
      </tbody></table></div>
    </section>
  `);
}

function bindEvents() {
  document.getElementById("billProjectId")?.addEventListener("change", (event) => {
    PAGE_STATE.selectedProjectId = event.target.value || "";
  });
  document.getElementById("createBillBtn")?.addEventListener("click", createBill);
  document.querySelectorAll("[data-submit-bill]").forEach((btn) => btn.addEventListener("click", () => updateBillStatus(btn.dataset.submitBill, "submitted")));
  document.querySelectorAll("[data-view-bill]").forEach((btn) => btn.addEventListener("click", () => showBillDetails(btn.dataset.viewBill)));
  document.querySelectorAll("[data-upload-bill]").forEach((btn) => btn.addEventListener("click", () => chooseExistingBillFiles(btn.dataset.uploadBill)));
  document.querySelectorAll("[data-bill-whatsapp]").forEach((btn) => btn.addEventListener("click", () => sendBillWhatsApp(btn.dataset.billWhatsapp, btn.dataset.billId, btn)));
}

async function createBill() {
  if (PAGE_STATE.isSavingHeader) return;
  const selectedProject = resolveProjectByAnyId(document.getElementById("billProjectId")?.value || "");
  const projectId = selectedProject?.shared_project_id || "";
  const billType = document.getElementById("billType")?.value || "advance";
  const billDate = document.getElementById("billDate")?.value || new Date().toISOString().slice(0,10);
  const requestedStatus = document.getElementById("billStatus")?.value || "draft";
  const taxAmount = Number(document.getElementById("billTaxAmount")?.value || 0);
  const remarks = String(document.getElementById("billRemarks")?.value || "").trim() || null;
  const lineDescription = String(document.getElementById("billLineDescription")?.value || "").trim();
  const lineQuantity = Number(document.getElementById("billLineQuantity")?.value || 0);
  const lineRate = Number(document.getElementById("billLineRate")?.value || 0);
  const lineSourceType = document.getElementById("billLineSourceType")?.value || "manual";
  const files = Array.from(document.getElementById("billFiles")?.files || []);
  if (!projectId || !lineDescription || lineQuantity <= 0) return showToast("Project and at least one valid billing line are required.", TOAST_TYPES.ERROR);
  if (!files.length) return showToast("Attach at least one bill document for the Interiors Drive archive.", TOAST_TYPES.ERROR);
  const fileError = validateBillFiles(files);
  if (fileError) return showToast(fileError, TOAST_TYPES.ERROR);

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
      status: requestedStatus === "ready_for_accounts" ? "draft" : requestedStatus,
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
    const { error: recalcError } = await client.rpc("recalc_interior_billing_header_total", { p_billing_header_id: header.id });
    if (recalcError) throw recalcError;
    if (requestedStatus === "ready_for_accounts") {
      const { error: readyError } = await client
        .from("interior_billing_headers")
        .update({ status: "ready_for_accounts" })
        .eq("id", header.id);
      if (readyError) throw readyError;
    }
    const uploadResult = await uploadBillFiles({ ...header, project_id: projectId, bill_number: billNumber, bill_date: billDate }, files);
    if (["approved", "ready_for_accounts"].includes(requestedStatus)) {
      await notifyInteriorsWhatsAppSafely("client_invoice", header.id);
    }
    showToast(uploadResult.failed
      ? `Bill created. ${uploadResult.uploaded} file(s) archived; ${uploadResult.failed} failed.`
      : `Bill created and ${uploadResult.uploaded} file(s) archived.`, uploadResult.failed ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS);
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

async function sendBillWhatsApp(eventType, billId, button) {
  if (!eventType || !billId) return;
  const originalLabel = button?.textContent || "Send WhatsApp";
  if (button) { button.disabled = true; button.textContent = "Sending…"; }
  try {
    const result = await notifyInteriorsWhatsApp(eventType, billId);
    if (result?.sent) showToast("WhatsApp notification sent.", TOAST_TYPES.SUCCESS);
    else showToast(result?.reason || "WhatsApp notification was not sent.", TOAST_TYPES.WARNING);
  } catch (error) {
    showToast(error?.message || "WhatsApp notification failed.", TOAST_TYPES.ERROR);
  } finally {
    if (button) { button.disabled = false; button.textContent = originalLabel; }
  }
}

function renderBillFiles(billId) {
  const documents = PAGE_STATE.documents.filter((row) => String(row.entity_id) === String(billId) && row.upload_status === "stored");
  if (!documents.length) return `<div class="muted" style="margin-top:.35rem;">No archived files</div>`;
  return `<div class="bill-file-links">${documents.map((row) => row.web_view_link
    ? `<a class="btn btn-sm" href="${escapeHtml(row.web_view_link)}" target="_blank" rel="noopener" title="${escapeHtml(row.file_name || "Bill file")}">${escapeHtml(row.file_name || "View file")}</a>`
    : `<span class="muted">${escapeHtml(row.file_name || "Stored file")}</span>`).join("")}</div>`;
}

async function chooseExistingBillFiles(id) {
  const header = PAGE_STATE.bills.find((row) => String(row.id) === String(id));
  if (!header || PAGE_STATE.uploadingBillId) return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip";
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const fileError = validateBillFiles(files);
    if (fileError) return showToast(fileError, TOAST_TYPES.ERROR);
    PAGE_STATE.uploadingBillId = id;
    try {
      const result = await uploadBillFiles(header, files);
      showToast(result.failed ? `${result.uploaded} file(s) archived; ${result.failed} failed.` : `${result.uploaded} bill file(s) archived.`, result.failed ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS);
      await loadData();
      render();
      bindEvents();
    } finally {
      PAGE_STATE.uploadingBillId = "";
    }
  }, { once: true });
  input.click();
}

async function uploadBillFiles(header, files) {
  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    try {
      await uploadInteriorsDocumentToDrive({
        category: "INTERIORS_BILL",
        projectId: header.project_id,
        entityId: header.id,
        documentType: "Bill",
        documentNo: header.bill_number,
        date: header.bill_date,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream"
      }, await fileToBase64(file));
      uploaded += 1;
    } catch (error) {
      console.error("Interiors bill Drive upload failed", error);
      failed += 1;
    }
  }
  return { uploaded, failed };
}

function validateBillFiles(files) {
  if (files.length > 12) return "Upload a maximum of 12 bill files at a time.";
  const oversized = files.find((file) => Number(file.size || 0) > 10 * 1024 * 1024);
  return oversized ? `${oversized.name} exceeds the 10 MB per-file limit.` : "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function renderOptions(options, selected) { return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join(""); }
function labelForBillType(value) { return ({ advance: "Advance Bill", progress: "Progress Bill", change: "Change Bill", final: "Final Bill" }[value] || value); }
function projectName(sharedProjectId) { const row = PAGE_STATE.projects.find((item) => String(item.shared_project_id) === String(sharedProjectId)); return row ? `${row.project_code || ""} - ${row.project_title || row.project_name || "Project"}` : String(sharedProjectId || "-"); }
function projectClientName(sharedProjectId) { const row = resolveProjectByAnyId(sharedProjectId); return row?.interior_clients?.client_name || "-"; }
function formatMoney(value) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

init().catch((error) => { console.error(error); showToast(error?.message || "Failed to load Billing page.", TOAST_TYPES.ERROR); });
