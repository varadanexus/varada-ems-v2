import { compute } from "./logic.js";
import { downloadTransportReport, pdfFormat } from "/professional-tools/assets/transport-report-pdf.js";

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
const number = (value, digits = 0) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value || 0);
const val = (id) => Number($(id).value) || 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function commodityRow(row = {}) {
  const wrap = document.createElement("div");
  wrap.className = "profit-repeater-row brokerage-row";
  wrap.innerHTML = `
    <div><label>Commodity</label><input data-field="name" aria-label="Commodity name" value="${escapeHtml(row.name || "")}" placeholder="e.g. Fly ash"></div>
    <div><label>Tonnes / trip</label><input data-field="tonsPerTrip" aria-label="Tonnes per trip" type="number" min="0" step="0.01" value="${row.tonsPerTrip ?? ""}"></div>
    <div><label>Trips / truck / day</label><input data-field="tripsPerTruckPerDay" aria-label="Trips per truck per day" type="number" min="0" step="0.01" value="${row.tripsPerTruckPerDay ?? ""}"></div>
    <div><label>Brokerage basis</label><select data-field="basis" aria-label="Brokerage basis">
      <option value="per_ton"${row.basis === "per_ton" || !row.basis ? " selected" : ""}>₹ per tonne</option>
      <option value="per_trip"${row.basis === "per_trip" ? " selected" : ""}>₹ per loaded trip</option>
      <option value="percent_freight"${row.basis === "percent_freight" ? " selected" : ""}>% of freight value</option>
    </select></div>
    <div><label>Brokerage rate</label><input data-field="brokerageRate" aria-label="Brokerage rate" type="number" min="0" step="0.01" value="${row.brokerageRate ?? ""}"></div>
    <div><label>Freight rate / tonne (₹)</label><input data-field="freightRate" aria-label="Freight rate per tonne" type="number" min="0" step="0.01" value="${row.freightRate ?? ""}"><small>Only needed for % basis</small></div>
    <button class="row-remove" type="button" aria-label="Remove commodity">Remove</button>`;
  wrap.querySelector(".row-remove").addEventListener("click", () => wrap.remove());
  $("commodityRows").appendChild(wrap);
}

function readCommodities() {
  return [...$("commodityRows").querySelectorAll(".brokerage-row")].map((row) => {
    const result = {};
    row.querySelectorAll("[data-field]").forEach((field) => {
      result[field.dataset.field] = field.type === "number" ? Number(field.value) || 0 : field.value;
    });
    return result;
  });
}

function render() {
  const result = compute({
    trucks: val("trucks"), workingDays: val("workingDays"),
    tdsPercent: val("tdsPercent"), monthlyExpenses: val("monthlyExpenses"),
    commodities: readCommodities(),
  });
  if (result.errors.length) {
    $("formErrors").innerHTML = result.errors.map((error) => `<div>${escapeHtml(error)}</div>`).join("");
    $("formErrors").hidden = false;
    $("results").classList.remove("show");
    return;
  }
  $("formErrors").hidden = true;
  $("results").classList.add("show");
  $("brokerageKpis").innerHTML = [
    ["Gross monthly brokerage", money(result.grossBrokerage)],
    ["TDS withheld", money(result.tdsAmount)],
    ["Cash receivable after TDS", money(result.cashAfterTds)],
    [result.netBrokerage >= 0 ? "Net brokerage after expenses" : "Net brokerage loss", money(result.netBrokerage)],
    ["Brokerage / loaded trip", money(result.brokeragePerTrip)],
    ["Brokerage / truck / month", money(result.brokeragePerTruck)],
  ].map(([label, value], index) => `<div class="vt-kpi${index === 3 ? (result.netBrokerage >= 0 ? " positive" : " negative") : ""}"><span>${label}</span><b>${value}</b></div>`).join("");

  $("summaryStrip").innerHTML = `
    <span><b>${number(result.totalTrips, 2)}</b> loaded trips/month</span>
    <span><b>${number(result.totalTonnage, 2)}</b> tonnes/month</span>
    <span><b>${money(result.brokeragePerTon)}</b> brokerage/tonne</span>
    <span><b>${money(result.brokeragePerDay)}</b> brokerage/working day</span>`;

  const basisLabel = { per_ton: "Per tonne", per_trip: "Per trip", percent_freight: "% of freight" };
  $("commodityBreakdown").innerHTML = result.commodityRows.map((row) => `<tr>
    <td>${escapeHtml(row.name)}</td><td>${basisLabel[row.basis]}</td>
    <td class="num">${number(row.monthlyTrips, 2)}</td><td class="num">${number(row.monthlyTonnage, 2)}</td>
    <td class="num">${money(row.freightValue)}</td><td class="num">${money(row.brokerage)}</td></tr>`).join("") +
    `<tr class="total"><td>Total</td><td></td><td class="num">${number(result.totalTrips, 2)}</td><td class="num">${number(result.totalTonnage, 2)}</td><td class="num">${money(result.totalFreightValue)}</td><td class="num">${money(result.grossBrokerage)}</td></tr>`;

  $("brokerageDetails").innerHTML = `
    <div><span>Gross brokerage</span><b>${money(result.grossBrokerage)}</b></div>
    <div><span>Less: operating expenses</span><b>${money(result.monthlyExpenses)}</b></div>
    <div><span>Net brokerage before tax</span><b>${money(result.netBrokerage)}</b></div>
    <div><span>TDS withheld (recoverable)</span><b>${money(result.tdsAmount)}</b></div>`;
  window.__LAST_BROKERAGE_RESULT__ = result;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function whatsapp() {
  const result = window.__LAST_BROKERAGE_RESULT__;
  if (!result) return;
  const text = `Transport brokerage calculation\nGross brokerage: ${money(result.grossBrokerage)}\nTrips: ${number(result.totalTrips, 2)}\nTonnage: ${number(result.totalTonnage, 2)} tonnes\nTDS: ${money(result.tdsAmount)}\nCash receivable: ${money(result.cashAfterTds)}\nNet after expenses: ${money(result.netBrokerage)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

async function downloadPdf() {
  const result = window.__LAST_BROKERAGE_RESULT__;
  if (!result) return;
  const button = $("print");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Generating PDF...";
  try {
    const basisLabel = { per_ton: "Per tonne", per_trip: "Per trip", percent_freight: "% of freight" };
    await downloadTransportReport({
      title: "Transport Brokerage Report",
      subtitle: "Monthly brokerage across commodities, loaded trips, tonnes and trucks",
      filename: `varada-nexus-transport-brokerage-${new Date().toISOString().slice(0, 10)}.pdf`,
      kpis: [
        { label: "Gross monthly brokerage", value: pdfFormat.money(result.grossBrokerage) },
        { label: "TDS withheld", value: pdfFormat.money(result.tdsAmount) },
        { label: "Cash receivable after TDS", value: pdfFormat.money(result.cashAfterTds) },
        { label: result.netBrokerage >= 0 ? "Net brokerage after expenses" : "Net brokerage loss", value: pdfFormat.money(result.netBrokerage), positive: result.netBrokerage >= 0 },
        { label: "Brokerage / loaded trip", value: pdfFormat.money(result.brokeragePerTrip) },
        { label: "Brokerage / truck / month", value: pdfFormat.money(result.brokeragePerTruck) },
      ],
      highlights: [
        { label: "Number of trucks", value: pdfFormat.number(result.trucks) },
        { label: "Working days / month", value: pdfFormat.number(result.workingDays) },
        { label: "Loaded trips / month", value: pdfFormat.number(result.totalTrips) },
        { label: "Total tonnage / month", value: `${pdfFormat.number(result.totalTonnage)} tonnes` },
        { label: "Brokerage / tonne", value: pdfFormat.money(result.brokeragePerTon) },
        { label: "Brokerage / working day", value: pdfFormat.money(result.brokeragePerDay) },
      ],
      tables: [{
        title: "Commodity brokerage breakdown",
        head: ["Commodity", "Basis", "Trips", "Tonnes", "Freight value", "Brokerage"],
        body: result.commodityRows.map((row) => [row.name, basisLabel[row.basis], pdfFormat.number(row.monthlyTrips), pdfFormat.number(row.monthlyTonnage), pdfFormat.money(row.freightValue), pdfFormat.money(row.brokerage)]),
        foot: ["Total", "", pdfFormat.number(result.totalTrips), pdfFormat.number(result.totalTonnage), pdfFormat.money(result.totalFreightValue), pdfFormat.money(result.grossBrokerage)],
      }],
      details: [
        { label: "Gross brokerage", value: pdfFormat.money(result.grossBrokerage) },
        { label: "Operating expenses", value: pdfFormat.money(result.monthlyExpenses) },
        { label: "Net brokerage before income tax", value: pdfFormat.money(result.netBrokerage) },
        { label: "TDS withheld (normally recoverable)", value: pdfFormat.money(result.tdsAmount) },
        { label: "Cash receivable after TDS", value: pdfFormat.money(result.cashAfterTds) },
      ],
    });
  } catch (error) {
    alert("The PDF could not be generated. Check your internet connection and try again.");
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

commodityRow();
$("addCommodity").addEventListener("click", () => commodityRow());
$("calculate").addEventListener("click", render);
$("print").addEventListener("click", downloadPdf);
$("whatsapp").addEventListener("click", whatsapp);
