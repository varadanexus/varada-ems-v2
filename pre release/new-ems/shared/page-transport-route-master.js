import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_ROUTE_MASTER,
  pageTitle: "Route Master",
  pageDescription: "Transportation route master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportRouteMaster,
  uniqueChecks: [{ keys: ["division_id", "code"], message: "Route code already exists in this division." }],
  validate: async (payload) => {
    if (!payload.from_location) return "Source is required.";
    if (!payload.to_location) return "Destination is required.";
    if (payload.distance_km && Number(payload.distance_km) < 0) return "Distance must be zero or positive.";
    return null;
  },
  normalize: (payload) => {
    if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
    if (payload.from_location) payload.from_location = String(payload.from_location).trim();
    if (payload.to_location) payload.to_location = String(payload.to_location).trim();
  },
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "from_location", label: "From" },
    { key: "to_location", label: "To" },
    { key: "distance_km", label: "Distance KM" }
  ]
});
