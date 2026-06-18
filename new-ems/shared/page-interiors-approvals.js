import { MODULES } from "../config/constants.js";
import { renderInteriorsPlaceholderPage } from "./page-interiors-placeholder-base.js";

renderInteriorsPlaceholderPage({
  moduleCode: MODULES.INTERIORS_APPROVALS,
  pageTitle: "Approvals",
  pageDescription: "Track design approvals, client quote approvals, and project changes in one simple place.",
  icon: "AP",
  sections: [
    { title: "Design Approvals", description: "Future queue for render/design signoff." },
    { title: "Client Quote Approvals", description: "Reuse existing quote and change logic through project detail while keeping the user experience simple." },
    { title: "Project Changes", description: "Existing Project Change and Approved Change records remain available internally." }
  ]
}).catch(console.error);