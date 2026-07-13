import { MODULES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.MASTER_DOCUMENT_TYPES,
  pageTitle: "Document Types",
  pageDescription: "Master document type management",
  table: MASTER_TABLES.documentTypes,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true }
  ]
});
