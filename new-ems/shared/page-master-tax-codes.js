import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_TAX_CODES,
  pageTitle: "Tax Codes",
  pageDescription: "Master tax code management",
  table: MASTER_TABLES.taxCodes,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "description", label: "Description" },
    { key: "cgst_rate", label: "CGST %" },
    { key: "sgst_rate", label: "SGST %" },
    { key: "igst_rate", label: "IGST %" }
  ]
});
