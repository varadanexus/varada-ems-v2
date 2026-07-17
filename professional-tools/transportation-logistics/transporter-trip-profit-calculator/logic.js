const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function basisQuantity(basis, context) {
  switch (basis) {
    case "loaded_trip": return context.loadedTrips;
    case "round_trip": return context.roundTrips;
    case "truck_month": return context.trucks;
    case "per_ton": return context.tonnage;
    case "per_km": return context.totalKilometres;
    case "fleet_month":
    default: return 1;
  }
}

export function compute(input) {
  const trucks = n(input.trucks);
  const workingDays = n(input.workingDays);
  const roundTripsPerTruckPerDay = n(input.roundTripsPerTruckPerDay);
  const oneWayKm = n(input.oneWayKm);
  const mileage = n(input.mileage);
  const fuelPrice = n(input.fuelPrice);

  const errors = [];
  if (trucks <= 0) errors.push("Number of trucks must be greater than zero.");
  if (workingDays <= 0) errors.push("Working days must be greater than zero.");
  if (roundTripsPerTruckPerDay <= 0) errors.push("Round trips per truck per day must be greater than zero.");
  if (oneWayKm < 0) errors.push("One-way kilometres cannot be negative.");
  if (mileage <= 0) errors.push("Vehicle mileage must be greater than zero.");
  if (fuelPrice < 0) errors.push("Fuel price cannot be negative.");

  const commodities = (Array.isArray(input.commodities) ? input.commodities : [])
    .map((row, index) => ({
      name: String(row.name || `Commodity ${index + 1}`).trim() || `Commodity ${index + 1}`,
      tonsPerTrip: n(row.tonsPerTrip),
      tripsPerTruckPerDay: n(row.tripsPerTruckPerDay),
      ratePerTon: n(row.ratePerTon),
    }))
    .filter((row) => row.tonsPerTrip || row.tripsPerTruckPerDay || row.ratePerTon);

  if (!commodities.length) errors.push("Add at least one commodity.");
  commodities.forEach((row) => {
    if (row.tonsPerTrip <= 0) errors.push(`${row.name}: tonnes per trip must be greater than zero.`);
    if (row.tripsPerTruckPerDay < 0) errors.push(`${row.name}: trips per day cannot be negative.`);
    if (row.ratePerTon < 0) errors.push(`${row.name}: freight rate cannot be negative.`);
  });
  if (errors.length) return { errors };

  const truckWorkingDays = trucks * workingDays;
  const roundTrips = roundTripsPerTruckPerDay * truckWorkingDays;
  const roundTripKm = oneWayKm * 2;
  const totalKilometres = roundTrips * roundTripKm;
  const fuelLitres = totalKilometres / mileage;
  const fuelCost = fuelLitres * fuelPrice;

  let revenue = 0;
  let loadedTrips = 0;
  let tonnage = 0;
  const commodityRows = commodities.map((row) => {
    const monthlyTrips = row.tripsPerTruckPerDay * truckWorkingDays;
    const monthlyTonnage = monthlyTrips * row.tonsPerTrip;
    const commodityRevenue = monthlyTonnage * row.ratePerTon;
    loadedTrips += monthlyTrips;
    tonnage += monthlyTonnage;
    revenue += commodityRevenue;
    return { ...row, monthlyTrips, monthlyTonnage, revenue: commodityRevenue };
  });

  const context = { loadedTrips, roundTrips, trucks, tonnage, totalKilometres };
  const tollCost = n(input.tollAmount) * basisQuantity(input.tollBasis, context);
  const driverCost = n(input.driverAmount) * basisQuantity(input.driverBasis, context);
  const maintenanceCost = n(input.maintenancePerKm) * totalKilometres;
  const permitCost = n(input.permitCost);
  const fixedCostPerTruck = n(input.fixedCostPerTruck) * trucks;
  const fleetOverhead = n(input.fleetOverhead);
  const commissionCost = n(input.commissionPerTon) * tonnage;

  const customCosts = (Array.isArray(input.expenses) ? input.expenses : [])
    .map((row, index) => {
      const label = String(row.name || `Other expense ${index + 1}`).trim() || `Other expense ${index + 1}`;
      const amount = n(row.amount);
      const basis = row.basis || "fleet_month";
      return { label, amount: amount * basisQuantity(basis, context), basis };
    })
    .filter((row) => row.amount !== 0);

  const costRows = [
    { label: "Fuel", amount: fuelCost },
    { label: "Tolls", amount: tollCost },
    { label: "Driver charges", amount: driverCost },
    { label: "Maintenance / tyres", amount: maintenanceCost },
    { label: "RTO, permits and compliance", amount: permitCost },
    { label: "Fixed cost per truck", amount: fixedCostPerTruck },
    { label: "Fleet overhead", amount: fleetOverhead },
    ...customCosts,
    { label: "Partner / company commission", amount: commissionCost },
  ].filter((row) => row.amount !== 0);

  const totalCost = costRows.reduce((sum, row) => sum + row.amount, 0);
  const profit = revenue - totalCost;
  const operatingCostBeforeCommission = totalCost - commissionCost;
  const profitBeforeCommission = revenue - operatingCostBeforeCommission;

  return {
    errors: [],
    trucks,
    workingDays,
    roundTrips,
    loadedTrips,
    roundTripKm,
    totalKilometres,
    fuelLitres,
    tonnage,
    revenue,
    totalCost,
    profit,
    profitBeforeCommission,
    commissionCost,
    profitMargin: revenue ? (profit / revenue) * 100 : 0,
    revenuePerLoadedTrip: loadedTrips ? revenue / loadedTrips : 0,
    costPerLoadedTrip: loadedTrips ? totalCost / loadedTrips : 0,
    profitPerLoadedTrip: loadedTrips ? profit / loadedTrips : 0,
    profitPerRoundTrip: roundTrips ? profit / roundTrips : 0,
    profitPerTruck: trucks ? profit / trucks : 0,
    profitPerTon: tonnage ? profit / tonnage : 0,
    breakEvenRatePerTon: tonnage ? totalCost / tonnage : 0,
    commodityRows,
    costRows,
  };
}
