import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRUCKS,
  pageTitle: "Trucks",
  pageDescription: "Transportation trucks master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTrucks,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "owner_id", label: "Owner ID" },
    { key: "transporter_id", label: "Transporter ID" },
    { key: "registration_no", label: "Registration No" },
    { key: "capacity_mt", label: "Capacity MT" },
    { key: "permit_expiry", label: "Permit Expiry (YYYY-MM-DD)" }
  ]
});
