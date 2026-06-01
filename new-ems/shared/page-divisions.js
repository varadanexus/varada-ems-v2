import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.DIVISIONS,
  pageTitle: "Divisions",
  pageDescription: "Division management",
  table: MASTER_TABLES.divisions,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true }
  ]
});
