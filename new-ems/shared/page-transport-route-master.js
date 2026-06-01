import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_ROUTE_MASTER,
  pageTitle: "Route Master",
  pageDescription: "Transportation route master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportRouteMaster,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "from_location", label: "From" },
    { key: "to_location", label: "To" },
    { key: "distance_km", label: "Distance KM" }
  ]
});
