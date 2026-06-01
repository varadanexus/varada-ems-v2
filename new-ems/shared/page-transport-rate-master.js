import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_RATE_MASTER,
  pageTitle: "Rate Master",
  pageDescription: "Transportation rate master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportRateMaster,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "rate_type", label: "Rate Type", required: true },
    { key: "client_id", label: "Client ID" },
    { key: "transporter_id", label: "Transporter ID" },
    { key: "route_id", label: "Route ID" },
    { key: "commodity_id", label: "Commodity ID" },
    { key: "rate_per_mt", label: "Rate Per MT" },
    { key: "effective_from", label: "Effective From (YYYY-MM-DD)" },
    { key: "effective_to", label: "Effective To (YYYY-MM-DD)" }
  ]
});
