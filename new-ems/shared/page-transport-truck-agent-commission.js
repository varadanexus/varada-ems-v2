import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { existsActiveDuplicate, MASTER_TABLES } from "./admin-api.js";
import { initMasterDataPage } from "./page-master-data.js";

initMasterDataPage({
  moduleCode: MODULES.TRANSPORT_TRUCK_AGENT_COMMISSION_MAPPING,
  pageTitle: "Truck-Agent Commission Mapping",
  pageDescription: "Configure truck to agent commission mapping (no calculation)",
  workspace: WORKSPACES.TRANSPORTATION,
  table: MASTER_TABLES.transportTruckAgentCommissionMapping,
  searchColumns: ["name", "code", "commission_type"],
  uniqueChecks: [
    { keys: ["division_id", "truck_id", "transport_agent_id", "commission_type", "effective_from"], message: "Duplicate active mapping exists for same truck/agent/type/effective date." }
  ],
  validate: async (payload, context) => {
    if (!payload.truck_id) return "Truck is required.";
    if (!payload.transport_agent_id) return "Agent is required.";
    if (!payload.commission_type) return "Commission type is required.";
    if (payload.commission_value === undefined || payload.commission_value === null || payload.commission_value === "") return "Commission value is required.";
    if (Number(payload.commission_value) < 0) return "Commission value must be zero or positive.";
    if (!payload.effective_from) return "Effective From is required.";
    if (payload.effective_to && payload.effective_from && new Date(payload.effective_to) < new Date(payload.effective_from)) return "Effective To cannot be before Effective From.";

    const dup = await existsActiveDuplicate(
      MASTER_TABLES.transportTruckAgentCommissionMapping,
      {
        division_id: payload.division_id,
        truck_id: payload.truck_id,
        transport_agent_id: payload.transport_agent_id,
        commission_type: payload.commission_type,
        effective_from: payload.effective_from
      },
      context?.id || null
    );
    if (dup) return "Duplicate active mapping exists for same truck/agent/type/effective date.";
    return null;
  },
  normalize: (payload) => {
    if (payload.code) payload.code = String(payload.code).toUpperCase().trim();
    if (payload.commission_type) payload.commission_type = String(payload.commission_type).toLowerCase().trim();
  },
  fields: [
    { key: "division_id", label: "Business Division", required: true, type: "select", optionTable: "divisions", optionLabel: "name", divisionScoped: false },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "truck_id", label: "Truck", required: true, type: "select", optionTable: "transport_trucks", optionLabel: "name", divisionScoped: true },
    { key: "transport_agent_id", label: "Agent", required: true, type: "select", optionTable: "transport_agents", optionLabel: "name", divisionScoped: true },
    {
      key: "commission_type",
      label: "Commission Type",
      required: true,
      type: "select",
      options: [
        { value: "per_mt", label: "Per MT" },
        { value: "percentage_margin", label: "Percentage of Margin" },
        { value: "fixed_per_trip", label: "Fixed Per Trip" }
      ]
    },
    { key: "commission_value", label: "Commission Value", required: true },
    { key: "effective_from", label: "Effective From (YYYY-MM-DD)", required: true },
    { key: "effective_to", label: "Effective To (YYYY-MM-DD)" }
  ]
});
