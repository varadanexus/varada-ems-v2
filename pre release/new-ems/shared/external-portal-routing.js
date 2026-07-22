import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";

const PORTALS = [
  { key: "legal-advocate", sourceModule: "legal", accessScope: "legal_advocate_portal", title: "Legal Advocate Portal", description: "Review legal documents, submit comments and request revisions.", badge: "Legal", icon: "LA", route: () => ROUTES.LEGAL_ADVOCATE_PORTAL },
  { key: "interiors-architect", sourceModule: "interiors", accessScope: "interiors_architect_portal", title: "Interiors Architect Portal", description: "Review designs, project documents and assigned interiors work.", badge: "Interiors", icon: "IA", route: () => ROUTES.INTERIORS_ARCHITECT_PORTAL },
  { key: "interiors-client", sourceModule: "interiors", accessScope: "interiors_client_portal", title: "Interiors Client Portal", description: "Track projects, designs, approvals and site updates.", badge: "Interiors", icon: "IC", route: () => ROUTES.INTERIORS_CLIENT_APP },
  { key: "marketing-client", sourceModule: "digital-services", accessScope: "marketing_client_portal", title: "Marketing Client Portal", description: "View campaigns, deliverables, approvals and reports.", badge: "Digital Services", icon: "MC", route: () => ROUTES.MARKETING_CLIENT_PORTAL },
  { key: "marketing-vendor", sourceModule: "digital-services", accessScope: "marketing_vendor_portal", title: "Marketing Delivery Portal", description: "Access assigned delivery work and collaboration items.", badge: "Digital Services", icon: "MD", route: () => ROUTES.MARKETING_VENDOR_PORTAL }
];

export function externalPortalOptions(accessRows = []) {
  return PORTALS.flatMap((portal) => {
    const matching = accessRows.filter((row) => row.source_module === portal.sourceModule && row.access_scope === portal.accessScope);
    if (!matching.length) return [];
    return [{ ...portal, route: portal.route(), accessCount: matching.length }];
  });
}

export async function loadExternalPortalOptions(sessionToken) {
  const { data, error } = await getSupabaseClient().rpc("external_portal_list_my_access", { p_session_token: sessionToken });
  if (error) throw error;
  return externalPortalOptions(Array.isArray(data) ? data : []);
}

export async function redirectExternalPortalSession(sessionToken) {
  const portals = await loadExternalPortalOptions(sessionToken);
  if (portals.length > 1) {
    window.location.assign(ROUTES.EXTERNAL_PORTAL_SELECTOR);
    return true;
  }
  if (portals.length === 1) {
    window.location.assign(portals[0].route);
    return true;
  }
  return false;
}
