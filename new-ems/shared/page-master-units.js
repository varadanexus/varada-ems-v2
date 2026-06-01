import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_UNITS,
  pageTitle: "Units",
  pageDescription: "Master units management",
  table: MASTER_TABLES.units,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true }
  ]
});
