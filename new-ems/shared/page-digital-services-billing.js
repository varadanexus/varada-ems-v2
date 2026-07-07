import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getSession } from "./auth.js";
import {
  createCreditNote, createInvoice, deleteCreditNote, deleteInvoice, deleteSubscription, emailInvoiceToClient,
  generateDueSubscriptionInvoices, getCompanyGstProfile, getCreditNoteItems, getInvoiceItems, listClients,
  listCreditNotes, listInvoices, listProjects, listServiceTypes, listSubscriptions, postCreditNoteToAccounts,
  postInvoiceToAccounts, recordPayment, saveSubscription, updateInvoice, updateInvoiceStatus
} from "./digital-services-api.js";
import { generateInvoicePdf, openPdfModal } from "./ds-invoice-pdf.js";
import { sendWhatsAppWorkspaceMessage } from "./whatsapp-api.js";
import { showToast } from "./utils.js";

const TYPES = [["one_off", "One-off"], ["milestone", "Milestone"], ["retainer", "Retainer"], ["subscription", "Subscription"]];
const state = {
  invoices: [], clients: [], projects: [], services: [], subscriptions: [], creditNotes: [], canDelete: false,
  lines: [{ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }],
  form: { clientId: "", projectId: "", invoiceType: "one_off", dueDate: "" },
  editingInvoiceId: null, editingSub: null,
  cnLines: [{ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }],
  cnForm: { clientId: "", invoiceId: "", reason: "" }
};
function cnTotals() {
  const sub = state.cnLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const tax = state.cnLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (Number(l.taxRate) || 0) / 100, 0);
  return { sub, tax, total: sub + tax };
}
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(v) { return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function totals() {
  const sub = state.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const tax = state.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (Number(l.taxRate) || 0) / 100, 0);
  return { sub, tax, total: sub + tax };
}
function sel(a, b) { return String(a) === String(b) ? "selected" : ""; }

function render() {
  const cliOpt = state.clients.map((c) => `<option value="${esc(c.id)}" ${sel(c.id, state.form.clientId)}>${esc(c.company_name || c.name)}</option>`).join("");
  const projOpt = state.projects.map((p) => `<option value="${esc(p.id)}" ${sel(p.id, state.form.projectId)}>${esc(p.title)} (${esc(p.code || "")})</option>`).join("");
  const subCliOpt = state.clients.map((c) => `<option value="${esc(c.id)}" ${sel(c.id, state.editingSub?.client_id)}>${esc(c.company_name || c.name)}</option>`).join("");
  const cnCliOpt = state.clients.map((c) => `<option value="${esc(c.id)}" ${sel(c.id, state.cnForm.clientId)}>${esc(c.company_name || c.name)}</option>`).join("");
  const cnInvOpt = state.invoices.map((i) => `<option value="${esc(i.id)}" ${sel(i.id, state.cnForm.invoiceId)}>${esc(i.invoice_number)}</option>`).join("");
  const t = totals();
  const es = state.editingSub || {};
  renderModuleContent(`
    <style>
      .ds-field{display:grid;gap:.3rem;margin-bottom:.6rem}.ds-field label{font-weight:700;font-size:.8rem}
      .ds-field input,.ds-field select{width:100%}
      .ds-head4{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem}
      .ds-line{display:grid;grid-template-columns:2.5fr .7fr 1fr .7fr auto;gap:.4rem;align-items:center;margin-bottom:.35rem}
      .ds-line input{width:100%}
      .ds-tot{display:flex;gap:1.2rem;justify-content:flex-end;margin:.6rem 0;font-size:.9rem}.ds-tot b{color:#e8eef7}
      @media(max-width:980px){.ds-head4{grid-template-columns:1fr 1fr}.ds-line{grid-template-columns:1fr 1fr}}
    </style>
    <section class="card"><h3>Billing</h3><p class="muted">Create invoices (one-off, milestone, or retainer), record payments, and post to Central Accounts. 0% GST = non-GST bill of supply.</p></section>

    <section class="card" style="margin-top:1rem">
      <h3>${state.editingInvoiceId ? "Edit Invoice (draft)" : "New Invoice"}</h3>
      <form id="dsInvForm">
        <div class="ds-head4">
          <div class="ds-field"><label>Client *</label><select name="client_id" required><option value="">Select…</option>${cliOpt}</select></div>
          <div class="ds-field"><label>Project</label><select name="project_id"><option value="">—</option>${projOpt}</select></div>
          <div class="ds-field"><label>Type</label><select name="invoice_type">${TYPES.map(([v, l]) => `<option value="${v}" ${sel(v, state.form.invoiceType)}>${l}</option>`).join("")}</select></div>
          <div class="ds-field"><label>Due Date</label><input name="due_date" type="date" value="${esc(state.form.dueDate)}" /></div>
        </div>
        <label style="font-weight:700;font-size:.8rem">Line Items</label>
        <div id="dsLines" style="margin:.4rem 0">${linesHtml()}</div>
        <button type="button" class="btn btn-ghost" id="dsAddLine">+ Add line</button>
        <div class="ds-tot" id="dsTot">${totHtml(t)}</div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
          <button class="btn" type="submit">${state.editingInvoiceId ? "Update Invoice" : "Create Invoice"}</button>
          ${state.editingInvoiceId ? '<button class="btn btn-ghost" type="button" id="dsInvCancel">Cancel</button>' : ""}
        </div>
      </form>
    </section>

    <section class="card" style="margin-top:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem">
        <h3 style="margin:0">Retainers &amp; Subscriptions</h3>
        <button class="btn btn-ghost" id="dsGenDue" type="button">Generate due invoices</button>
      </div>
      <form id="dsSubForm" class="ds-head4" style="margin-top:.7rem">
        <input type="hidden" name="id" value="${esc(es.id || "")}" />
        <div class="ds-field"><label>Client *</label><select name="client_id" required><option value="">Select…</option>${subCliOpt}</select></div>
        <div class="ds-field"><label>Plan name *</label><input name="plan_name" required value="${esc(es.plan_name || "")}" placeholder="SEO Monthly" /></div>
        <div class="ds-field"><label>Amount (₹)</label><input name="amount" type="number" value="${esc(es.amount ?? 0)}" /></div>
        <div class="ds-field"><label>GST %</label><input name="tax_rate" type="number" value="${esc(es.tax_rate ?? 18)}" /></div>
        <div class="ds-field"><label>Cycle</label><select name="billing_cycle">${["monthly", "quarterly", "annual"].map((x) => `<option value="${x}" ${sel(x, es.billing_cycle)}>${x}</option>`).join("")}</select></div>
        <div class="ds-field"><label>Start</label><input name="start_date" type="date" value="${esc(es.start_date || "")}" /></div>
        <div class="ds-field"><label>Next invoice</label><input name="next_invoice_date" type="date" value="${esc(es.next_invoice_date || "")}" /></div>
        <div class="ds-field" style="align-self:end;display:flex;gap:.4rem"><button class="btn" type="submit">${es.id ? "Update" : "Add Retainer"}</button>${es.id ? '<button class="btn btn-ghost" type="button" id="dsSubCancel">Cancel</button>' : ""}</div>
      </form>
      <div class="table-shell" style="margin-top:.6rem"><table>
        <thead><tr><th>Plan</th><th>Client</th><th>Amount</th><th>Cycle</th><th>Next Invoice</th><th>Status</th><th></th></tr></thead>
        <tbody>${state.subscriptions.map((s) => `<tr>
          <td>${esc(s.plan_name)}</td><td>${esc(s.ds_clients?.company_name || s.ds_clients?.name || "-")}</td>
          <td>${money(s.amount)}</td><td>${esc(s.billing_cycle)}</td><td>${esc(s.next_invoice_date || s.start_date || "-")}</td>
          <td><span class="meta-pill">${esc(s.status)}</span></td>
          <td style="white-space:nowrap"><button class="btn btn-ghost ds-sub-edit" data-id="${esc(s.id)}" type="button">Edit</button>${state.canDelete ? `<button class="btn btn-ghost ds-sub-del" data-id="${esc(s.id)}" type="button">Delete</button>` : ""}</td>
        </tr>`).join("") || '<tr><td colspan="7">No retainers yet.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="card" style="margin-top:1rem">
      <h3>Invoices (${state.invoices.length})</h3>
      <div class="table-shell"><table>
        <thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Paid</th><th>Status</th><th>Accounts</th><th>Actions</th></tr></thead>
        <tbody>${state.invoices.map((i) => `<tr>
          <td>${esc(i.invoice_number)}<br><span class="muted">${esc(i.invoice_type)} · ${esc(i.issue_date)}</span></td>
          <td>${esc(i.ds_clients?.company_name || i.ds_clients?.name || "-")}</td>
          <td>${money(i.total_amount)}</td><td>${money(i.amount_paid)}${Number(i.amount_credited) > 0 ? `<br><span class="muted">+${money(i.amount_credited)} credited</span>` : ""}</td>
          <td><span class="meta-pill">${esc(i.status)}</span></td>
          <td>${i.posted_to_ca ? '<span class="meta-pill">Posted</span>' : '<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost ds-pdf" data-id="${esc(i.id)}" type="button">PDF</button>
            <button class="btn btn-ghost ds-email" data-id="${esc(i.id)}" type="button">Email</button>
            <button class="btn btn-ghost ds-wa" data-id="${esc(i.id)}" type="button">WhatsApp</button>
            ${i.status === "draft" ? `<button class="btn btn-ghost ds-edit" data-id="${esc(i.id)}" type="button">Edit</button>` : ""}
            ${["paid", "void"].includes(i.status) ? "" : `<button class="btn btn-ghost ds-pay" data-id="${esc(i.id)}" data-client="${esc(i.client_id)}" type="button">Payment</button>`}
            ${i.posted_to_ca || i.status === "draft" ? "" : `<button class="btn btn-ghost ds-post" data-id="${esc(i.id)}" type="button">Post</button>`}
            ${state.canDelete ? `<button class="btn btn-ghost ds-del" data-id="${esc(i.id)}" type="button">Delete</button>` : ""}
          </td>
        </tr>`).join("") || '<tr><td colspan="7">No invoices yet.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="card" style="margin-top:1rem">
      <h3>Credit Notes (${state.creditNotes.length})</h3>
      <p class="muted">Issue a credit note against an invoice or standalone. Numbered on the shared central register (CR/${new Date().getFullYear() % 100}-${(new Date().getFullYear() % 100) + 1}/NNN).</p>
      <form id="dsCnForm">
        <div class="ds-head4">
          <div class="ds-field"><label>Client *</label><select name="client_id" required><option value="">Select…</option>${cnCliOpt}</select></div>
          <div class="ds-field"><label>Against Invoice</label><select name="invoice_id"><option value="">—</option>${cnInvOpt}</select></div>
          <div class="ds-field" style="grid-column:span 2"><label>Reason</label><input name="reason" value="${esc(state.cnForm.reason)}" placeholder="e.g. Partial refund, overcharge correction" /></div>
        </div>
        <label style="font-weight:700;font-size:.8rem">Line Items</label>
        <div id="dsCnLines" style="margin:.4rem 0">${cnLinesHtml()}</div>
        <button type="button" class="btn btn-ghost" id="dsCnAddLine">+ Add line</button>
        <div class="ds-tot" id="dsCnTot">${totHtml(cnTotals())}</div>
        <button class="btn" type="submit">Issue Credit Note</button>
      </form>
      <div class="table-shell" style="margin-top:.6rem"><table>
        <thead><tr><th>Credit Note</th><th>Client</th><th>Against</th><th>Total</th><th>Status</th><th>Accounts</th><th>Actions</th></tr></thead>
        <tbody>${state.creditNotes.map((cn) => `<tr>
          <td>${esc(cn.credit_note_number)}<br><span class="muted">${esc(cn.issue_date)}</span></td>
          <td>${esc(cn.ds_clients?.company_name || cn.ds_clients?.name || "-")}</td>
          <td>${esc(cn.ds_invoices?.invoice_number || "-")}</td>
          <td>${money(cn.total_amount)}</td>
          <td><span class="meta-pill">${esc(cn.status)}</span></td>
          <td>${cn.posted_to_ca ? '<span class="meta-pill">Posted</span>' : '<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost ds-cn-pdf" data-id="${esc(cn.id)}" type="button">PDF</button>
            ${cn.posted_to_ca ? "" : `<button class="btn btn-ghost ds-cn-post" data-id="${esc(cn.id)}" type="button">Post</button>`}
            ${state.canDelete ? `<button class="btn btn-ghost ds-cn-del" data-id="${esc(cn.id)}" type="button">Delete</button>` : ""}
          </td>
        </tr>`).join("") || '<tr><td colspan="7">No credit notes yet.</td></tr>'}</tbody>
      </table></div>
    </section>
  `);
  bind();
}

function linesHtml() {
  return state.lines.map((l, i) => `<div class="ds-line">
    <input data-i="${i}" data-k="description" placeholder="Description" value="${esc(l.description)}" />
    <input data-i="${i}" data-k="quantity" type="number" step="0.01" placeholder="Qty" value="${esc(l.quantity)}" />
    <input data-i="${i}" data-k="unitPrice" type="number" step="0.01" placeholder="Unit ₹" value="${esc(l.unitPrice)}" />
    <input data-i="${i}" data-k="taxRate" type="number" step="0.01" placeholder="GST %" value="${esc(l.taxRate)}" />
    <button type="button" class="btn btn-ghost ds-rmline" data-i="${i}">✕</button>
  </div>`).join("");
}
function totHtml(t) { return `<span>Subtotal: <b>${money(t.sub)}</b></span><span>GST: <b>${money(t.tax)}</b></span><span>Total: <b>${money(t.total)}</b></span>`; }

function bindLines() {
  document.querySelectorAll("#dsLines input").forEach((inp) => inp.addEventListener("input", () => {
    state.lines[Number(inp.getAttribute("data-i"))][inp.getAttribute("data-k")] = inp.value;
    document.querySelector("#dsTot").innerHTML = totHtml(totals());
  }));
  document.querySelectorAll(".ds-rmline").forEach((b) => b.addEventListener("click", () => {
    state.lines.splice(Number(b.getAttribute("data-i")), 1);
    if (!state.lines.length) state.lines.push({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 });
    refreshLines();
  }));
}
function refreshLines() {
  document.querySelector("#dsLines").innerHTML = linesHtml();
  document.querySelector("#dsTot").innerHTML = totHtml(totals());
  bindLines();
}
function cnLinesHtml() {
  return state.cnLines.map((l, i) => `<div class="ds-line">
    <input data-i="${i}" data-k="description" placeholder="Description" value="${esc(l.description)}" />
    <input data-i="${i}" data-k="quantity" type="number" step="0.01" placeholder="Qty" value="${esc(l.quantity)}" />
    <input data-i="${i}" data-k="unitPrice" type="number" step="0.01" placeholder="Unit ₹" value="${esc(l.unitPrice)}" />
    <input data-i="${i}" data-k="taxRate" type="number" step="0.01" placeholder="GST %" value="${esc(l.taxRate)}" />
    <button type="button" class="btn btn-ghost ds-cn-rmline" data-i="${i}">✕</button>
  </div>`).join("");
}
function bindCnLines() {
  document.querySelectorAll("#dsCnLines input").forEach((inp) => inp.addEventListener("input", () => {
    state.cnLines[Number(inp.getAttribute("data-i"))][inp.getAttribute("data-k")] = inp.value;
    document.querySelector("#dsCnTot").innerHTML = totHtml(cnTotals());
  }));
  document.querySelectorAll(".ds-cn-rmline").forEach((b) => b.addEventListener("click", () => {
    state.cnLines.splice(Number(b.getAttribute("data-i")), 1);
    if (!state.cnLines.length) state.cnLines.push({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 });
    refreshCnLines();
  }));
}
function refreshCnLines() {
  document.querySelector("#dsCnLines").innerHTML = cnLinesHtml();
  document.querySelector("#dsCnTot").innerHTML = totHtml(cnTotals());
  bindCnLines();
}
function resetInvoiceForm() {
  state.editingInvoiceId = null;
  state.lines = [{ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }];
  state.form = { clientId: "", projectId: "", invoiceType: "one_off", dueDate: "" };
}

function bind() {
  // Keep header selections in state so re-render (e.g. add line) never clears them.
  const f = document.querySelector("#dsInvForm");
  f.elements.client_id.addEventListener("change", (e) => state.form.clientId = e.target.value);
  f.elements.project_id.addEventListener("change", (e) => state.form.projectId = e.target.value);
  f.elements.invoice_type.addEventListener("change", (e) => state.form.invoiceType = e.target.value);
  f.elements.due_date.addEventListener("change", (e) => state.form.dueDate = e.target.value);
  bindLines();

  document.querySelector("#dsAddLine").addEventListener("click", () => { state.lines.push({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }); refreshLines(); });
  document.querySelector("#dsInvCancel")?.addEventListener("click", () => { resetInvoiceForm(); render(); });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const clientId = f.client_id.value, projectId = f.project_id.value || null, invoiceType = f.invoice_type.value, dueDate = f.due_date.value || null;
    if (!clientId) return showToast("Select a client.", TOAST_TYPES.ERROR);
    const items = state.lines.filter((l) => String(l.description).trim());
    if (!items.length) return showToast("Add at least one line item.", TOAST_TYPES.ERROR);
    try {
      if (state.editingInvoiceId) { await updateInvoice(state.editingInvoiceId, { clientId, projectId, invoiceType, dueDate, items }); showToast("Invoice updated.", TOAST_TYPES.SUCCESS); }
      else { await createInvoice({ clientId, projectId, invoiceType, dueDate, items }); showToast("Invoice created (draft).", TOAST_TYPES.SUCCESS); }
      resetInvoiceForm(); await reload();
    } catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });

  document.querySelectorAll(".ds-edit").forEach((b) => b.addEventListener("click", async () => {
    const inv = state.invoices.find((x) => x.id === b.getAttribute("data-id"));
    if (!inv) return;
    const items = await getInvoiceItems(inv.id).catch(() => []);
    state.editingInvoiceId = inv.id;
    state.form = { clientId: inv.client_id, projectId: inv.project_id || "", invoiceType: inv.invoice_type, dueDate: inv.due_date || "" };
    state.lines = items.length ? items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unit_price, taxRate: it.tax_rate })) : [{ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }];
    render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll(".ds-del").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Hard-delete this invoice? This cannot be undone.")) return;
    try { await deleteInvoice(b.getAttribute("data-id")); showToast("Invoice deleted.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Delete failed.", TOAST_TYPES.ERROR); }
  }));

  document.querySelectorAll(".ds-pdf").forEach((b) => b.addEventListener("click", async () => {
    const inv = state.invoices.find((x) => x.id === b.getAttribute("data-id"));
    if (!inv) return;
    b.disabled = true; b.textContent = "…";
    try { const [items, company] = await Promise.all([getInvoiceItems(inv.id), getCompanyGstProfile()]); openPdfModal(await generateInvoicePdf(inv, items, inv.ds_clients || {}, company)); }
    catch (err) { showToast(err?.message || "PDF failed.", TOAST_TYPES.ERROR); }
    finally { b.disabled = false; b.textContent = "PDF"; }
  }));
  document.querySelectorAll(".ds-email").forEach((b) => b.addEventListener("click", async () => {
    const inv = state.invoices.find((x) => x.id === b.getAttribute("data-id"));
    if (!inv) return;
    b.disabled = true; b.textContent = "Sending…";
    try { await emailInvoiceToClient(inv); showToast(`Invoice emailed to ${inv.ds_clients?.email}.`, TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Email failed.", TOAST_TYPES.ERROR); b.disabled = false; b.textContent = "Email"; }
  }));
  document.querySelectorAll(".ds-wa").forEach((b) => b.addEventListener("click", async () => {
    const inv = state.invoices.find((x) => x.id === b.getAttribute("data-id"));
    if (!inv) return;
    const num = inv.ds_clients?.whatsapp || inv.ds_clients?.phone;
    if (!num) return showToast("Client has no WhatsApp/phone number.", TOAST_TYPES.ERROR);
    const message = `Hello ${inv.ds_clients?.company_name || inv.ds_clients?.name || ""}, your invoice ${inv.invoice_number} for ${money(inv.total_amount)} is ready${inv.due_date ? ` (due ${inv.due_date})` : ""}. — Varada Nexus Private Limited`;
    b.disabled = true; b.textContent = "Sending…";
    try { await sendWhatsAppWorkspaceMessage({ phone: num, message }); showToast("WhatsApp message sent via Twilio.", TOAST_TYPES.SUCCESS); }
    catch (err) { showToast(err?.message || "WhatsApp send failed (client may need to message first, or an approved template).", TOAST_TYPES.ERROR); }
    finally { b.disabled = false; b.textContent = "WhatsApp"; }
  }));
  document.querySelectorAll(".ds-pay").forEach((b) => b.addEventListener("click", async () => {
    const amount = prompt("Payment amount (₹):"); if (amount === null || amount === "") return;
    try { await recordPayment({ invoiceId: b.getAttribute("data-id"), clientId: b.getAttribute("data-client"), amount, method: "manual" }); showToast("Payment recorded.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll(".ds-post").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Post this invoice to Central Accounts?")) return;
    try { await postInvoiceToAccounts(b.getAttribute("data-id")); showToast("Posted to Central Accounts.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Posting failed.", TOAST_TYPES.ERROR); }
  }));

  // Retainers
  const sf = document.querySelector("#dsSubForm");
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sf.client_id.value) return showToast("Select a client.", TOAST_TYPES.ERROR);
    if (!sf.plan_name.value.trim()) return showToast("Plan name is required.", TOAST_TYPES.ERROR);
    const payload = { clientId: sf.client_id.value, planName: sf.plan_name.value.trim(), amount: sf.amount.value, taxRate: sf.tax_rate.value, billingCycle: sf.billing_cycle.value, startDate: sf.start_date.value || null, nextInvoiceDate: sf.next_invoice_date.value || null };
    try { await saveSubscription(payload, sf.id.value || null); showToast("Retainer saved.", TOAST_TYPES.SUCCESS); state.editingSub = null; await reload(); }
    catch (err) { showToast(err?.message || "Save failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelector("#dsSubCancel")?.addEventListener("click", () => { state.editingSub = null; render(); });
  document.querySelectorAll(".ds-sub-edit").forEach((b) => b.addEventListener("click", () => { state.editingSub = state.subscriptions.find((x) => x.id === b.getAttribute("data-id")) || null; render(); }));
  document.querySelectorAll(".ds-sub-del").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Hard-delete this retainer?")) return;
    try { await deleteSubscription(b.getAttribute("data-id")); showToast("Retainer deleted.", TOAST_TYPES.SUCCESS); if (state.editingSub?.id === b.getAttribute("data-id")) state.editingSub = null; await reload(); }
    catch (err) { showToast(err?.message || "Delete failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelector("#dsGenDue").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { const n = await generateDueSubscriptionInvoices(); showToast(n > 0 ? `${n} retainer invoice(s) generated.` : "No retainers are due.", n > 0 ? TOAST_TYPES.SUCCESS : TOAST_TYPES.INFO); await reload(); }
    catch (err) { showToast(err?.message || "Generation failed.", TOAST_TYPES.ERROR); }
    finally { e.target.disabled = false; }
  });

  // Credit notes
  const cf = document.querySelector("#dsCnForm");
  cf.elements.client_id.addEventListener("change", (e) => state.cnForm.clientId = e.target.value);
  cf.elements.invoice_id.addEventListener("change", (e) => state.cnForm.invoiceId = e.target.value);
  cf.elements.reason.addEventListener("input", (e) => state.cnForm.reason = e.target.value);
  bindCnLines();
  document.querySelector("#dsCnAddLine").addEventListener("click", () => { state.cnLines.push({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }); refreshCnLines(); });
  cf.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!cf.client_id.value) return showToast("Select a client.", TOAST_TYPES.ERROR);
    const items = state.cnLines.filter((l) => String(l.description).trim());
    if (!items.length) return showToast("Add at least one line item.", TOAST_TYPES.ERROR);
    try {
      await createCreditNote({ clientId: cf.client_id.value, invoiceId: cf.invoice_id.value || null, reason: cf.reason.value.trim(), items });
      showToast("Credit note issued.", TOAST_TYPES.SUCCESS);
      state.cnLines = [{ description: "", quantity: 1, unitPrice: 0, taxRate: 18 }]; state.cnForm = { clientId: "", invoiceId: "", reason: "" };
      await reload();
    } catch (err) { showToast(err?.message || "Failed.", TOAST_TYPES.ERROR); }
  });
  document.querySelectorAll(".ds-cn-pdf").forEach((b) => b.addEventListener("click", async () => {
    const cn = state.creditNotes.find((x) => x.id === b.getAttribute("data-id"));
    if (!cn) return;
    b.disabled = true; b.textContent = "…";
    try {
      const [items, company] = await Promise.all([getCreditNoteItems(cn.id), getCompanyGstProfile()]);
      const cnObj = { invoice_number: cn.credit_note_number, issue_date: cn.issue_date, due_date: cn.issue_date, invoice_type: "Credit Note", subtotal: cn.subtotal, tax_amount: cn.tax_amount, total_amount: cn.total_amount, amount_paid: 0, notes: cn.reason };
      openPdfModal(await generateInvoicePdf(cnObj, items, cn.ds_clients || {}, company, { docType: "credit_note", againstInvoice: cn.ds_invoices?.invoice_number, reason: cn.reason }));
    } catch (err) { showToast(err?.message || "PDF failed.", TOAST_TYPES.ERROR); }
    finally { b.disabled = false; b.textContent = "PDF"; }
  }));
  document.querySelectorAll(".ds-cn-post").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Post this credit note to Central Accounts?")) return;
    try { await postCreditNoteToAccounts(b.getAttribute("data-id")); showToast("Credit note posted.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Posting failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll(".ds-cn-del").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Hard-delete this credit note?")) return;
    try { await deleteCreditNote(b.getAttribute("data-id")); showToast("Credit note deleted.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (err) { showToast(err?.message || "Delete failed.", TOAST_TYPES.ERROR); }
  }));
}

async function reload() {
  [state.invoices, state.subscriptions, state.creditNotes] = await Promise.all([
    listInvoices().catch(() => []), listSubscriptions().catch(() => []), listCreditNotes().catch(() => [])
  ]);
  render();
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.DIGITAL_SERVICES_BILLING, pageTitle: "Billing", pageDescription: "Digital Services invoices and payments", workspace: WORKSPACES.DIGITAL_SERVICES });
  if (!boot) return;
  const session = await getSession().catch(() => null);
  state.canDelete = String(session?.user?.email || "").toLowerCase() === "admin@varadanexus.com";
  [state.clients, state.projects, state.services] = await Promise.all([listClients().catch(() => []), listProjects().catch(() => []), listServiceTypes().catch(() => [])]);
  await reload();
}
init();
