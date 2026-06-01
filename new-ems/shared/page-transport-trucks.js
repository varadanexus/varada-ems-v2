import { MODULES, WORKSPACES } from "../config/constants.js";
import { existsActiveDuplicate, MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRUCKS,
  pageTitle: "Trucks",
  pageDescription: "Transportation trucks master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTrucks,
  searchColumns: ["name", "code", "registration_no"],
  uniqueChecks: [
    { keys: ["division_id", "registration_no"], message: "Registration number already exists in this division." }
  ],
  validate: async (payload, context) => {
    if (!payload.registration_no) return "Truck registration number is required.";
    const dup = await existsActiveDuplicate(
      MASTER_TABLES.transportTrucks,
      { division_id: payload.division_id, registration_no: payload.registration_no },
      context?.id || null
    );
    if (dup) return "Truck registration number must be unique within division.";
    return null;
  },
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "owner_id", label: "Truck Owner", type: "select", optionTable: "transport_truck_owners", optionLabel: "name", divisionScoped: true },
    { key: "transporter_id", label: "Transporter", type: "select", optionTable: "master_transporters", optionLabel: "name", divisionScoped: true },
    { key: "registration_no", label: "Registration No" },
    { key: "capacity_mt", label: "Capacity MT" },
    { key: "permit_expiry", label: "Permit Expiry (YYYY-MM-DD)" }
  ]
});
