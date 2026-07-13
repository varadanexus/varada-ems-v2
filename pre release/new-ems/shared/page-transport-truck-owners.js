import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRUCK_OWNERS,
  pageTitle: "Truck Owners",
  pageDescription: "Transportation truck owner master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTruckOwners,
  cardTitle: "Create Truck Owner",
  emptyStateTitle: "No truck owners found",
  emptyStateText: "Add your first truck owner profile to start fleet mapping.",
  normalize: (payload) => {
    if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
    if (payload.pan) payload.pan = String(payload.pan).toUpperCase().trim();
    if (payload.gstin) payload.gstin = String(payload.gstin).toUpperCase().trim();
    if (payload.phone) payload.phone = String(payload.phone).replace(/\D/g, "").slice(-10);
  },
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "gstin", label: "GSTIN" },
    { key: "pan", label: "PAN" },
    { key: "bank_details", label: "Bank Details" }
  ]
});
