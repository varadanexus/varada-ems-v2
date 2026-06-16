import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { createTripExpense, listActiveOptions, listTripExpenses, listTripOptions, resolveWorkspaceDivision, softDeleteTripExpense, updateTripExpense } from "./admin-api.js";
import { logAuditEvent } from "./audit.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

const EXPENSE_CATEGORIES = ["Diesel", "Toll", "Driver Bata", "Loading", "Unloading", "RTO", "Maintenance", "Advance", "Miscellaneous"];
const PAID_BY_OPTIONS = ["Company", "Transporter", "Driver", "Client", "Other"];

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.TRANSPORT_TRIP_EXPENSES,
    pageTitle: "Trip Support / Deductions",
    pageDescription: "Trip-linked support and deductions capture",
    workspace: WORKSPACES.TRANSPORTATION
  });
  if (!boot) return;

  const divisionId = boot.divisionId || null;
  if (!divisionId) return showToast("Canonical Transportation division not found", TOAST_TYPES.ERROR);

  renderModuleContent(`
    <section class="card">
      <h3>Select Trip</h3>
      <div class="meta-pill">Workspace: Transportation</div>
      <label>Trip No *</label>
      <select id="teTripSelect"><option value="">Select Trip...</option></select>
      <div id="teTripSummary" class="empty-state" style="margin-top:.75rem;">Select a trip to view summary.</div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h3>Add Support / Deduction</h3>
      <form id="teForm" class="form-row"></form>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h3>Trip Support / Deductions List</h3>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
        <input id="teSearch" placeholder="Search expense no/notes" />
        <select id="teCategory"><option value="">All Categories</option>${EXPENSE_CATEGORIES.map((x) => `<option value="${x}">${x}</option>`).join("")}</select>
        <input id="teFromDate" type="date" />
        <input id="teToDate" type="date" />
      </div>
      <div id="teTotal" class="meta-pill" style="margin:.75rem 0;">Total: 0</div>
      <div class="table-shell"><table><thead><tr><th>No</th><th>Date</th><th>Category</th><th>Amount</th><th>Paid By</th><th>Notes</th><th>Actions</th></tr></thead><tbody id="teBody"></tbody></table></div>
    </section>
  `);

  const tripSel = qs("#teTripSelect");
  const form = qs("#teForm");
  let selectedTrip = null;
  let tripRows = [];

  const [clients, transporters, trucks, drivers, routes, commodities] = await Promise.all([
    listActiveOptions("transport_clients", { divisionId }),
    listActiveOptions("transport_transporters", { divisionId }),
    listActiveOptions("transport_trucks", { divisionId }),
    listActiveOptions("transport_drivers", { divisionId }),
    listActiveOptions("transport_route_master", { divisionId }),
    listActiveOptions("transport_commodities", { divisionId })
  ]);
  const labelBy = (arr) => new Map(arr.map((x) => [x.value, x.label]));
  const clientBy = labelBy(clients), transporterBy = labelBy(transporters), truckBy = labelBy(trucks), driverBy = labelBy(drivers), routeBy = labelBy(routes), commodityBy = labelBy(commodities);

  form.innerHTML = `
    <label>Expense No</label><input disabled placeholder="Auto-generated EXYYMM###" />
    <label>Expense Date *</label><input data-f="expense_date" type="date" required disabled />
    <label>Category *</label><select data-f="category" disabled><option value="">Select...</option>${EXPENSE_CATEGORIES.map((x)=>`<option value="${x}">${x}</option>`).join("")}</select>
    <label>Amount *</label><input data-f="amount" type="number" min="0" step="0.01" disabled />
    <label>Paid By *</label><select data-f="paid_by" disabled><option value="">Select...</option>${PAID_BY_OPTIONS.map((x)=>`<option value="${x}">${x}</option>`).join("")}</select>
    <label>Notes</label><input data-f="notes" disabled />
    <button class="btn" type="submit" disabled id="teSaveBtn">Save Support / Deduction</button>
  `;

  function setFormEnabled(enabled) {
    form.querySelectorAll("input[data-f],select[data-f]").forEach((el) => (el.disabled = !enabled));
    const btn = qs("#teSaveBtn");
    if (btn) btn.disabled = !enabled;
  }

  function tripSummary(trip) {
    return `
      <div class="hero-kpis">
        <span class="meta-pill">Trip No: ${trip.trip_no || "-"}</span>
        <span class="meta-pill">Date: ${trip.trip_date || "-"}</span>
        <span class="meta-pill">Status: ${trip.status || "-"}</span>
        <span class="meta-pill">Qty: ${trip.quantity_mt || "-"}</span>
      </div>
      <p class="muted" style="margin-top:.5rem;">Client: ${clientBy.get(trip.transport_client_id) || "-"} | Transporter: ${transporterBy.get(trip.transport_transporter_id) || "-"}</p>
      <p class="muted">Truck: ${truckBy.get(trip.truck_id) || "-"} | Driver: ${driverBy.get(trip.driver_id) || "-"}</p>
      <p class="muted">Route: ${routeBy.get(trip.route_id) || "-"} | Commodity: ${commodityBy.get(trip.transport_commodity_id) || "-"}</p>
    `;
  }

  async function loadTrips() {
    tripRows = await listTripOptions({ divisionId, limit: 500 });
    tripSel.innerHTML = `<option value="">Select Trip...</option>${tripRows.map((t) => `<option value="${t.id}">${t.trip_no} · ${t.trip_date || ""}</option>`).join("")}`;
  }

  async function loadExpenses() {
    if (!selectedTrip?.id) {
      qs("#teBody").innerHTML = `<tr><td colspan="7">Select a trip first</td></tr>`;
      qs("#teTotal").textContent = "Total: 0";
      return;
    }
    const search = qs("#teSearch")?.value?.trim() || "";
    const category = qs("#teCategory")?.value || "";
    const fromDate = qs("#teFromDate")?.value || "";
    const toDate = qs("#teToDate")?.value || "";
    const { rows } = await listTripExpenses({ tripId: selectedTrip.id, divisionId, search, category, fromDate, toDate, page: 1, pageSize: 300 });
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    qs("#teTotal").textContent = `Total: ${total.toFixed(2)}`;
    const body = qs("#teBody");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7">No expenses found for selected trip</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r) => `<tr>
      <td>${r.expense_no || ""}</td>
      <td><input data-e-date="${r.id}" type="date" value="${r.expense_date || ""}" /></td>
      <td><select data-e-cat="${r.id}">${EXPENSE_CATEGORIES.map((x) => `<option value="${x}" ${r.category === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><input data-e-amt="${r.id}" type="number" min="0" step="0.01" value="${r.amount || 0}" /></td>
      <td><select data-e-paid="${r.id}">${PAID_BY_OPTIONS.map((x) => `<option value="${x}" ${r.paid_by === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><input data-e-notes="${r.id}" value="${r.notes || ""}" /></td>
      <td><button class="btn" data-e-save="${r.id}">Edit</button> <button class="btn btn-danger" data-e-del="${r.id}">Delete</button></td>
    </tr>`).join("");

    body.querySelectorAll("button[data-e-save]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-e-save");
      const payload = {
        expense_date: qs(`[data-e-date='${id}']`)?.value || null,
        category: qs(`[data-e-cat='${id}']`)?.value || null,
        amount: Number(qs(`[data-e-amt='${id}']`)?.value || 0),
        paid_by: qs(`[data-e-paid='${id}']`)?.value || null,
        notes: qs(`[data-e-notes='${id}']`)?.value?.trim() || null
      };
      if (!payload.expense_date || !payload.category || !payload.paid_by || payload.amount < 0) return showToast("Invalid expense row", TOAST_TYPES.ERROR);
      const updated = await updateTripExpense(id, payload);
      await logAuditEvent("trip_expense_update", { moduleCode: MODULES.TRANSPORT_TRIP_EXPENSES, entityType: "transport_trip_expenses", entityId: id, afterData: updated, action: "update" });
      showToast("Expense updated", TOAST_TYPES.SUCCESS);
      await loadExpenses();
    }));

    body.querySelectorAll("button[data-e-del]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-e-del");
      await softDeleteTripExpense(id);
      await logAuditEvent("trip_expense_delete", { moduleCode: MODULES.TRANSPORT_TRIP_EXPENSES, entityType: "transport_trip_expenses", entityId: id, action: "soft_delete" });
      showToast("Expense deleted", TOAST_TYPES.SUCCESS);
      await loadExpenses();
    }));
  }

  tripSel.addEventListener("change", async () => {
    selectedTrip = tripRows.find((x) => x.id === tripSel.value) || null;
    qs("#teTripSummary").innerHTML = selectedTrip ? tripSummary(selectedTrip) : "Select a trip to view summary.";
    setFormEnabled(Boolean(selectedTrip));
    await loadExpenses();
  });

  ["#teSearch", "#teCategory", "#teFromDate", "#teToDate"].forEach((sel) => {
    qs(sel)?.addEventListener(sel === "#teSearch" ? "input" : "change", async () => loadExpenses());
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedTrip?.id) return showToast("Select trip first", TOAST_TYPES.ERROR);
    const payload = {
      division_id: divisionId,
      trip_id: selectedTrip.id,
      expense_date: qs("[data-f='expense_date']")?.value || null,
      category: qs("[data-f='category']")?.value || null,
      amount: Number(qs("[data-f='amount']")?.value || 0),
      paid_by: qs("[data-f='paid_by']")?.value || null,
      notes: qs("[data-f='notes']")?.value?.trim() || null,
      is_active: true
    };
    if (!payload.expense_date || !payload.category || !payload.paid_by) return showToast("Fill required fields", TOAST_TYPES.ERROR);
    if (payload.amount < 0) return showToast("Amount cannot be negative", TOAST_TYPES.ERROR);
    try {
      const created = await createTripExpense(payload);
      await logAuditEvent("trip_expense_create", { moduleCode: MODULES.TRANSPORT_TRIP_EXPENSES, entityType: "transport_trip_expenses", entityId: created.id, afterData: created, action: "create" });
      showToast(`Expense created: ${created.expense_no}`, TOAST_TYPES.SUCCESS);
      form.reset();
      await loadExpenses();
    } catch (err) {
      const detail = [err?.code, err?.message, err?.details, err?.hint].filter(Boolean).join(" | ");
      showToast(detail || "Create failed", TOAST_TYPES.ERROR);
    }
  });

  setFormEnabled(false);
  await loadTrips();
  await loadExpenses();
}

init();
