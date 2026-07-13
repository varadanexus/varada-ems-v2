import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { deactivateCompanyGstRegistration, getCompanyTaxProfile, listCompanyGstRegistrations, saveCompanyGstRegistration, saveCompanyTaxProfile } from "./admin-api.js";
import { getCurrentAppUser } from "./auth.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const MODULE = MODULES.CENTRAL_ACCOUNTS_TAX_SETTINGS;
let profile = {};
let registrations = [];
let canEdit = false;

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULE,
    pageTitle: "Tax & Company Settings",
    pageDescription: "Company identity, statutory registrations and filing preferences",
    workspace: WORKSPACES.ACCOUNTS
  });
  if (!boot) return;
  const permissionSet = new Set((boot.permissions || []).map((p) => `${p.module_code}:${p.action_code}`));
  canEdit = boot.roleCodes?.some((role) => role === "super_admin" || role === "admin") || permissionSet.has(`${MODULE}:edit`);
  await load();
}

async function load() {
  [profile, registrations] = await Promise.all([getCompanyTaxProfile(), listCompanyGstRegistrations()]);
  render();
  bind();
}

function render() {
  renderModuleContent(`
    <style>
      .tax-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem 1rem}
      .tax-grid label{display:grid;gap:.35rem;font-size:.82rem;font-weight:600}
      .tax-grid .full{grid-column:1/-1}.tax-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem}
      .tax-table input,.tax-table select{min-width:130px;width:100%}
      @media(max-width:760px){.tax-grid{grid-template-columns:1fr}.tax-grid .full{grid-column:auto}}
    </style>
    <section class="card">
      <h3>Company Profile</h3>
      <p class="muted">These values are configuration only. Filing workflows will use them later; they are not submitted externally by this page.</p>
      <form id="companyTaxForm" class="tax-grid" style="margin-top:1rem;">
        ${field("Legal Name", "legal_name", profile.legal_name, true)}
        ${field("Trade Name", "trade_name", profile.trade_name)}
        ${selectField("Entity Type", "entity_type", profile.entity_type, ["Private Limited Company","Public Limited Company","LLP","Partnership","Proprietorship","Trust","Society","Other"])}
        ${field("PAN", "pan", profile.pan, false, "AAAAA9999A")}
        ${field("TAN", "tan", profile.tan, false, "AAAA99999A")}
        ${field("CIN / LLPIN", "cin", profile.cin)}
        ${field("Registered Address", "registered_address", profile.registered_address, false, "", "full")}
        ${field("City", "city", profile.city)}
        ${field("State Code", "state_code", profile.state_code, false, "36")}
        ${field("PIN Code", "pincode", profile.pincode)}
        ${selectField("Financial Year Starts", "financial_year_start_month", String(profile.financial_year_start_month || 4), [["4","April"],["1","January"]])}
        ${selectField("Income-tax Filing Type", "income_tax_filing_type", profile.income_tax_filing_type, ["Company","Firm / LLP","Individual / Proprietor","Trust / Institution","Other"])}
        ${field("Auditor / CA Name", "auditor_name", profile.auditor_name)}
        ${field("CA Membership Number", "auditor_membership_no", profile.auditor_membership_no)}
        ${field("Notes", "notes", profile.notes, false, "", "full")}
        ${canEdit ? `<div class="tax-actions full"><button class="btn" type="submit">Save Company Profile</button></div>` : ""}
      </form>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h3>GST Registrations</h3>
      <p class="muted">Add one row for every state registration. One active registration may be marked primary.</p>
      <div class="table-shell" style="margin-top:1rem;"><table class="tax-table">
        <thead><tr><th>GSTIN</th><th>Registration Name</th><th>State Code</th><th>State</th><th>Type</th><th>Frequency</th><th>Primary</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${registrations.map(registrationRow).join("")}
          ${canEdit ? registrationRow({ id: "new", is_active: true, registration_type: "regular", filing_frequency: "monthly" }) : ""}
        </tbody>
      </table></div>
    </section>
  `);
}

function field(label, key, value = "", required = false, placeholder = "", className = "") {
  return `<label class="${className}">${label}${required ? " *" : ""}<input data-profile="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? "required" : ""} ${canEdit ? "" : "disabled"} /></label>`;
}

function selectField(label, key, value = "", options = []) {
  const normalized = options.map((item) => Array.isArray(item) ? item : [item, item]);
  return `<label>${label}<select data-profile="${key}" ${canEdit ? "" : "disabled"}><option value="">Select...</option>${normalized.map(([v, l]) => `<option value="${esc(v)}" ${String(value || "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}

function registrationRow(row) {
  const id = row.id || "new";
  const disabled = canEdit ? "" : "disabled";
  return `<tr data-gst-row="${id}">
    <td><input data-gst="gstin" value="${esc(row.gstin)}" placeholder="22AAAAA0000A1Z5" ${disabled}></td>
    <td><input data-gst="registration_name" value="${esc(row.registration_name)}" ${disabled}></td>
    <td><input data-gst="state_code" value="${esc(row.state_code)}" maxlength="2" ${disabled}></td>
    <td><input data-gst="state_name" value="${esc(row.state_name)}" ${disabled}></td>
    <td><select data-gst="registration_type" ${disabled}>${opts(["regular","composition","casual","sez","isd","other"], row.registration_type)}</select></td>
    <td><select data-gst="filing_frequency" ${disabled}>${opts(["monthly","qrmp","quarterly","annual_only"], row.filing_frequency)}</select></td>
    <td><input data-gst="is_primary" type="checkbox" ${row.is_primary ? "checked" : ""} ${disabled}></td>
    <td>${row.is_active === false ? "Inactive" : "Active"}</td>
    <td>${canEdit ? `<button class="btn btn-sm" data-save-gst="${id}">${id === "new" ? "Add" : "Save"}</button> ${id === "new" || row.is_active === false ? "" : `<button class="btn btn-danger btn-sm" data-disable-gst="${id}">Deactivate</button>`}` : "View only"}</td>
  </tr>`;
}

function bind() {
  qs("#companyTaxForm")?.addEventListener("submit", saveProfile);
  document.querySelectorAll("[data-save-gst]").forEach((button) => button.addEventListener("click", () => saveRegistration(button.dataset.saveGst)));
  document.querySelectorAll("[data-disable-gst]").forEach((button) => button.addEventListener("click", () => disableRegistration(button.dataset.disableGst)));
}

async function saveProfile(event) {
  event.preventDefault();
  if (!canEdit) return;
  const payload = {};
  document.querySelectorAll("[data-profile]").forEach((input) => { payload[input.dataset.profile] = input.value?.trim() || null; });
  payload.financial_year_start_month = Number(payload.financial_year_start_month || 4);
  payload.pan = String(payload.pan || "").toUpperCase() || null;
  payload.tan = String(payload.tan || "").toUpperCase() || null;
  if (payload.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(payload.pan)) return showToast("PAN format is invalid", TOAST_TYPES.ERROR);
  const user = await getCurrentAppUser();
  payload.updated_by = user?.id || null;
  profile = await saveCompanyTaxProfile(payload);
  await logAuditEvent("company_tax_profile_update", { moduleCode: MODULE, entityType: "company_tax_profiles", entityId: "PRIMARY", afterData: profile, action: "update" });
  showToast("Company profile saved", TOAST_TYPES.SUCCESS);
}

async function saveRegistration(id) {
  const row = document.querySelector(`[data-gst-row="${id}"]`);
  if (!row || !canEdit) return;
  const payload = id === "new" ? {} : { id };
  row.querySelectorAll("[data-gst]").forEach((input) => { payload[input.dataset.gst] = input.type === "checkbox" ? input.checked : input.value?.trim(); });
  payload.gstin = String(payload.gstin || "").toUpperCase();
  payload.is_active = true;
  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(payload.gstin)) return showToast("Enter a valid 15-character GSTIN", TOAST_TYPES.ERROR);
  if (!payload.registration_name || !payload.state_code || !payload.state_name) return showToast("Registration name and state are required", TOAST_TYPES.ERROR);
  const saved = await saveCompanyGstRegistration(payload);
  await logAuditEvent("company_gst_registration_save", { moduleCode: MODULE, entityType: "company_gst_registrations", entityId: saved.id, afterData: saved, action: id === "new" ? "create" : "update" });
  showToast("GST registration saved", TOAST_TYPES.SUCCESS);
  await load();
}

async function disableRegistration(id) {
  if (!canEdit || !window.confirm("Deactivate this GST registration?")) return;
  await deactivateCompanyGstRegistration(id);
  await logAuditEvent("company_gst_registration_deactivate", { moduleCode: MODULE, entityType: "company_gst_registrations", entityId: id, action: "update" });
  showToast("GST registration deactivated", TOAST_TYPES.SUCCESS);
  await load();
}

function opts(values, selected) {
  return values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value.replaceAll("_", " ").toUpperCase()}</option>`).join("");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

init().catch((error) => {
  console.error(error);
  showToast(error?.message || "Failed to load tax settings", TOAST_TYPES.ERROR);
});
