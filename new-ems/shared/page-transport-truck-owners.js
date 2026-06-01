import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRUCK_OWNERS,
  pageTitle: "Truck Owners",
  pageDescription: "Transportation truck owner master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTruckOwners,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "gstin", label: "GSTIN" },
    { key: "pan", label: "PAN" },
    { key: "bank_details", label: "Bank Details" }
  ]
});
