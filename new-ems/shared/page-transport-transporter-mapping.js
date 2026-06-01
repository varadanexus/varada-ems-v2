import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRANSPORTER_MAPPING,
  pageTitle: "Transporter Mapping",
  pageDescription: "Transportation transporter mapping",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTransporterMapping,
  fields: [
    { key: "division_id", label: "Division ID", required: true },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "transporter_id", label: "Transporter ID", required: true },
    { key: "truck_id", label: "Truck ID" },
    { key: "route_id", label: "Route ID" },
    { key: "commodity_id", label: "Commodity ID" }
  ]
});
