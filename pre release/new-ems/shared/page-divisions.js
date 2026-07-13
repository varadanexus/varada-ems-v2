import { MODULES, WORKSPACES } from "../config/constants.js";
import { MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.DIVISIONS,
  pageTitle: "Divisions",
  pageDescription: "Division management",
  workspace: WORKSPACES.ADMIN,
  table: MASTER_TABLES.divisions,
  divisionScoped: false,
  fields: [
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true }
  ]
});
