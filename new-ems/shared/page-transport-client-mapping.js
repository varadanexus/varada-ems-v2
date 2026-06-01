import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_CLIENT_MAPPING,
  pageTitle: "Client Mapping",
  pageDescription: "Transportation client mapping",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportClientMapping,
  uniqueChecks: [{ keys: ["division_id", "client_id", "route_id", "commodity_id"], message: "Duplicate active client mapping exists." }],
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "client_id", label: "Client", required: true, type: "select", optionTable: "master_clients", optionLabel: "name", divisionScoped: true },
    { key: "route_id", label: "Route", type: "select", optionTable: "transport_route_master", optionLabel: "name", divisionScoped: true },
    { key: "commodity_id", label: "Commodity", type: "select", optionTable: "master_commodities", optionLabel: "name", divisionScoped: true },
    { key: "default_rate_id", label: "Default Rate", type: "select", optionTable: "transport_rate_master", optionLabel: "name", divisionScoped: true }
  ]
});
