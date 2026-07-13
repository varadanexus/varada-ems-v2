import { MODULES } from "../config/constants.js";
import { renderInteriorsPlaceholderPage } from "./page-interiors-placeholder-base.js";

renderInteriorsPlaceholderPage({
  moduleCode: MODULES.INTERIORS_SETTINGS,
  pageTitle: "Settings",
  pageDescription: "Configure Interiors numbering, templates, UI language, and future division-aware account mapping without starting posting logic.",
  icon: "ST",
  sections: [
    { title: "Numbering", description: "Future auto-code controls for clients, projects, quotes, bills, and project changes." },
    { title: "Account Mapping", description: "Future division-aware account configuration for Interiors operational accounts only." }
  ]
}).catch(console.error);