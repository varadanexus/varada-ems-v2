import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getPayablesDefaults, listCoaAccounts, listServiceTypes, savePayablesDefaults, setServiceTypeActive } from "./digital-services-api.js";
import { showToast } from "./utils.js";

const state = { services: [], accounts: [], defaults: null };
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function acctOpt(sel) { return `<option value="">— none —</option>` + state.accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? "selected" : ""}>${esc(a.code)} · ${esc(a.name)}</option>`).join(""); }

function render() {
  const d = state.defaults || {};
  renderModuleContent(`
    <style>.ds-field{display:grid;gap:.28rem;margin-bottom:.55rem}.ds-field label{font-weight:700;font-size:.76rem}.ds-field select{width:100%;padding:.56rem .68rem}</style>
    <section class="card"><h3>Digital Marketing & Services Settings</h3><p class="muted">Service lines and Central Accounts payables mapping.</p></section>
    <section class="card" style="margin-top:1rem">
      <h3>Service Lines</h3>
      <div class="table-shell"><table>
        <thead><tr><th>Service</th><th>Code</th><th>Active</th></tr></thead>
        <tbody>${state.services.map((s) => `<tr>
          <td>${esc(s.label)}</td><td><span class="muted">${esc(s.code)}</span></td>
          <td><label class="notification-checkbox"><input type="checkbox" class="ds-svc" data-code="${esc(s.code)}" ${s.is_active ? "checked" : ""} /> <span>${s.is_active ? "Active" : "Hidden"}</span></label></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>

    <section class="card" style="margin-top:1rem">
      <h3>Payables Defaults (Vendor Costs → Central Accounts)</h3>
      <p class="muted">Accounts used when sending a vendor cost to Payables. The purchase bill is created as <em>submitted</em> for you to post from the Payables screen.</p>
      <form id="dsPayForm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;align-items:end">
        <div class="ds-field"><label>Expense Account *</label><select name="expense">${acctOpt(d.expense_account_id)}</select></div>
        <div class="ds-field"><label>Input GST / ITC Account</label><select name="itc">${acctOpt(d.input_tax_account_id)}</select></div>
        <div class="ds-field"><label>Payable (Creditors) Account *</label><select name="payable">${acctOpt(d.payable_account_id)}</select></div>
        <div style="grid-column:1/-1"><button class="btn" type="submit">Save Payables Defaults</button></div>
      </form>
    </section>
  `);
  document.querySelectorAll(".ds-svc").forEach((cb) => cb.addEventListener("change", async () => {
    try { await setServiceTypeActive(cb.getAttribute("data-code"), cb.checked); showToast("Service line updated.", TOAST_TYPES.SUCCESS); }
    catch (err) { showToast(err?.message || "Update failed.", TOAST_TYPES.ERROR); cb.checked = !cb.checked; }
  }));
  document.querySelector("#dsPayForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.expense.value || !f.payable.value) return showToast("Expense and Payable accounts are required.", TOAST_TYPES.ERROR);
    try {
      await savePayablesDefaults({ expenseAccountId: f.expense.value, inputTaxAccountId: f.itc.value, payableAccountId: f.payable.value });
      showToast("Payables defaults saved.", TOAST_TYPES.SUCCESS);
    } catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_SETTINGS, pageTitle: "Settings", pageDescription: "Digital Marketing & Services configuration", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  [state.services, state.accounts, state.defaults] = await Promise.all([
    listServiceTypes().catch(() => []), listCoaAccounts().catch(() => []), getPayablesDefaults().catch(() => null)
  ]);
  render();
}
init();
