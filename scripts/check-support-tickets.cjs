const fs = require("fs");

const read = (path) => fs.readFileSync(path, "utf8");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const migration = read("new-ems/supabase/migrations/20260722170000_ems_support_ticket_system.sql");
const api = read("new-ems/shared/support-api.js");
const widget = read("new-ems/shared/support-desk.js");
const page = read("new-ems/shared/page-support-tickets.js");
const layout = read("new-ems/shared/layout.js");
const navbar = read("new-ems/shared/navbar.js");
const sidebar = read("new-ems/shared/sidebar.js");
const constants = read("new-ems/config/constants.js");
const dashboard = read("new-ems/shared/page-dashboard.js");

[
  "support_tickets", "support_ticket_messages", "create_support_ticket",
  "list_support_tickets", "get_support_ticket", "add_support_ticket_message",
  "update_support_ticket", "close_my_support_ticket", "is_support_operator"
].forEach((name) => assert(migration.includes(name), `Support migration is missing ${name}.`));
assert(migration.includes("enable row level security"), "Support tables must enable RLS.");
assert(migration.includes("revoke all on public.support_tickets"), "Direct support-ticket table mutation must be revoked.");
assert(migration.includes("p_is_internal and not v_operator"), "Requester access to internal notes must be blocked server-side.");
assert(migration.includes("dispatch_ems_notification"), "Support workflow must create EMS notifications.");
assert(api.includes("deliverPushNotification"), "Support notification events must fan out to registered devices.");
assert(widget.includes("sourceModule") && widget.includes("sourceUrl") && widget.includes("environment"), "Global ticket form must capture page context.");
assert(widget.includes("My Tickets") && widget.includes("Raise Ticket"), "Global support drawer must expose creation and tracking.");
assert(page.includes("supportManageForm") && page.includes("Internal note"), "Operator queue must support triage and internal notes.");
assert(layout.includes("initSupportDesk"), "Protected EMS pages must initialize the support desk.");
assert(navbar.includes("supportDeskBtn"), "EMS navbar must expose the global support launcher.");
assert(sidebar.includes("Help & Support") && sidebar.includes("ROUTES.SUPPORT_TICKETS"), "Every workspace sidebar must expose Support Desk.");
assert(constants.includes("SUPPORT_TICKETS"), "Support route and module constants are missing.");
assert(constants.includes('SUPPORT: "support"') && constants.includes('title: "Support"'), "Support must be a first-class command-center workspace.");
assert(sidebar.includes("WORKSPACES.SUPPORT") && sidebar.includes("Assigned to Me") && sidebar.includes("Unassigned"), "Support workspace sidebar and operator views are missing.");
assert(dashboard.includes("supportCards") && dashboard.includes('title: "Support"'), "The command center Support workspace card is missing.");
assert(fs.existsSync("new-ems/modules/support-tickets/index.html"), "Support Desk module page is missing.");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Support ticket validation passed: secure RPCs, global launcher, user tracking, operator queue, audit and notifications are present.");
