import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_ROUTES,
  pageTitle: "Routes",
  pageDescription: "Master routes management",
  table: MASTER_TABLES.routes,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "from_location", label: "From", required: true },
    { key: "to_location", label: "To", required: true },
    { key: "distance_km", label: "Distance KM" }
  ]
});
