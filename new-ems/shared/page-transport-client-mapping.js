import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_CLIENT_MAPPING,
  pageTitle: "Client Mapping",
  pageDescription: "Transportation client mapping",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportClientMapping,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "client_id", label: "Client ID", required: true },
    { key: "route_id", label: "Route ID" },
    { key: "commodity_id", label: "Commodity ID" },
    { key: "default_rate_id", label: "Default Rate ID" }
  ]
});
