import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_CONTRACTORS,
  pageTitle: "Contractors",
  pageDescription: "Master contractors management",
  table: MASTER_TABLES.contractors,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "gstin", label: "GSTIN" }
  ]
});
