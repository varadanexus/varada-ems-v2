import { MODULES, WORKSPACES } from "../config/constants.js";
import { existsActiveDuplicate, MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_RATE_MASTER,
  pageTitle: "Rate Master",
  pageDescription: "Transportation rate master",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportRateMaster,
  validate: async (payload, context) => {
    if (!payload.effective_from) return "Effective From is required.";
    if (payload.rate_type === "company" && payload.rate_per_mt && payload.transporter_rate_per_mt && Number(payload.rate_per_mt) < Number(payload.transporter_rate_per_mt)) {
      return "Company rate must be greater than or equal to transporter rate.";
    }
    const dup = await existsActiveDuplicate(
      MASTER_TABLES.transportRateMaster,
      {
        division_id: payload.division_id,
        route_id: payload.route_id,
        commodity_id: payload.commodity_id,
        client_id: payload.client_id,
        transporter_id: payload.transporter_id,
        effective_from: payload.effective_from
      },
      context?.id || null
    );
    if (dup) return "Duplicate active rate exists for same route/commodity/client/transporter/effective date.";
    return null;
  },
  fields: [
    { key: "division_id", label: "Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code", required: true },
    { key: "name", label: "Name", required: true },
    { key: "rate_type", label: "Rate Type", required: true },
    { key: "client_id", label: "Client", type: "select", optionTable: "master_clients", optionLabel: "name", divisionScoped: true },
    { key: "transporter_id", label: "Transporter", type: "select", optionTable: "master_transporters", optionLabel: "name", divisionScoped: true },
    { key: "route_id", label: "Route", type: "select", optionTable: "transport_route_master", optionLabel: "name", divisionScoped: true },
    { key: "commodity_id", label: "Commodity", type: "select", optionTable: "master_commodities", optionLabel: "name", divisionScoped: true },
    { key: "rate_per_mt", label: "Rate Per MT" },
    { key: "effective_from", label: "Effective From (YYYY-MM-DD)" },
    { key: "effective_to", label: "Effective To (YYYY-MM-DD)" }
  ]
});
