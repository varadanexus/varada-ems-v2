import { compute } from "./logic.js";

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value || 0);
const number = (value, digits = 0) => new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: digits,
}).format(value || 0);
const val = (id) => Number($(id).value) || 0;

const commodityDefaults = [{}];

function commodityRow(row = {}) {
  const wrap = document.createElement("div");
  wrap.className = "profit-repeater-row commodity-row";
  wrap.innerHTML = `
    <div><label>Commodity</label><input data-field="name" aria-label="Commodity name" value="${escapeHtml(row.name || "")}" placeholder="e.g. Fly ash"></div>
    <div><label>Tonnes / loaded trip</label><input data-field="tonsPerTrip" aria-label="Tonnes per loaded trip" type="number" min="0" step="0.01" value="${row.tonsPerTrip ?? ""}"></div>
    <div><label>Loaded trips / truck / day</label><input data-field="tripsPerTruckPerDay" aria-label="Loaded trips per truck per day" type="number" min="0" step="0.01" value="${row.tripsPerTruckPerDay ?? ""}"></div>
    <div><label>Freight rate / tonne (₹)</label><input data-field="ratePerTon" aria-label="Freight rate per tonne" type="number" min="0" step="0.01" value="${row.ratePerTon ?? ""}"></div>
    <button class="row-remove" type="button" aria-label="Remove commodity">Remove</button>`;
  wrap.querySelector(".row-remove").addEventListener("click", () => wrap.remove());
  $("commodityRows").appendChild(wrap);
}

function expenseRow(row = {}) {
  const wrap = document.createElement("div");
  wrap.className = "profit-repeater-row expense-row";
  wrap.innerHTML = `
    <div><label>Expense</label><input data-field="name" aria-label="Other expense name" value="${escapeHtml(row.name || "")}" placeholder="e.g. Loading charges"></div>
    <div><label>Amount (₹)</label><input data-field="amount" aria-label="Other expense amount" type="number" min="0" step="0.01" value="${row.amount ?? ""}"></div>
    <div><label>Charge basis</label><select data-field="basis" aria-label="Other expense charge basis">${basisOptions(row.basis)}</select></div>
    <button class="row-remove" type="button" aria-label="Remove expense">Remove</button>`;
  wrap.querySelector(".row-remove").addEventListener("click", () => wrap.remove());
  $("expenseRows").appendChild(wrap);
}

function basisOptions(selected = "fleet_month") {
  return [
    ["loaded_trip", "Per loaded commodity trip"],
    ["round_trip", "Per completed round trip"],
    ["truck_month", "Per truck / month"],
    ["fleet_month", "Fleet total / month"],
    ["per_ton", "Per tonne"],
    ["per_km", "Per kilometre"],
  ].map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function readRows(containerId) {
  return [...$(containerId).querySelectorAll(".profit-repeater-row")].map((row) => {
    const result = {};
    row.querySelectorAll("[data-field]").forEach((field) => {
      result[field.dataset.field] = field.type === "number" ? Number(field.value) || 0 : field.value;
    });
    return result;
  });
}

function inputData() {
  return {
    trucks: val("trucks"), workingDays: val("workingDays"),
    roundTripsPerTruckPerDay: val("roundTripsPerTruckPerDay"), oneWayKm: val("oneWayKm"),
    mileage: val("mileage"), fuelPrice: val("fuelPrice"),
    tollAmount: val("tollAmount"), tollBasis: $("tollBasis").value,
    driverAmount: val("driverAmount"), driverBasis: $("driverBasis").value,
    maintenancePerKm: val("maintenancePerKm"), permitCost: val("permitCost"),
    fixedCostPerTruck: val("fixedCostPerTruck"), fleetOverhead: val("fleetOverhead"),
    commissionPerTon: val("commissionPerTon"),
    commodities: readRows("commodityRows"), expenses: readRows("expenseRows"),
  };
}

function render() {
  const result = compute(inputData());
  if (result.errors.length) {
    $("formErrors").innerHTML = result.errors.map((error) => `<div>${escapeHtml(error)}</div>`).join("");
    $("formErrors").hidden = false;
    $("results").classList.remove("show");
    return;
  }
  $("formErrors").hidden = true;
  $("results").classList.add("show");
  $("profitKpis").innerHTML = [
    ["Monthly revenue", money(result.revenue)],
    ["Monthly total cost", money(result.totalCost)],
    [result.profit >= 0 ? "Net transporter profit" : "Net transporter loss", money(result.profit)],
    ["Profit margin", `${number(result.profitMargin, 2)}%`],
    ["Profit / loaded trip", money(result.profitPerLoadedTrip)],
    ["Profit / truck / month", money(result.profitPerTruck)],
  ].map(([label, value], index) => `<div class="vt-kpi${index === 2 ? (result.profit >= 0 ? " positive" : " negative") : ""}"><span>${label}</span><b>${value}</b></div>`).join("");

  $("summaryStrip").innerHTML = `
    <span><b>${number(result.roundTrips, 2)}</b> round trips/month</span>
    <span><b>${number(result.loadedTrips, 2)}</b> loaded trips/month</span>
    <span><b>${number(result.tonnage, 2)}</b> tonnes/month</span>
    <span><b>${number(result.totalKilometres, 2)}</b> km/month</span>
    <span><b>${number(result.fuelLitres, 2)}</b> litres/month</span>`;

  $("commodityBreakdown").innerHTML = result.commodityRows.map((row) => `<tr>
    <td>${escapeHtml(row.name)}</td><td class="num">${number(row.monthlyTrips, 2)}</td>
    <td class="num">${number(row.monthlyTonnage, 2)}</td><td class="num">${money(row.ratePerTon)}</td>
    <td class="num">${money(row.revenue)}</td></tr>`).join("") + `<tr class="total"><td>Total</td><td class="num">${number(result.loadedTrips, 2)}</td><td class="num">${number(result.tonnage, 2)}</td><td></td><td class="num">${money(result.revenue)}</td></tr>`;

  $("costBreakdown").innerHTML = result.costRows.map((row) => `<tr>
    <td>${escapeHtml(row.label)}</td><td class="num">${money(row.amount)}</td>
    <td class="num">${money(result.loadedTrips ? row.amount / result.loadedTrips : 0)}</td>
    <td class="num">${result.revenue ? number(row.amount / result.revenue * 100, 2) : "0"}%</td></tr>`).join("") + `<tr class="total"><td>Total operating cost</td><td class="num">${money(result.totalCost)}</td><td class="num">${money(result.costPerLoadedTrip)}</td><td class="num">${result.revenue ? number(result.totalCost / result.revenue * 100, 2) : "0"}%</td></tr>`;

  $("profitDetails").innerHTML = `
    <div><span>Revenue / loaded trip</span><b>${money(result.revenuePerLoadedTrip)}</b></div>
    <div><span>Cost / loaded trip</span><b>${money(result.costPerLoadedTrip)}</b></div>
    <div><span>Profit / completed round trip</span><b>${money(result.profitPerRoundTrip)}</b></div>
    <div><span>Profit / tonne</span><b>${money(result.profitPerTon)}</b></div>
    <div><span>Break-even average rate / tonne</span><b>${money(result.breakEvenRatePerTon)}</b></div>
    <div><span>Profit before partner commission</span><b>${money(result.profitBeforeCommission)}</b></div>
    <div><span>Partner commission</span><b>${money(result.commissionCost)}</b></div>`;

  window.__LAST_PROFIT_RESULT__ = result;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function whatsapp() {
  const result = window.__LAST_PROFIT_RESULT__;
  if (!result) return;
  const text = `Transporter trip profit calculation\nRevenue: ${money(result.revenue)}\nTotal cost: ${money(result.totalCost)}\nNet profit: ${money(result.profit)}\nMargin: ${number(result.profitMargin, 2)}%\nLoaded trips: ${number(result.loadedTrips, 2)}\nTonnage: ${number(result.tonnage, 2)} tonnes`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

commodityDefaults.forEach(commodityRow);
expenseRow({ basis: "fleet_month" });
$("addCommodity").addEventListener("click", () => commodityRow({}));
$("addExpense").addEventListener("click", () => expenseRow({}));
$("calculate").addEventListener("click", render);
$("print").addEventListener("click", () => window.print());
$("whatsapp").addEventListener("click", whatsapp);
