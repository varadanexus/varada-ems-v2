import { MODULES } from "../config/constants.js";
import { renderInteriorsPlaceholderPage } from "./page-interiors-placeholder-base.js";

renderInteriorsPlaceholderPage({
  moduleCode: MODULES.INTERIORS_LEADS,
  pageTitle: "Leads",
  pageDescription: "Capture and track new Interiors enquiries before they become clients or projects.",
  icon: "LD",
  sections: [
    { title: "Lead Register", description: "Future lead capture, follow-up, source tracking, and conversion to client/project." },
    { title: "Conversion Workflow", description: "This page will later support moving approved leads into Interiors Clients and Projects." }
  ]
}).catch(console.error);