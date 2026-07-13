import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { createMarketingVendor, deleteMarketingVendor, listMarketingVendors, updateMarketingVendor } from "./marketing-api.js";
import { showToast } from "./utils.js";

const state = { vendors: [], editing: null };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const maskedPan = (value) => value ? `••••••${String(value).slice(-4)}` : "PAN not added";

function render() {
  const vendor = state.editing || {};
  renderModuleContent(`<section class="card"><div style="display:flex;justify-content:space-between;gap:1rem;align-items:start;flex-wrap:wrap"><div><h3>Vendors</h3><p class="muted">Maintain delivery partners here. Create their login credentials only from Portal Access.</p></div><a class="btn" href="${ROUTES.PORTAL_ACCESS}?tab=create&division=digital-services">Create Portal User</a></div></section>
  <div class="mkt-grid mkt-two" style="margin-top:1rem"><section class="mkt-panel"><h3>${state.editing ? "Edit vendor" : "Add vendor"}</h3><form id="vendorForm" class="mkt-form">
    <label>Vendor type<select name="vendorType" required><option value="firm" ${vendor.vendor_type !== "freelancer" ? "selected" : ""}>Firm / agency</option><option value="freelancer" ${vendor.vendor_type === "freelancer" ? "selected" : ""}>Freelancer</option></select></label><label>Legal name<input name="legalName" value="${esc(vendor.legal_name || "")}" required placeholder="Registered firm or freelancer name"></label>
    <label>Contact name<input name="contactName" value="${esc(vendor.contact_name || "")}" required></label>
    <label>Email<input name="email" type="email" value="${esc(vendor.email || "")}"></label><label>Phone<input name="phone" value="${esc(vendor.phone || "")}"></label>
    <label>PAN<input name="pan" value="${esc(vendor.pan || "")}" maxlength="10" pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" placeholder="ABCDE1234F" style="text-transform:uppercase"></label>
    <label>GSTIN <span class="mkt-muted">(optional)</span><input name="gstin" value="${esc(vendor.gstin || "")}" maxlength="15" pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][A-Za-z0-9][Zz][A-Za-z0-9]" placeholder="27ABCDE1234F1Z5" style="text-transform:uppercase"></label>
    <label class="wide">Legal / registered address<textarea name="legalAddress" rows="2" placeholder="Address used for contracts and tax records">${esc(vendor.legal_address || "")}</textarea></label>
    <label>City<input name="city" value="${esc(vendor.city || "")}"></label><label>State<input name="state" value="${esc(vendor.state || "")}"></label>
    <label>Postal code<input name="postalCode" value="${esc(vendor.postal_code || "")}" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit PIN code"></label>
    <label class="wide">Client-facing identity<input name="internalAlias" value="${esc(vendor.internal_alias || "Varada Nexus Delivery Team")}" required></label>
    <label class="wide">Specialties<input name="specialties" value="${esc((vendor.specialties || []).join(", "))}" placeholder="SEO, paid media, design, content"></label>
    <div class="wide" style="display:flex;gap:.55rem"><button class="btn" type="submit">${state.editing ? "Save changes" : "Add vendor"}</button>${state.editing ? '<button class="btn btn-ghost" id="vendorCancel" type="button">Cancel</button>' : ""}</div></form></section>
    <section class="mkt-panel"><h3>Vendor roster — internal only</h3><div class="mkt-list">${state.vendors.map((v) => `<div class="mkt-list-item"><div style="display:flex;justify-content:space-between;gap:.6rem"><strong>${esc(v.legal_name)}</strong><span><span class="mkt-badge">${v.vendor_type === "freelancer" ? "Freelancer" : "Firm / agency"}</span> <span class="mkt-badge">${esc(v.status)}</span></span></div><span class="mkt-muted">Client sees: ${esc(v.internal_alias)}</span><br><small>${esc(v.contact_name)} · ${esc(v.email || v.phone || "—")}</small><br><small>GSTIN: ${esc(v.gstin || "Not registered")} · PAN: ${esc(maskedPan(v.pan))}</small><br><small>${esc([v.city, v.state, v.postal_code].filter(Boolean).join(" · ") || "Address not added")}</small><br><small>${esc((v.specialties || []).join(" · ") || "No specialties set")}</small><div style="display:flex;gap:.45rem;margin-top:.65rem"><button class="btn btn-ghost vendor-edit" data-id="${esc(v.id)}" type="button">Edit</button><button class="btn btn-ghost vendor-delete" data-id="${esc(v.id)}" type="button">Delete</button></div></div>`).join("") || '<div class="mkt-empty">No vendors yet.</div>'}</div></section></div>`);
  document.querySelector("#vendorForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (state.editing) await updateMarketingVendor(state.editing.id, data);
      else await createMarketingVendor(data);
      showToast(state.editing ? "Vendor updated." : "Vendor added.", "success");
      state.editing = null; state.vendors = await listMarketingVendors(); render();
    }
    catch (error) { showToast(error?.message || "Could not add vendor.", "error"); button.disabled = false; }
  });
  document.querySelector("#vendorCancel")?.addEventListener("click", () => { state.editing = null; render(); });
  document.querySelectorAll(".vendor-edit").forEach((button) => button.addEventListener("click", () => {
    state.editing = state.vendors.find((row) => row.id === button.dataset.id) || null;
    render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll(".vendor-delete").forEach((button) => button.addEventListener("click", async () => {
    const vendor = state.vendors.find((row) => row.id === button.dataset.id);
    if (!vendor || !confirm(`Delete vendor "${vendor.legal_name}"? Vendors linked to project assignments cannot be deleted.`)) return;
    button.disabled = true;
    try { await deleteMarketingVendor(vendor.id); showToast("Vendor deleted.", "success"); if (state.editing?.id === vendor.id) state.editing = null; state.vendors = await listMarketingVendors(); render(); }
    catch (error) { showToast(error?.message || "Vendor could not be deleted.", "error"); button.disabled = false; }
  }));
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_CLIENTS, pageTitle: "Vendors", pageDescription: "White-label delivery partner master", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  state.vendors = await listMarketingVendors();
  render();
}

init().catch((error) => { console.error("[DIGITAL_SERVICES_VENDORS_LOAD_FAILED]", error); showToast(error?.message || "Vendor page failed to load.", "error"); });
