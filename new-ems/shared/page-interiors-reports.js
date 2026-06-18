import { MODULES } from "../config/constants.js";
import { renderInteriorsPlaceholderPage } from "./page-interiors-placeholder-base.js";

renderInteriorsPlaceholderPage({
  moduleCode: MODULES.INTERIORS_REPORTS,
  pageTitle: "Reports",
  pageDescription: "Business-friendly reporting for project progress, approvals, workload, and billing readiness.",
  icon: "RP",
  sections: [
    { title: "Project Status Reporting", description: "Future views for active, delayed, completed, and approval-pending projects." },
    { title: "Commercial Reporting", description: "Future cost estimate, client quote, change, and billing readiness summaries." }
  ]
}).catch(console.error);