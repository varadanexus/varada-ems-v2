import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasAnyRolePermission } from "./permissions.js";
import { PERMISSIONS } from "../config/roles.js";
import { logAuditEvent } from "./audit.js";
import { showToast } from "./utils.js";

const db = getSupabaseClient();
const state = { boot: null, divisionId: null, clients: [], editingId: null };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const label = (value) => String(value || "—").replaceAll("_", " ");
const can = (action) => hasAnyRolePermission(state.boot?.roleCodes || [], MODULES.HOSPITAL_PROJECTS, action, { allowedModules: state.boot?.allowedModules || [] });
const selected = (actual, expected) => String(actual ?? "") === expected ? "selected" : "";
const checked = (value) => value ? "checked" : "";
const value = (record, key) => esc(record?.[key] ?? "");

function kpi(title, number, note) {
  return `<article class="hp-kpi"><span>${esc(title)}</span><strong>${esc(number)}</strong><small>${esc(note)}</small></article>`;
}

function input(record, name, title, options = {}) {
  const type = options.type || "text";
  const required = options.required ? "required" : "";
  const attrs = options.attrs || "";
  const placeholder = options.placeholder ? `placeholder="${esc(options.placeholder)}"` : "";
  return `<label>${esc(title)}${options.required ? " *" : ""}<input name="${name}" type="${type}" value="${value(record, name)}" ${required} ${placeholder} ${attrs}></label>`;
}

function textarea(record, name, title, className = "") {
  return `<label class="${className}">${esc(title)}<textarea name="${name}" rows="3">${value(record, name)}</textarea></label>`;
}

function select(record, name, title, choices) {
  return `<label>${esc(title)}<select name="${name}">${choices.map(([key, text]) => `<option value="${key}" ${selected(record?.[name], key)}>${esc(text)}</option>`).join("")}</select></label>`;
}

function masterForm() {
  if (!can(state.editingId ? PERMISSIONS.EDIT : PERMISSIONS.CREATE)) return "";
  const record = state.clients.find((row) => row.id === state.editingId) || {
    client_type: "hospital", legal_entity_type: "private_limited", registered_country: "India", billing_country: "India",
    tax_treatment: "registered", payment_terms_days: 30, credit_limit: 0, invoice_delivery_method: "email",
    currency_code: "INR", portal_preferred_channel: "email", status: "active"
  };
  return `<section class="hp-card hp-client-master" id="clientMasterCard">
    <div class="hp-actions hp-section-heading">
      <div><span class="hp-eyebrow">AUTHORITATIVE CLIENT MASTER</span><h3>${state.editingId ? "Edit hospital / client" : "Create hospital / client"}</h3><p class="muted">Used for project delivery, centralized billing and Portal Access onboarding.</p></div>
      ${state.editingId ? '<button class="btn btn-ghost" id="cancelClientEdit" type="button">Cancel edit</button>' : ""}
    </div>
    <form id="clientMasterForm" class="hp-master-form">
      <details class="hp-master-section" open><summary>1. Client and legal identity</summary><div class="hp-form">
        ${input(record, "client_code", "Client code", { required: true, placeholder: "HCL-001", attrs: 'maxlength="40"' })}
        ${input(record, "hospital_name", "Hospital / client display name", { required: true })}
        ${input(record, "legal_name", "Legal billing name", { required: true })}
        ${input(record, "trade_name", "Trade name")}
        ${select(record, "client_type", "Client type", [["hospital", "Hospital"], ["hospital_group", "Hospital group"], ["company", "Company"], ["individual", "Individual"], ["trust_society", "Trust / Society"], ["government", "Government"], ["other", "Other"]])}
        ${select(record, "legal_entity_type", "Legal entity type", [["private_limited", "Private Limited Company"], ["public_limited", "Public Limited Company"], ["llp", "LLP"], ["partnership", "Partnership"], ["proprietorship", "Proprietorship"], ["trust", "Trust"], ["society", "Society"], ["government", "Government"], ["individual", "Individual"], ["other", "Other"]])}
        ${input(record, "cin_llpin", "CIN / LLPIN", { attrs: 'maxlength="30"' })}
        ${input(record, "business_registration_no", "Business registration number")}
        ${input(record, "hospital_registration_no", "Hospital / clinical registration number")}
        ${input(record, "website", "Website", { type: "url", placeholder: "https://" })}
        ${select(record, "status", "Record status", [["lead", "Lead"], ["active", "Active"], ["on_hold", "On hold"], ["closed", "Closed"]])}
      </div></details>

      <details class="hp-master-section" open><summary>2. Tax and billing identity</summary><div class="hp-form">
        ${input(record, "gstin", "GSTIN", { attrs: 'maxlength="15"' })}
        ${input(record, "pan", "PAN", { attrs: 'maxlength="10"' })}
        ${select(record, "tax_treatment", "Tax treatment", [["registered", "GST registered"], ["unregistered", "Unregistered"], ["composition", "Composition"], ["sez", "SEZ"], ["government", "Government"], ["export", "Export"]])}
        ${input(record, "gst_state_code", "GST state code", { attrs: 'maxlength="2"' })}
        ${input(record, "place_of_supply", "Place of supply")}
        ${input(record, "billing_name", "Invoice addressee / billing name")}
        ${input(record, "billing_contact_name", "Billing contact name")}
        ${input(record, "billing_contact_designation", "Billing contact designation")}
        ${input(record, "billing_email", "Billing email", { type: "email" })}
        ${input(record, "billing_phone", "Billing phone", { type: "tel" })}
        ${input(record, "payment_terms_days", "Payment terms (days)", { type: "number", attrs: 'min="0" max="365"' })}
        ${input(record, "credit_limit", "Credit limit", { type: "number", attrs: 'min="0" step="0.01"' })}
        ${select(record, "invoice_delivery_method", "Invoice delivery", [["email", "Email"], ["portal", "Portal"], ["email_and_portal", "Email and portal"], ["physical", "Physical copy"]])}
        ${select(record, "currency_code", "Billing currency", [["INR", "INR"]])}
        <label class="hp-check"><input name="purchase_order_required" type="checkbox" ${checked(record.purchase_order_required)}><span>Purchase order required before billing</span></label>
        <label class="hp-check"><input name="tds_applicable" type="checkbox" ${checked(record.tds_applicable)}><span>TDS applicable</span></label>
      </div></details>

      <details class="hp-master-section" open><summary>3. Primary contact</summary><div class="hp-form">
        ${input(record, "contact_name", "Primary contact name", { required: true })}
        ${input(record, "contact_designation", "Designation")}
        ${input(record, "email", "Primary email", { type: "email", required: true })}
        ${input(record, "phone", "Primary mobile", { type: "tel", required: true })}
        ${input(record, "whatsapp_phone", "WhatsApp number", { type: "tel" })}
        <div class="hp-inline-action"><button class="btn btn-sm" id="copyPrimaryToPortal" type="button">Use as portal contact</button></div>
      </div></details>

      <details class="hp-master-section" open><summary>4. Authorized representative</summary><p class="muted">Required for private/public companies and any organization acting through an authorized person.</p><div class="hp-form">
        ${input(record, "authorized_representative_name", "Representative name")}
        ${input(record, "authorized_representative_designation", "Designation")}
        ${input(record, "authorized_representative_email", "Email", { type: "email" })}
        ${input(record, "authorized_representative_phone", "Mobile", { type: "tel" })}
        ${input(record, "authorized_representative_whatsapp", "WhatsApp", { type: "tel" })}
        ${select(record, "authority_basis", "Authority basis", [["", "Select"], ["director", "Director / Key managerial person"], ["board_resolution", "Board resolution"], ["power_of_attorney", "Power of attorney"], ["authorization_letter", "Authorization letter"], ["partner_trustee", "Partner / Trustee"], ["other", "Other"]])}
        ${input(record, "authorization_reference", "Authorization document reference")}
        <label class="hp-check"><input name="authorized_signatory" type="checkbox" ${checked(record.authorized_signatory)}><span>Authorized to sign contracts and billing documents</span></label>
        <div class="hp-inline-action"><button class="btn btn-sm" id="copyRepresentativeToPortal" type="button">Use as portal contact</button></div>
      </div></details>

      <details class="hp-master-section" open><summary>5. Addresses</summary><div class="hp-form">
        ${textarea(record, "registered_address", "Registered address", "span2")}
        ${input(record, "registered_city", "Registered city")}
        ${input(record, "registered_state", "Registered state")}
        ${input(record, "registered_postal_code", "Registered PIN code")}
        ${input(record, "registered_country", "Registered country")}
        <div class="wide hp-inline-action"><button class="btn btn-sm" id="copyRegisteredToBilling" type="button">Copy registered address to billing</button></div>
        ${textarea(record, "billing_address", "Billing address", "span2")}
        ${input(record, "billing_city", "Billing city")}
        ${input(record, "billing_state", "Billing state")}
        ${input(record, "billing_postal_code", "Billing PIN code")}
        ${input(record, "billing_country", "Billing country")}
        ${textarea(record, "site_address", "Primary hospital / project site address", "wide")}
      </div></details>

      <details class="hp-master-section" open><summary>6. Portal onboarding contact</summary><p class="muted">Saving this record does not create credentials. Portal accounts are created only through the centralized Portal Access service.</p><div class="hp-form">
        <label class="hp-check"><input name="portal_access_required" type="checkbox" ${checked(record.portal_access_required)}><span>Portal access required</span></label>
        ${input(record, "portal_contact_name", "Portal contact name")}
        ${input(record, "portal_email", "Portal credential email", { type: "email" })}
        ${input(record, "portal_phone", "Registered portal mobile", { type: "tel" })}
        ${select(record, "portal_preferred_channel", "Preferred credential channel", [["email", "Email"], ["whatsapp", "WhatsApp"], ["both", "Email and WhatsApp"]])}
        ${textarea(record, "internal_notes", "Internal notes", "wide")}
      </div></details>

      <div class="hp-actions hp-form-submit"><button class="btn" type="submit">${state.editingId ? "Update client master" : "Create client master"}</button>${state.editingId ? `<a class="btn btn-ghost" href="${ROUTES.HOSPITAL_PORTAL_ACCESS}">Open Portal Access</a>` : ""}</div>
    </form>
  </section>`;
}

function clientRegister() {
  const rows = state.clients.map((row) => {
    const billingReady = row.legal_name && row.billing_email && row.billing_address && (row.gstin || row.tax_treatment === "unregistered");
    const portalReady = row.portal_contact_name && row.portal_email && row.portal_phone;
    return `<tr><td><strong>${esc(row.hospital_name)}</strong><br><small>${esc(row.client_code)} · ${esc(label(row.legal_entity_type))}</small></td><td>${esc(row.legal_name || "—")}<br><small>${esc(row.gstin || row.pan || "Tax identity pending")}</small></td><td>${esc(row.contact_name || "—")}<br><small>${esc(row.email || row.phone || "")}</small></td><td><span class="meta-pill">${billingReady ? "Ready" : "Incomplete"}</span></td><td><span class="meta-pill">${row.auth_user_id ? "Linked" : portalReady ? "Ready to create" : "Incomplete"}</span></td><td>${esc(label(row.status))}</td><td><div class="hp-actions">${can(PERMISSIONS.EDIT) ? `<button class="btn btn-sm" data-edit-client="${row.id}" type="button">Edit</button>` : ""}${portalReady ? `<a class="btn btn-sm" href="${ROUTES.HOSPITAL_PORTAL_ACCESS}">Portal user</a>` : ""}</div></td></tr>`;
  }).join("");
  return `<section class="hp-card"><div class="hp-actions hp-section-heading"><div><h3>Hospital / client register</h3><p class="muted">Billing and portal readiness are calculated from the saved master details.</p></div>${can(PERMISSIONS.CREATE) ? '<button class="btn" id="newClientMaster" type="button">New client</button>' : ""}</div><div class="table-container"><table><thead><tr><th>Hospital / client</th><th>Legal and tax</th><th>Primary contact</th><th>Billing</th><th>Portal</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="hp-empty">No Hospital clients yet</td></tr>'}</tbody></table></div></section>`;
}

function render() {
  const active = state.clients.filter((row) => row.status === "active").length;
  const billingReady = state.clients.filter((row) => row.legal_name && row.billing_email && row.billing_address && (row.gstin || row.tax_treatment === "unregistered")).length;
  const portalReady = state.clients.filter((row) => row.portal_contact_name && row.portal_email && row.portal_phone).length;
  renderModuleContent(`<div class="hp-kpis">${kpi("Total clients", state.clients.length, "Client masters")}${kpi("Active", active, "Available for projects")}${kpi("Billing ready", billingReady, "Legal, tax and billing data")}${kpi("Portal ready", portalReady, "Contact ready for provisioning")}</div>${masterForm()}${clientRegister()}`);
  bind();
}

function formPayload(form) {
  const payload = Object.fromEntries([...new FormData(form)].map(([key, val]) => [key, typeof val === "string" && !val.trim() ? null : val]));
  ["purchase_order_required", "tds_applicable", "authorized_signatory", "portal_access_required"].forEach((key) => { payload[key] = form.elements[key]?.checked || false; });
  payload.client_code = String(payload.client_code || "").trim().toUpperCase();
  payload.gstin = payload.gstin ? String(payload.gstin).trim().toUpperCase() : null;
  payload.pan = payload.pan ? String(payload.pan).trim().toUpperCase() : null;
  payload.cin_llpin = payload.cin_llpin ? String(payload.cin_llpin).trim().toUpperCase() : null;
  payload.payment_terms_days = Number(payload.payment_terms_days || 0);
  payload.credit_limit = Number(payload.credit_limit || 0);
  payload.division_id = state.divisionId;
  return payload;
}

function copyFields(form, pairs) {
  pairs.forEach(([source, target]) => { if (form.elements[source] && form.elements[target]) form.elements[target].value = form.elements[source].value; });
}

function bind() {
  const form = document.getElementById("clientMasterForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = formPayload(form);
      if (payload.gstin && !/^\d{2}[A-Z0-9]{13}$/.test(payload.gstin)) throw new Error("Enter a valid 15-character GSTIN.");
      if (payload.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(payload.pan)) throw new Error("Enter a valid PAN.");
      if (["private_limited", "public_limited"].includes(payload.legal_entity_type)
        && (!payload.authorized_representative_name || !payload.authorized_representative_designation
          || !payload.authorized_representative_email || !payload.authorized_representative_phone
          || !payload.authority_basis)) {
        throw new Error("Authorized representative name, designation, email, mobile and authority basis are required for limited companies.");
      }
      if (payload.portal_access_required && (!payload.portal_contact_name || !payload.portal_email || !payload.portal_phone)) throw new Error("Portal contact name, email and mobile are required when portal access is requested.");
      const before = state.clients.find((row) => row.id === state.editingId) || null;
      const request = state.editingId ? db.from("hospital_clients").update(payload).eq("id", state.editingId) : db.from("hospital_clients").insert(payload);
      const { data, error } = await request.select("*").single();
      if (error) throw error;
      await logAuditEvent(state.editingId ? "hospital_client_updated" : "hospital_client_created", { moduleCode: MODULES.HOSPITAL_PROJECTS, entityType: "hospital_clients", entityId: data.id, beforeData: before, afterData: data });
      showToast(state.editingId ? "Client master updated." : "Client master created.", TOAST_TYPES.SUCCESS);
      state.editingId = null;
      await loadClients();
      render();
    } catch (error) { showToast(error.message || "Client master could not be saved", TOAST_TYPES.ERROR); }
  });
  document.getElementById("copyPrimaryToPortal")?.addEventListener("click", () => {
    copyFields(form, [["contact_name", "portal_contact_name"], ["email", "portal_email"], ["phone", "portal_phone"]]);
    form.elements.portal_access_required.checked = true;
  });
  document.getElementById("copyRepresentativeToPortal")?.addEventListener("click", () => {
    copyFields(form, [["authorized_representative_name", "portal_contact_name"], ["authorized_representative_email", "portal_email"], ["authorized_representative_phone", "portal_phone"]]);
    form.elements.portal_access_required.checked = true;
  });
  document.getElementById("copyRegisteredToBilling")?.addEventListener("click", () => copyFields(form, [["registered_address", "billing_address"], ["registered_city", "billing_city"], ["registered_state", "billing_state"], ["registered_postal_code", "billing_postal_code"], ["registered_country", "billing_country"]]));
  document.getElementById("cancelClientEdit")?.addEventListener("click", () => { state.editingId = null; render(); });
  document.getElementById("newClientMaster")?.addEventListener("click", () => { state.editingId = null; render(); document.getElementById("clientMasterCard")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  document.querySelectorAll("[data-edit-client]").forEach((button) => button.addEventListener("click", () => { state.editingId = button.dataset.editClient; render(); document.getElementById("clientMasterCard")?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
}

async function loadClients() {
  const { data, error } = await db.from("hospital_clients").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  state.clients = data || [];
}

async function init() {
  state.boot = await bootstrapProtectedPage({ moduleCode: MODULES.HOSPITAL_PROJECTS, pageTitle: "Hospitals / Clients", pageDescription: "Authoritative legal, billing and portal-onboarding client master", workspace: WORKSPACES.HOSPITAL_PROJECTS });
  if (!state.boot) return;
  try {
    const { data: division, error } = await db.from("divisions").select("id").eq("code", "HOSPITAL_PROJECTS").maybeSingle();
    if (error) throw error;
    if (!division?.id) throw new Error("Hospital Projects division is not configured.");
    state.divisionId = division.id;
    await loadClients();
    render();
  } catch (error) { console.error("[HOSPITAL_CLIENT_MASTER_FAILED]", error); showToast(error.message || "Hospital clients failed to load", TOAST_TYPES.ERROR); }
}

init();
