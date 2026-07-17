const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function compute(input) {
  const trucks = n(input.trucks);
  const workingDays = n(input.workingDays);
  const tdsPercent = n(input.tdsPercent);
  const monthlyExpenses = n(input.monthlyExpenses);
  const errors = [];

  if (trucks <= 0) errors.push("Number of trucks must be greater than zero.");
  if (workingDays <= 0) errors.push("Working days must be greater than zero.");
  if (tdsPercent < 0 || tdsPercent > 100) errors.push("TDS must be between 0% and 100%.");
  if (monthlyExpenses < 0) errors.push("Monthly expenses cannot be negative.");

  const commodities = (Array.isArray(input.commodities) ? input.commodities : [])
    .map((row, index) => ({
      name: String(row.name || `Commodity ${index + 1}`).trim() || `Commodity ${index + 1}`,
      tonsPerTrip: n(row.tonsPerTrip),
      tripsPerTruckPerDay: n(row.tripsPerTruckPerDay),
      basis: row.basis || "per_ton",
      brokerageRate: n(row.brokerageRate),
      freightRate: n(row.freightRate),
    }))
    .filter((row) => row.tonsPerTrip || row.tripsPerTruckPerDay || row.brokerageRate || row.freightRate);

  if (!commodities.length) errors.push("Add at least one commodity.");
  commodities.forEach((row) => {
    if (row.tonsPerTrip <= 0) errors.push(`${row.name}: tonnes per trip must be greater than zero.`);
    if (row.tripsPerTruckPerDay <= 0) errors.push(`${row.name}: trips per truck per day must be greater than zero.`);
    if (row.brokerageRate < 0) errors.push(`${row.name}: brokerage rate cannot be negative.`);
    if (row.basis === "percent_freight" && row.freightRate <= 0) {
      errors.push(`${row.name}: freight rate per tonne is required for percentage brokerage.`);
    }
  });
  if (errors.length) return { errors };

  let totalTrips = 0;
  let totalTonnage = 0;
  let totalFreightValue = 0;
  let grossBrokerage = 0;
  const truckDays = trucks * workingDays;

  const commodityRows = commodities.map((row) => {
    const monthlyTrips = row.tripsPerTruckPerDay * truckDays;
    const monthlyTonnage = monthlyTrips * row.tonsPerTrip;
    const freightValue = monthlyTonnage * row.freightRate;
    let brokerage = 0;
    if (row.basis === "per_trip") brokerage = monthlyTrips * row.brokerageRate;
    else if (row.basis === "percent_freight") brokerage = freightValue * row.brokerageRate / 100;
    else brokerage = monthlyTonnage * row.brokerageRate;

    totalTrips += monthlyTrips;
    totalTonnage += monthlyTonnage;
    totalFreightValue += freightValue;
    grossBrokerage += brokerage;
    return { ...row, monthlyTrips, monthlyTonnage, freightValue, brokerage };
  });

  const tdsAmount = grossBrokerage * tdsPercent / 100;
  const cashAfterTds = grossBrokerage - tdsAmount;
  const netBrokerage = grossBrokerage - monthlyExpenses;

  return {
    errors: [], trucks, workingDays, totalTrips, totalTonnage, totalFreightValue,
    grossBrokerage, tdsAmount, cashAfterTds, monthlyExpenses, netBrokerage,
    brokeragePerTrip: totalTrips ? grossBrokerage / totalTrips : 0,
    brokeragePerTon: totalTonnage ? grossBrokerage / totalTonnage : 0,
    brokeragePerTruck: trucks ? grossBrokerage / trucks : 0,
    brokeragePerDay: workingDays ? grossBrokerage / workingDays : 0,
    commodityRows,
  };
}
