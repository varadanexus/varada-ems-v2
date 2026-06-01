import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_DRIVERS,
  pageTitle: "Drivers",
  pageDescription: "Transportation drivers master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportDrivers,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "license_no", label: "License No" },
    { key: "license_expiry", label: "License Expiry (YYYY-MM-DD)" },
    { key: "transporter_id", label: "Transporter ID" }
  ]
});
