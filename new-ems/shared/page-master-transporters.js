import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_TRANSPORTERS,
  pageTitle: "Transporters",
  pageDescription: "Master transporters management",
  table: MASTER_TABLES.transporters,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "contact_no", label: "Contact No" }
  ]
});
