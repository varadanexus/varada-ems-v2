import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_COMMODITIES,
  pageTitle: "Commodities",
  pageDescription: "Transportation commodities master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportCommodities,
  normalize: (payload) => {
    if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
    if (payload.hsn_code) payload.hsn_code = String(payload.hsn_code).trim();
  },
  fields: [
    { key: "code", label: "Code" },
    { key: "name", label: "Name", required: true },
    { key: "hsn_code", label: "HSN Code" }
  ]
});
