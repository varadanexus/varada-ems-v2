import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_COMMODITIES,
  pageTitle: "Commodities",
  pageDescription: "Master commodities management",
  table: MASTER_TABLES.commodities,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "hsn_code", label: "HSN Code" }
  ]
});
