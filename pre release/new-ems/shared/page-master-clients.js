import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_CLIENTS,
  pageTitle: "Clients",
  pageDescription: "Master clients management",
  table: MASTER_TABLES.clients,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "gstin", label: "GSTIN" }
  ]
});
