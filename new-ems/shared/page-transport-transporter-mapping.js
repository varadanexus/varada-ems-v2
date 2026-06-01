import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRANSPORTER_MAPPING,
  pageTitle: "Transporter Mapping",
  pageDescription: "Transportation transporter mapping",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTransporterMapping,
  uniqueChecks: [{ keys: ["division_id", "transporter_id", "truck_id", "route_id", "commodity_id"], message: "Duplicate active transporter mapping exists." }],
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "transporter_id", label: "Transporter", required: true, type: "select", optionTable: "master_transporters", optionLabel: "name", divisionScoped: true },
    { key: "truck_id", label: "Truck", type: "select", optionTable: "transport_trucks", optionLabel: "name", divisionScoped: true },
    { key: "route_id", label: "Route", type: "select", optionTable: "transport_route_master", optionLabel: "name", divisionScoped: true },
    { key: "commodity_id", label: "Commodity", type: "select", optionTable: "master_commodities", optionLabel: "name", divisionScoped: true }
  ]
});
