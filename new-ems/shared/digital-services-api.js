import { MODULES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { sendModuleEmail } from "./email-api.js";
import { dispatchNotification } from "./notification-api.js";

function db() { return getSupabaseClient(); }
function arr(v) { return Array.isArray(v) ? v : []; }
async function run(q) { const { data, error } = await q; if (error) throw error; return data; }
function money(v) { return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function escHtml(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// Best-effort internal notification (in-app + email fanout to admins). Never throws.
async function notifyEvent({ title, message, severity = "info" }) {
  try {
    await dispatchNotification({
      moduleCode: MODULES.DIGITAL_SERVICES, eventCode: "ds_event", category: "digital-services",
      title, message, severity, targetMode: "all_admins", channelPlan: { in_app: true, email: true }
    });
  } catch (_) { /* ignore */ }
}

// Build a click-to-chat WhatsApp link (no Twilio needed). Number should include country code.
export function whatsappLink(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message || "")}`;
}

// --- Company GST profile (seller) — same registration used on transporter bills ---
export async function getCompanyGstProfile() {
  try {
    const rows = arr(await run(db().from("company_gst_registrations")
      .select("gstin,registration_name,state_code,state_name,is_primary,is_active")
      .eq("is_active", true).order("is_primary", { ascending: false }).limit(1)));
    return rows[0] || null;
  } catch { return null; }
}

// --- Reference ---
export async function listServiceTypes() {
  return arr(await run(db().from("ds_service_types").select("*").order("sort_order")));
}
export async function setServiceTypeActive(code, isActive) {
  return run(db().from("ds_service_types").update({ is_active: isActive }).eq("code", code));
}

// --- Clients ---
export async function listClients() {
  return arr(await run(db().from("ds_clients").select("*").order("created_at", { ascending: false })));
}
export async function saveClient(payload, id = null) {
  const row = {
    name: payload.name, company_name: payload.companyName || null, email: payload.email || null,
    phone: payload.phone || null, whatsapp: payload.whatsapp || null, gstin: payload.gstin || null,
    address: payload.address || null, city: payload.city || null, status: payload.status || "active",
    notes: payload.notes || null, updated_at: new Date().toISOString()
  };
  return id
    ? run(db().from("ds_clients").update(row).eq("id", id))
    : run(db().from("ds_clients").insert(row));
}
export async function deleteClient(id) {
  return run(db().rpc("ds_delete_client", { p_client_id: id }));
}

// --- Leads ---
export async function listLeads() {
  return arr(await run(db().from("ds_leads").select("*").order("created_at", { ascending: false })));
}
export async function saveLead(payload, id = null) {
  const row = {
    name: payload.name, company_name: payload.companyName || null, email: payload.email || null,
    phone: payload.phone || null, source: payload.source || null, service_type: payload.serviceType || null,
    stage: payload.stage || "new", estimated_value: Number(payload.estimatedValue) || 0,
    notes: payload.notes || null, updated_at: new Date().toISOString()
  };
  return id
    ? run(db().from("ds_leads").update(row).eq("id", id))
    : run(db().from("ds_leads").insert(row));
}
export async function convertLeadToClient(lead) {
  const client = await run(db().rpc("ds_convert_lead_to_client", { p_lead_id: lead.id }));
  notifyEvent({ title: "Lead won", message: `${lead.name}${lead.company_name ? ` (${lead.company_name})` : ""} converted to a client.`, severity: "success" });
  return client;
}

// --- Projects ---
export async function listProjects() {
  return arr(await run(db().from("ds_projects").select("*, ds_clients(name,company_name)").order("created_at", { ascending: false })));
}
export async function saveProject(payload, id = null) {
  const row = {
    client_id: payload.clientId, title: payload.title, service_type: payload.serviceType || null,
    engagement_type: payload.engagementType || "one_off", status: payload.status || "planning",
    start_date: payload.startDate || null, end_date: payload.endDate || null,
    budget_amount: Number(payload.budgetAmount) || 0, currency: payload.currency || "INR",
    description: payload.description || null, updated_at: new Date().toISOString()
  };
  if (id) return run(db().from("ds_projects").update(row).eq("id", id));
  row.code = await run(db().rpc("ds_next_project_code"));
  return run(db().from("ds_projects").insert(row));
}
export async function completeProject(id) {
  return run(db().from("ds_projects").update({
    status: "completed", updated_at: new Date().toISOString()
  }).eq("id", id).select().single());
}

// --- Deliverables ---
export async function listDeliverables(projectId) {
  return arr(await run(db().from("ds_deliverables").select("*").eq("project_id", projectId).order("sort_order")));
}
export async function saveDeliverable(payload, id = null) {
  const row = {
    project_id: payload.projectId, title: payload.title, description: payload.description || null,
    status: payload.status || "todo", due_date: payload.dueDate || null, sort_order: Number(payload.sortOrder) || 0,
    updated_at: new Date().toISOString()
  };
  return id
    ? run(db().from("ds_deliverables").update(row).eq("id", id))
    : run(db().from("ds_deliverables").insert(row));
}

// --- Vendor costs (subcontractors) + ITC ---
export async function listProjectCosts(projectId = null) {
  let q = db().from("ds_project_costs").select("*, ds_projects(title,code,client_id)").order("bill_date", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  return arr(await run(q));
}
export async function saveProjectCost(payload, id = null) {
  const amount = Number(payload.amount) || 0, rate = Number(payload.gstRate) || 0;
  const gst = amount * rate / 100;
  const row = {
    project_id: payload.projectId, vendor_name: payload.vendorName, vendor_gstin: payload.vendorGstin || null,
    description: payload.description || null, vendor_ref: payload.vendorRef || null,
    bill_date: payload.billDate || new Date().toISOString().slice(0, 10),
    amount, gst_rate: rate, gst_amount: gst, total_amount: amount + gst,
    itc_eligible: payload.itcEligible !== false, status: payload.status || "unpaid", updated_at: new Date().toISOString()
  };
  return id ? run(db().from("ds_project_costs").update(row).eq("id", id)) : run(db().from("ds_project_costs").insert(row));
}
export async function deleteProjectCost(id) {
  return run(db().from("ds_project_costs").delete().eq("id", id));
}
export async function postCostToPayables(costId) {
  return run(db().rpc("ds_post_cost_to_payables", { p_cost_id: costId }));
}

// --- Payables defaults (chart-of-accounts mapping for vendor bills) ---
export async function listCoaAccounts() {
  return arr(await run(db().from("coa_accounts").select("id,code,name").eq("is_active", true).eq("is_posting_allowed", true).order("code")));
}
export async function getPayablesDefaults() {
  const rows = arr(await run(db().from("ds_payables_defaults").select("*").eq("id", 1).limit(1)));
  return rows[0] || null;
}
export async function savePayablesDefaults({ expenseAccountId, inputTaxAccountId, payableAccountId }) {
  return run(db().from("ds_payables_defaults").upsert({
    id: 1, expense_account_id: expenseAccountId || null, input_tax_account_id: inputTaxAccountId || null,
    payable_account_id: payableAccountId || null, updated_at: new Date().toISOString()
  }, { onConflict: "id" }));
}

// --- Subscriptions (retainers) ---
export async function listSubscriptions() {
  return arr(await run(db().from("ds_subscriptions").select("*, ds_clients(name,company_name)").order("created_at", { ascending: false })));
}
export async function saveSubscription(payload, id = null) {
  const row = {
    client_id: payload.clientId, project_id: payload.projectId || null, service_type: payload.serviceType || null,
    plan_name: payload.planName, amount: Number(payload.amount) || 0, tax_rate: Number(payload.taxRate) || 0,
    billing_cycle: payload.billingCycle || "monthly", start_date: payload.startDate || null,
    next_invoice_date: payload.nextInvoiceDate || null, status: payload.status || "active",
    updated_at: new Date().toISOString()
  };
  return id
    ? run(db().from("ds_subscriptions").update(row).eq("id", id))
    : run(db().from("ds_subscriptions").insert(row));
}

// --- Invoices ---
export async function listInvoices() {
  return arr(await run(db().from("ds_invoices").select("*, ds_clients(name,company_name,email,phone,whatsapp,gstin,address,city)").order("issue_date", { ascending: false }).order("created_at", { ascending: false })));
}
export async function getInvoiceItems(invoiceId) {
  return arr(await run(db().from("ds_invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order")));
}
export async function createInvoice({ clientId, projectId, subscriptionId, invoiceType, issueDate, dueDate, currency, notes, items }) {
  const lines = arr(items).map((it, i) => {
    const qty = Number(it.quantity) || 0, price = Number(it.unitPrice) || 0, rate = Number(it.taxRate) || 0;
    const base = qty * price;
    return { description: it.description, quantity: qty, unit_price: price, tax_rate: rate, line_total: base + (base * rate / 100), sort_order: i };
  });
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const tax = lines.reduce((s, l) => s + (l.quantity * l.unit_price * l.tax_rate / 100), 0);
  const invoiceNumber = await run(db().rpc("ds_next_invoice_number"));
  const invoice = await run(db().from("ds_invoices").insert({
    invoice_number: invoiceNumber, client_id: clientId, project_id: projectId || null, subscription_id: subscriptionId || null,
    invoice_type: invoiceType || "one_off", issue_date: issueDate || new Date().toISOString().slice(0, 10), due_date: dueDate || null,
    currency: currency || "INR", subtotal, tax_amount: tax, total_amount: subtotal + tax, status: "draft", notes: notes || null
  }).select().single());
  if (lines.length) await run(db().from("ds_invoice_items").insert(lines.map((l) => ({ ...l, invoice_id: invoice.id }))));
  notifyEvent({ title: `New invoice ${invoice.invoice_number}`, message: `A ${invoice.invoice_type} invoice for ${money(invoice.total_amount)} was created.` });
  return invoice;
}

// Emails a branded invoice to the client and marks the invoice sent.
export async function emailInvoiceToClient(invoice) {
  const client = invoice.ds_clients || {};
  const to = String(client.email || "").trim();
  if (!to) throw new Error("This client has no email address on file.");
  const items = await getInvoiceItems(invoice.id);
  const { generateInvoicePdf } = await import("./ds-invoice-pdf.js");
  let attachments = [];
  try { const company = await getCompanyGstProfile(); const pdf = await generateInvoicePdf(invoice, items, client, company); attachments = [{ name: pdf.filename, mimeType: "application/pdf", base64: pdf.base64, size: Math.floor(pdf.base64.length * 0.75) }]; } catch (_) { /* email still sends without PDF */ }
  const rows = items.map((it) => `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escHtml(it.description)}</td>
    <td align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${Number(it.quantity)}</td>
    <td align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${money(it.unit_price)}</td>
    <td align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${money(it.line_total)}</td></tr>`).join("");
  const html = `
    <p>Dear ${escHtml(client.company_name || client.name)},</p>
    <p>Please find your invoice <b>${escHtml(invoice.invoice_number)}</b> below${invoice.due_date ? `, payable by <b>${escHtml(invoice.due_date)}</b>` : ""}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
      <thead><tr>
        <th align="left" style="padding:6px 8px;border-bottom:2px solid #0f213b;">Description</th>
        <th align="right" style="padding:6px 8px;border-bottom:2px solid #0f213b;">Qty</th>
        <th align="right" style="padding:6px 8px;border-bottom:2px solid #0f213b;">Unit</th>
        <th align="right" style="padding:6px 8px;border-bottom:2px solid #0f213b;">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3" align="right" style="padding:6px 8px;">Subtotal</td><td align="right" style="padding:6px 8px;">${money(invoice.subtotal)}</td></tr>
        <tr><td colspan="3" align="right" style="padding:6px 8px;">GST</td><td align="right" style="padding:6px 8px;">${money(invoice.tax_amount)}</td></tr>
        <tr><td colspan="3" align="right" style="padding:6px 8px;font-weight:800;">Total</td><td align="right" style="padding:6px 8px;font-weight:800;">${money(invoice.total_amount)}</td></tr>
      </tfoot>
    </table>
    <p>Thank you for your business.</p>`;
  const textBody = `Dear ${client.company_name || client.name},\n\nPlease find attached invoice ${invoice.invoice_number} for ${money(invoice.total_amount)}${invoice.due_date ? `, due ${invoice.due_date}` : ""}.\n\nThank you for your business.\nVarada Nexus Private Limited`;
  await sendModuleEmail({ to: [{ address: to, name: client.company_name || client.name }], subject: `Invoice ${invoice.invoice_number} — Varada Nexus Private Limited`, htmlBody: html, bodyHtml: html, textBody, attachments, sourceModule: "digital-services", sourceEvent: "invoice_email" });
  if (invoice.status === "draft") await updateInvoiceStatus(invoice.id, "sent");
  notifyEvent({ title: `Invoice ${invoice.invoice_number} emailed`, message: `Invoice sent to ${to} (${money(invoice.total_amount)}).` });
  return true;
}

export async function generateDueSubscriptionInvoices() {
  const count = await run(db().rpc("ds_generate_due_subscription_invoices"));
  if (count > 0) notifyEvent({ title: "Retainer invoices generated", message: `${count} recurring invoice(s) drafted from active subscriptions.` });
  return count;
}
export async function updateInvoiceStatus(id, status) {
  return run(db().from("ds_invoices").update({ status, updated_at: new Date().toISOString() }).eq("id", id));
}
export async function updateInvoice(id, { clientId, projectId, invoiceType, dueDate, notes, items }) {
  const lines = arr(items).map((it, i) => {
    const qty = Number(it.quantity) || 0, price = Number(it.unitPrice) || 0, rate = Number(it.taxRate) || 0;
    const base = qty * price;
    return { description: it.description, quantity: qty, unit_price: price, tax_rate: rate, line_total: base + (base * rate / 100), sort_order: i };
  });
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const tax = lines.reduce((s, l) => s + (l.quantity * l.unit_price * l.tax_rate / 100), 0);
  await run(db().from("ds_invoices").update({
    client_id: clientId, project_id: projectId || null, invoice_type: invoiceType || "one_off",
    due_date: dueDate || null, notes: notes || null, subtotal, tax_amount: tax, total_amount: subtotal + tax,
    updated_at: new Date().toISOString()
  }).eq("id", id));
  await run(db().from("ds_invoice_items").delete().eq("invoice_id", id));
  if (lines.length) await run(db().from("ds_invoice_items").insert(lines.map((l) => ({ ...l, invoice_id: id }))));
  return true;
}
export async function deleteInvoice(id) {
  return run(db().rpc("ds_delete_invoice", { p_invoice_id: id }));
}
export async function deleteSubscription(id) {
  return run(db().rpc("ds_delete_subscription", { p_subscription_id: id }));
}
export async function recordPayment({ invoiceId, clientId, amount, method, reference, notes }) {
  await run(db().from("ds_payments").insert({ invoice_id: invoiceId, client_id: clientId || null, amount: Number(amount) || 0, method: method || null, reference: reference || null, notes: notes || null }));
  const inv = await run(db().from("ds_invoices").select("total_amount, amount_paid, amount_credited").eq("id", invoiceId).single());
  const paid = Number(inv.amount_paid || 0) + (Number(amount) || 0);
  const settled = paid + Number(inv.amount_credited || 0);
  const status = settled >= Number(inv.total_amount || 0) && Number(inv.total_amount) > 0 ? "paid" : (settled > 0 ? "partially_paid" : "sent");
  const res = await run(db().from("ds_invoices").update({ amount_paid: paid, status, updated_at: new Date().toISOString() }).eq("id", invoiceId));
  notifyEvent({ title: "Payment received", message: `${money(amount)} recorded — invoice is now ${status}.`, severity: "success" });
  return res;
}
export async function postInvoiceToAccounts(invoiceId) {
  return run(db().rpc("bridge_ds_invoice_to_central_accounts", { p_invoice_id: invoiceId }));
}

// --- Credit Notes ---
export async function listCreditNotes() {
  return arr(await run(db().from("ds_credit_notes").select("*, ds_clients(name,company_name,email,phone,whatsapp,gstin,address,city), ds_invoices(invoice_number)").order("issue_date", { ascending: false }).order("created_at", { ascending: false })));
}
export async function getCreditNoteItems(id) {
  return arr(await run(db().from("ds_credit_note_items").select("*").eq("credit_note_id", id).order("sort_order")));
}
export async function createCreditNote({ clientId, projectId, invoiceId, reason, items }) {
  const lines = arr(items).map((it, i) => {
    const qty = Number(it.quantity) || 0, price = Number(it.unitPrice) || 0, rate = Number(it.taxRate) || 0;
    const base = qty * price;
    return { description: it.description, quantity: qty, unit_price: price, tax_rate: rate, line_total: base + (base * rate / 100), sort_order: i };
  });
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const tax = lines.reduce((s, l) => s + (l.quantity * l.unit_price * l.tax_rate / 100), 0);
  const number = await run(db().rpc("ds_next_credit_note_number"));
  const cn = await run(db().from("ds_credit_notes").insert({
    credit_note_number: number, client_id: clientId, project_id: projectId || null, invoice_id: invoiceId || null,
    reason: reason || null, subtotal, tax_amount: tax, total_amount: subtotal + tax, status: "issued"
  }).select().single());
  if (lines.length) await run(db().from("ds_credit_note_items").insert(lines.map((l) => ({ ...l, credit_note_id: cn.id }))));
  // Apply the credit to the linked invoice so its outstanding drops (and it's marked paid when cleared).
  if (invoiceId) { try { await run(db().rpc("ds_apply_invoice_credit", { p_invoice_id: invoiceId, p_delta: cn.total_amount })); } catch (_) { /* ignore */ } }
  notifyEvent({ title: `Credit note ${number}`, message: `Credit note for ${money(cn.total_amount)} issued.` });
  return cn;
}
export async function deleteCreditNote(id) {
  return run(db().rpc("ds_delete_credit_note", { p_credit_note_id: id }));
}
export async function postCreditNoteToAccounts(id) {
  return run(db().rpc("bridge_ds_credit_note_to_central_accounts", { p_credit_note_id: id }));
}

// --- Dashboard ---
export async function dashboardStats() {
  const [clients, leads, projects, invoices, costs] = await Promise.all([listClients(), listLeads(), listProjects(), listInvoices(), listProjectCosts()]);
  const openLeads = leads.filter((l) => !["won", "lost"].includes(l.stage)).length;
  const activeProjects = projects.filter((p) => ["planning", "active"].includes(p.status)).length;
  const outstanding = invoices.filter((i) => !["paid", "void"].includes(i.status)).reduce((s, i) => s + (Number(i.total_amount) - Number(i.amount_paid || 0)), 0);
  const revenue = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const nonVoid = invoices.filter((i) => i.status !== "void");
  const revenueTaxable = nonVoid.reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const outputGst = nonVoid.filter((i) => i.status !== "draft").reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const vendorCost = costs.reduce((s, c) => s + Number(c.total_amount || 0), 0);
  const costTaxable = costs.reduce((s, c) => s + Number(c.amount || 0), 0);
  const itc = costs.filter((c) => c.itc_eligible).reduce((s, c) => s + Number(c.gst_amount || 0), 0);
  const grossMargin = revenueTaxable - costTaxable;
  const netGst = outputGst - itc;
  return { clients: clients.length, openLeads, activeProjects, outstanding, revenue, vendorCost, itc, grossMargin, outputGst, netGst, recentProjects: projects.slice(0, 6), recentInvoices: invoices.slice(0, 6) };
}
