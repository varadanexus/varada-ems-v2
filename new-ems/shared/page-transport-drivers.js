import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_DRIVERS,
  pageTitle: "Drivers",
  pageDescription: "Transportation drivers master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportDrivers,
  searchColumns: ["name", "code", "phone", "license_no"],
  validate: async (payload) => {
    if (payload.phone && !/^[6-9]\d{9}$/.test(payload.phone)) return "Driver mobile number must be a valid 10-digit Indian mobile.";
    if (payload.license_expiry && Number.isNaN(new Date(payload.license_expiry).getTime())) return "License expiry must be a valid date.";
    return null;
  },
  normalize: (payload) => {
    if (payload.phone) payload.phone = String(payload.phone).replace(/\D/g, "").slice(-10);
    if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
  },
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "license_no", label: "License No" },
    { key: "license_expiry", label: "License Expiry (YYYY-MM-DD)" },
    { key: "transporter_id", label: "Transporter", type: "select", optionTable: "master_transporters", optionLabel: "name", divisionScoped: true }
  ]
});
