const flowSvg = (content) => `<svg class="wp-flow-icon" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
const ICONS = {
  start: flowSvg(`<path d="m13 2-7 11h6l-1 9 7-12h-6z"></path>`),
  message: flowSvg(`<path d="M4 5h16v11H8l-4 4z"></path><path d="M8 9h8M8 12h6"></path>`),
  media: flowSvg(`<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 15-5-4L5 20"></path>`),
  list: flowSvg(`<path d="M9 6h11M9 12h11M9 18h11"></path><circle cx="5" cy="6" r="1"></circle><circle cx="5" cy="12" r="1"></circle><circle cx="5" cy="18" r="1"></circle>`),
  catalog: flowSvg(`<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>`),
  single_product: flowSvg(`<path d="M4 7h16l-2 11H6z"></path><path d="M8 7V5a4 4 0 0 1 8 0v2"></path>`),
  multi_product: flowSvg(`<path d="M3 8h8l-1 10H4zM13 8h8l-1 10h-6z"></path><path d="M5 8V6a3 3 0 0 1 6 0v2M15 8V6a3 3 0 0 1 6 0v2"></path>`),
  template: flowSvg(`<path d="M4 3h16v18H4z"></path><path d="M8 8h8M8 12h8M8 16h5"></path><path d="m16 2 1.2 2.3L20 5.5l-2.8 1.2L16 9l-1.2-2.3L12 5.5l2.8-1.2z"></path>`),
  question: flowSvg(`<circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.5 2.5 0 1 1 3.1 2.4c-.8.3-.8.9-.8 1.6M12 17h.01"></path>`),
  address: flowSvg(`<path d="M3 10 12 3l9 7"></path><path d="M5 9v11h14V9M9 20v-6h6v6"></path>`),
  location: flowSvg(`<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"></path><circle cx="12" cy="10" r="2.5"></circle>`),
  ask_media: flowSvg(`<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="m7 15 3-3 3 3 2-2 4 4"></path><path d="M12 7v4M10 9h4"></path>`),
  condition: flowSvg(`<path d="M6 3v5a4 4 0 0 0 4 4h8"></path><path d="m15 9 3 3-3 3"></path><path d="M6 21v-5a4 4 0 0 1 4-4"></path>`),
  api: flowSvg(`<path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14"></path>`),
  attribute: flowSvg(`<path d="M4 6h16M4 12h16M4 18h16"></path><circle cx="9" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="11" cy="18" r="2"></circle>`),
  tag: flowSvg(`<path d="M20 13 13 20 4 11V4h7z"></path><circle cx="8" cy="8" r="1.5"></circle>`),
  handoff: flowSvg(`<circle cx="8" cy="8" r="3"></circle><path d="M3 20v-2a5 5 0 0 1 10 0v2M14 8h7M18 5l3 3-3 3"></path>`),
  connect: flowSvg(`<circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M8 6h3a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h1"></path>`),
  delay: flowSvg(`<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>`),
  end: flowSvg(`<rect x="5" y="5" width="14" height="14" rx="2"></rect>`),
};
const BLOCKS = [
  ["message", ICONS.message, "Text & buttons", "Message types"], ["media", ICONS.media, "Media message", "Message types"],
  ["list", ICONS.list, "List", "Message types"], ["catalog", ICONS.catalog, "Catalogue", "Message types"],
  ["single_product", ICONS.single_product, "Single product", "Message types"], ["multi_product", ICONS.multi_product, "Multi product", "Message types"],
  ["template", ICONS.template, "Approved template", "Message types"], ["question", ICONS.question, "Ask question", "Actions"],
  ["address", ICONS.address, "Ask address", "Actions"], ["location", ICONS.location, "Ask location", "Actions"],
  ["ask_media", ICONS.ask_media, "Ask media", "Actions"], ["condition", ICONS.condition, "Condition", "Actions"],
  ["api", ICONS.api, "API request", "Actions"], ["attribute", ICONS.attribute, "Set attribute", "Actions"],
  ["tag", ICONS.tag, "Add tag", "Actions"], ["handoff", ICONS.handoff, "Human handoff", "Actions"],
  ["connect", ICONS.connect, "Connect flow", "Actions"], ["delay", ICONS.delay, "Delay", "Actions"], ["end", ICONS.end, "End flow", "Actions"],
];

const DEFAULT_COPY = {
  start: "When a customer matches this trigger", message: "Type the message your customer will receive.", media: "Send an image, video or document.",
  list: "Present a structured list of choices.", catalog: "Share products from your connected catalogue.", single_product: "Show one product from a connected catalogue.", multi_product: "Present a curated set of catalogue products.", template: "Send an approved WhatsApp message template.", question: "Ask a question and save the answer.", address: "Collect and save the customer's address.", location: "Ask the customer to share a location.", ask_media: "Request an image, video or document from the customer.",
  condition: "Branch based on an answer or customer attribute.", api: "Call a secure external endpoint.", attribute: "Save a value to the customer profile.",
  tag: "Add a tag for segmentation.", handoff: "Transfer this conversation to a team member.", connect: "Continue in another flow.", delay: "Wait before continuing.", end: "Finish this automation."
};

function starterNodes() {
  return [{ id: crypto.randomUUID(), type: "start", title: "Flow start", body: DEFAULT_COPY.start, x: 80, y: 90 }];
}

function iconFor(type) { return type === "start" ? ICONS.start : BLOCKS.find((item) => item[0] === type)?.[1] || ICONS.message; }

function blockLabelFor(node) {
  if (node.type === "start") return "Trigger";
  if (["message", "media", "list", "catalog", "single_product", "multi_product", "template"].includes(node.type)) return "Message block";
  if (["question", "address", "location", "ask_media"].includes(node.type)) return "Input block";
  if (node.type === "condition") return "Branch block";
  if (["api", "attribute", "tag", "handoff", "connect", "delay", "end"].includes(node.type)) return "Action block";
  return "Flow block";
}
const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="10" rx="2"></rect><path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"></path></svg>`;
const DELETE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"></path><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"></path></svg>`;
const FLOW_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="12" r="2"></circle><circle cx="6" cy="18" r="2"></circle><path d="M8 6h3a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3h-1"></path><path d="M8 18h3a3 3 0 0 0 3-3v0a3 3 0 0 1 3-3h-1"></path></svg>`;
const EDIT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`;
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>`;
const BACK_ICON = flowSvg(`<path d="m15 18-6-6 6-6"></path>`);
const MORE_ICON = flowSvg(`<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>`);
const CLOSE_ICON = flowSvg(`<path d="m6 6 12 12M18 6 6 18"></path>`);
const ARRANGE_ICON = flowSvg(`<rect x="3" y="4" width="7" height="6" rx="1"></rect><rect x="14" y="14" width="7" height="6" rx="1"></rect><path d="M10 7h4a3 3 0 0 1 3 3v4"></path>`);
const FIT_ICON = flowSvg(`<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"></path>`);
const MINUS_ICON = flowSvg(`<path d="M5 12h14"></path>`);
const CANVAS_LIMIT = 10000;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 190;
const PALETTE_COLLAPSED_KEY = "vn_whatsapp_flow_palette_collapsed";
const getWorldBounds = (nodes = []) => {
  const xs = nodes.flatMap((node) => [Number(node.x || 0), Number(node.x || 0) + NODE_WIDTH]);
  const ys = nodes.flatMap((node) => [Number(node.y || 0), Number(node.y || 0) + NODE_HEIGHT]);
  const left = Math.min(-CANVAS_LIMIT, ...xs) - 600;
  const top = Math.min(-CANVAS_LIMIT, ...ys) - 600;
  const right = Math.max(CANVAS_LIMIT, ...xs) + 600;
  const bottom = Math.max(CANVAS_LIMIT, ...ys) + 600;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};
function statusLabel(value) { return value === "active" ? "Active" : value === "paused" ? "Paused" : "Draft"; }
function fieldValue(node, name, fallback = "") {
  if (name === "body") return node.body || "";
  return node.config?.[name] ?? fallback;
}
function buttonValues(node) {
  return (Array.isArray(node.config?.buttons) ? node.config.buttons : []).map((button) => {
    if (typeof button === "string") return { label: button, next: "" };
    return { label: button?.label || "", next: button?.next || "" };
  });
}
function nodeOptions(nodes, escapeHtml, selected = "") {
  return `<option value="" ${!selected ? "selected" : ""}>No route selected</option>${nodes.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title || item.type)}</option>`).join("")}`;
}
function renderQuickButtons(node, escapeHtml, nodes = []) {
  const buttons = buttonValues(node);
  return `<div class="wp-flow-inline-buttons"><span>Reply buttons</span>${buttons.map((button, index) => {
    const needsRoute = Boolean(button.label?.trim()) && !button.next;
    return `<label class="${button.next ? "has-route" : ""} ${needsRoute ? "needs-route" : ""}"><input data-node-button-label="${index}" maxlength="20" value="${escapeHtml(button.label)}" placeholder="Button ${index + 1}" /><select class="wp-flow-route-select" data-node-button-next="${index}" title="Route this button">${nodeOptions(nodes, escapeHtml, button.next)}</select><i class="wp-flow-button-port ${button.next ? "connected" : ""}" data-flow-button-port="${index}" role="button" tabindex="0" title="${button.next ? "Drag to change this route" : "Drag to connect this button"}"></i><button type="button" data-flow-remove-button="${index}" aria-label="Remove button">${CLOSE_ICON}</button>${needsRoute ? `<small class="wp-flow-route-warning">Connect this reply</small>` : ""}</label>`;
  }).join("")}<button type="button" data-flow-add-button>${PLUS_ICON}<span>Add button</span></button></div>`;
}
function templateMessagePreview(template) {
  const components = Array.isArray(template?.components) ? template.components : [];
  return components.map((component) => {
    const type = String(component?.type || "").toUpperCase();
    if (["HEADER", "BODY", "FOOTER"].includes(type)) return String(component?.text || "").trim();
    return "";
  }).filter(Boolean).join("\n\n").trim();
}
function templateButtonLabels(template) {
  return (Array.isArray(template?.components) ? template.components : [])
    .filter((component) => String(component?.type || "").toUpperCase() === "BUTTONS")
    .flatMap((component) => Array.isArray(component?.buttons) ? component.buttons : [])
    .map((button) => String(button?.text || "").trim()).filter(Boolean).slice(0, 10);
}
function renderNodeFields(node, escapeHtml, nodes = [], templates = []) {
  const config = node.config || {};
  if (node.type === "start") {
    return `<div class="wp-flow-inline-editor"><label><span>Keyword trigger</span><input data-node-field="keywords" maxlength="240" placeholder="Type, press enter to add keyword" value="${escapeHtml(fieldValue(node, "keywords"))}" /></label><label><span>Regex trigger</span><input data-node-field="regex" maxlength="240" placeholder="Enter regex to match substring trigger" value="${escapeHtml(fieldValue(node, "regex"))}" /></label><label class="wp-flow-inline-check"><input data-node-field="caseSensitive" type="checkbox" ${config.caseSensitive ? "checked" : ""} /><span>Case sensitive</span></label><div class="wp-flow-inline-note"><strong>Begin flow with</strong><button type="button" data-flow-add-next="template">Approved template</button><button type="button" data-flow-add-next="message">Message</button></div></div>`;
  }
  if (node.type === "media" || node.type === "ask_media") {
    return `<div class="wp-flow-inline-editor"><label><span>Trigger phrases</span><input data-node-field="aiKeywords" maxlength="240" placeholder="Optional phrases for this block" value="${escapeHtml(fieldValue(node, "aiKeywords"))}" /></label><label><span>Media type</span><select data-node-field="mediaType"><option value="image" ${config.mediaType === "image" ? "selected" : ""}>Image</option><option value="video" ${config.mediaType === "video" ? "selected" : ""}>Video</option><option value="document" ${config.mediaType === "document" ? "selected" : ""}>Document</option></select></label><label><span>Media URL</span><input data-node-field="mediaUrl" type="url" placeholder="Paste secure media URL" value="${escapeHtml(fieldValue(node, "mediaUrl"))}" /></label><label><span>Caption</span><textarea data-node-field="body" maxlength="1024" placeholder="Caption...">${escapeHtml(node.body || "")}</textarea><em data-flow-count>${Number((node.body || "").length)}/1024</em></label>${renderQuickButtons(node, escapeHtml, nodes)}</div>`;
  }
  if (node.type === "condition") {
    return `<div class="wp-flow-inline-editor"><label><span>Condition</span><input data-node-field="expression" maxlength="240" placeholder="customer.intent equals pricing" value="${escapeHtml(fieldValue(node, "expression"))}" /></label><div class="wp-flow-branches"><label><span>Yes branch label</span><input data-node-field="yesLabel" maxlength="32" value="${escapeHtml(fieldValue(node, "yesLabel", "Yes"))}" /></label><label><span>No branch label</span><input data-node-field="noLabel" maxlength="32" value="${escapeHtml(fieldValue(node, "noLabel", "No"))}" /></label></div><label><span>Fallback instruction</span><textarea data-node-field="body" maxlength="1024" placeholder="What should happen when no branch matches?">${escapeHtml(node.body || "")}</textarea></label><div class="wp-flow-inline-note"><strong>Branch actions</strong><button type="button" data-flow-add-next="message">Add yes path</button><button type="button" data-flow-add-next="handoff">Add handoff path</button></div></div>`;
  }
  if (node.type === "api") {
    return `<div class="wp-flow-inline-editor"><label><span>Method</span><select data-node-field="method"><option value="POST" ${config.method !== "GET" ? "selected" : ""}>POST</option><option value="GET" ${config.method === "GET" ? "selected" : ""}>GET</option></select></label><label><span>HTTPS endpoint</span><input data-node-field="endpoint" type="url" placeholder="https://api.example.com/orders" value="${escapeHtml(fieldValue(node, "endpoint"))}" /></label><label><span>Notes</span><textarea data-node-field="body" maxlength="1024">${escapeHtml(node.body || "")}</textarea></label></div>`;
  }
  if (node.type === "delay") {
    return `<div class="wp-flow-inline-editor"><label><span>Delay</span><input data-node-field="seconds" type="number" min="1" max="86400" placeholder="Type delay in seconds..." value="${escapeHtml(fieldValue(node, "seconds", "60"))}" /></label><label><span>Instruction</span><textarea data-node-field="body" maxlength="1024">${escapeHtml(node.body || "")}</textarea></label></div>`;
  }
  if (node.type === "template") {
    const approved = templates.filter((template) => String(template?.status || "").toUpperCase() === "APPROVED");
    const selected = approved.find((template) => String(template.integrationId || "") === String(config.templateIntegrationId || ""))
      || approved.find((template) => template.name === config.templateName && template.language === config.templateLanguage)
      || null;
    const preview = selected ? templateMessagePreview(selected) : "";
    const buttons = selected ? templateButtonLabels(selected) : [];
    return `<div class="wp-flow-inline-editor wp-flow-template-editor"><label><span>Approved template</span><select data-flow-template-select ${approved.length ? "" : "disabled"}><option value="">${approved.length ? "Select a template" : "No approved templates available"}</option>${approved.map((template) => `<option value="${escapeHtml(String(template.integrationId || `${template.name}|${template.language}`))}" ${(selected?.integrationId && selected.integrationId === template.integrationId) || (!selected?.integrationId && selected?.name === template.name && selected?.language === template.language) ? "selected" : ""}>${escapeHtml(template.name)} · ${escapeHtml(template.language)}</option>`).join("")}</select><small>${approved.length ? `${approved.length} approved template${approved.length === 1 ? "" : "s"} available for this number.` : "Approve a WhatsApp template to use this block."}</small></label>${selected ? `<section class="wp-flow-template-preview"><header><div><strong>${escapeHtml(selected.name)}</strong><span>${escapeHtml(selected.language)} · ${escapeHtml(selected.category || "Template")}</span></div><em>Approved</em></header><p>${escapeHtml(preview || "Template content is available from Meta.")}</p>${buttons.length ? `<footer>${buttons.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</footer>` : ""}</section>` : `<div class="wp-flow-template-empty"><strong>Choose a template</strong><span>Its content and buttons will appear here.</span></div>`}</div>`;
  }
  if (["question", "address", "location", "attribute", "tag", "connect", "handoff", "end"].includes(node.type)) {
    return `<div class="wp-flow-inline-editor"><label><span>${node.type === "handoff" ? "Team note" : node.type === "connect" ? "Flow name" : node.type === "tag" ? "Tag name" : node.type === "attribute" ? "Attribute name" : "Prompt"}</span><input data-node-field="target" maxlength="120" placeholder="${escapeHtml(DEFAULT_COPY[node.type])}" value="${escapeHtml(fieldValue(node, "target"))}" /></label><label><span>Message</span><textarea data-node-field="body" maxlength="1024" placeholder="Type message...">${escapeHtml(node.body || "")}</textarea><em data-flow-count>${Number((node.body || "").length)}/1024</em></label></div>`;
  }
  return `<div class="wp-flow-inline-editor"><label><span>Trigger phrases</span><input data-node-field="aiKeywords" maxlength="240" placeholder="Optional phrases for this block" value="${escapeHtml(fieldValue(node, "aiKeywords"))}" /></label><label><span>Message body</span><textarea data-node-field="body" maxlength="1024" placeholder="Type message...">${escapeHtml(node.body || "")}</textarea><em data-flow-count>${Number((node.body || "").length)}/1024</em></label>${renderQuickButtons(node, escapeHtml, nodes)}<label><span>Delay</span><input data-node-field="seconds" type="number" min="0" max="86400" placeholder="Type delay in seconds..." value="${escapeHtml(fieldValue(node, "seconds"))}" /></label><label class="wp-flow-inline-check"><input data-node-field="timeoutEnabled" type="checkbox" ${config.timeoutEnabled ? "checked" : ""} /><span>Set timeout</span></label></div>`;
}

export function renderFlowsView({ flows = [], escapeHtml }) {
  const active = flows.filter((flow) => flow.status === "active").length;
  const drafts = flows.filter((flow) => flow.status === "draft").length;
  const cards = flows.map((flow) => `<article class="wp-flow-row" data-flow-row data-flow-id="${escapeHtml(flow.id)}"><div class="wp-flow-row-icon">${FLOW_ICON}</div><div><strong>${escapeHtml(flow.name)}</strong><p>${escapeHtml(flow.description || "Visual WhatsApp customer journey")}</p><footer><span>${escapeHtml(String(flow.trigger_type || "keyword").replaceAll("_", " "))} trigger</span><span>${Number(flow.nodes?.length || 0)} blocks</span><span>Updated ${escapeHtml(new Date(flow.updated_at).toLocaleDateString("en-IN"))}</span></footer></div><label class="wp-flow-status-switch"><input type="checkbox" data-flow-toggle ${flow.status === "active" ? "checked" : ""} /><span></span><em>${statusLabel(flow.status)}</em></label><div class="wp-flow-row-actions"><button class="wp-secondary" type="button" data-flow-duplicate>${COPY_ICON}<span>Duplicate</span></button><button class="wp-secondary" type="button" data-flow-edit>${EDIT_ICON}<span>Edit</span></button><button class="wp-icon-danger" type="button" data-flow-delete aria-label="Delete ${escapeHtml(flow.name)}">${DELETE_ICON}</button></div></article>`).join("");
  return `<section class="wp-route-page wp-flows-page"><div class="wp-route-heading"><div><span class="wp-kicker">No-code automation</span><h1>Flows</h1><p>Design chatbot journeys, qualify leads and automate support with a visual drag-and-drop builder.</p></div><button class="wp-primary wp-button-with-icon" id="wpCreateFlowBtn" type="button">${PLUS_ICON}<span>Create flow</span></button></div><section class="wp-flow-summary"><article><span>Total flows</span><strong>${flows.length}</strong><small>Across this workspace</small></article><article><span>Active</span><strong>${active}</strong><small>Enabled in this workspace</small></article><article><span>Drafts</span><strong>${drafts}</strong><small>Ready to continue</small></article><article class="wp-flow-guide"><span>Quick guide</span><strong>Build → test → activate</strong><small>Start with a trigger, connect content and finish with an outcome.</small></article></section><section class="wp-card wp-flow-library"><header><div><span class="wp-card-eyebrow">Your automations</span><h2>Chatbot flows</h2></div><label class="wp-inbox-search"><span>${SEARCH_ICON}</span><input type="search" placeholder="Search flows" data-flow-search /></label></header><div class="wp-flow-list">${cards || `<div class="wp-inbox-empty"><span class="wp-flow-empty-icon">${FLOW_ICON}</span><strong>No flows yet</strong><p>Create your first visual WhatsApp automation without writing code.</p><button class="wp-primary wp-button-with-icon" type="button" data-flow-empty-create>${PLUS_ICON}<span>Create flow</span></button></div>`}</div></section></section>`;
}

export function renderFlowBuilderPage({ escapeHtml }) {
  return `<section class="wp-flow-builder-route">${builderSurface(escapeHtml)}</section>`;
}

function builderSurface(escapeHtml) {
  const groups = ["Message types", "Actions"].map((group) => `<section class="wp-flow-palette-group"><h3>${group}</h3><div>${BLOCKS.filter((item) => item[3] === group).map(([type, icon, label]) => `<button type="button" draggable="true" data-flow-block="${type}"><i>${icon}</i><span>${escapeHtml(label)}</span></button>`).join("")}</div></section>`).join("");
  return `<div class="wp-flow-builder-dialog" id="wpFlowBuilderDialog" data-flow-builder-surface><form novalidate><header class="wp-flow-builder-top"><button type="button" class="wp-flow-back" aria-label="Back to flows" data-flow-exit>${BACK_ICON}</button><div><input name="name" maxlength="120" value="Untitled flow" aria-label="Flow name" /><small data-flow-save-state>Draft not saved</small></div><label class="wp-flow-active-switch"><span>Inactive</span><input name="active" type="checkbox" /><i></i><strong>Active</strong></label><button class="wp-secondary" type="button" data-flow-settings>Triggers &amp; fallback</button><button class="wp-primary" type="submit" value="save">Save changes</button></header><div class="wp-flow-builder-shell"><aside class="wp-flow-palette"><div class="wp-flow-builder-tabs"><button class="active" type="button" data-flow-tab="builder">Builder</button><button type="button" data-flow-tab="live">Live view</button></div><div data-flow-panel="builder">${groups}</div><div class="wp-flow-live-panel" data-flow-panel="live" hidden><h3>Live flow test</h3><p>Preview how a customer will experience this automation before saving or activating it.</p><button type="button" class="wp-primary" data-flow-live-start>Start preview</button><div class="wp-flow-live-phone" data-flow-live-phone><header><span>WhatsApp</span><strong>Customer preview</strong></header><main data-flow-live-messages><div class="wp-flow-live-empty">Press Start preview to run this flow.</div></main><footer><input value="Customer reply…" readonly /></footer></div></div></aside><button class="wp-flow-palette-toggle" type="button" data-flow-palette-toggle aria-label="Collapse builder sidebar" aria-expanded="true">›</button><main class="wp-flow-canvas" data-flow-canvas><div class="wp-flow-canvas-grid"></div><svg aria-hidden="true" data-flow-lines></svg><div class="wp-flow-edge-controls" data-flow-edge-controls></div><div class="wp-flow-nodes" data-flow-nodes></div><div class="wp-flow-connect-menu" data-flow-connect-menu hidden></div><div class="wp-flow-zoom"><button type="button" data-flow-arrange title="Arrange connected blocks">${ARRANGE_ICON}<span>Arrange</span></button><button type="button" data-flow-zoom="in" aria-label="Zoom in">${PLUS_ICON}</button><button type="button" data-flow-zoom="out" aria-label="Zoom out">${MINUS_ICON}</button><button type="button" data-flow-fit title="Fit flow to canvas">${FIT_ICON}<span>Fit</span></button></div></main></div></form></div><dialog class="wp-flow-settings-dialog" data-flow-settings-dialog><div><header><div><span class="wp-card-eyebrow">Entry &amp; recovery</span><h2>Triggers and fallback</h2></div><button type="button" data-flow-settings-close aria-label="Close settings">${CLOSE_ICON}</button></header><label><span>Start this flow when</span><select name="triggerType"><option value="keyword">Customer sends a keyword</option><option value="any_message">Any new message arrives</option><option value="template_reply">Customer taps a template reply</option><option value="manual">Team starts it manually</option><option value="webhook">A secure webhook calls it</option></select></label><label data-flow-keyword-trigger><span>Keywords</span><input name="keywords" maxlength="500" placeholder="pricing, support, book demo" /><small>Comma-separated. Matching is case-insensitive.</small></label><section class="wp-flow-template-trigger" data-flow-template-trigger hidden><label><span>Approved quick-reply template</span><select name="templateKey"><option value="">Select a template</option></select><small>Only approved templates with quick-reply buttons are available.</small></label><div data-flow-template-replies></div><p>Each reply can enter a different block. Choose Ignore when a response should not start this flow.</p></section><label><span>Fallback message</span><textarea name="fallback" rows="4" maxlength="1024" placeholder="I didn't understand that. Please choose one of the options."></textarea></label><footer><button class="wp-primary" type="button" data-flow-settings-apply>Apply settings</button></footer></div></dialog>`;
}

export function bindFlowsView({ root, flows = [], templates = [], request, onRefresh, toast, escapeHtml, builderId = "", listUrl = "/whatsapp-platform/workspace/flows/" }) {
  const dialog = root.querySelector("#wpFlowBuilderDialog");
  const flowEditorUrl = (id = "new") => {
    const url = new URL(listUrl, location.origin);
    url.searchParams.set("builder", id);
    return `${url.pathname}${url.search}`;
  };
  const openFlowRoute = (id = "new") => { location.assign(flowEditorUrl(id)); };
  const bindFlowListControls = () => {
    root.querySelector("#wpCreateFlowBtn")?.addEventListener("click", () => openFlowRoute("new"));
    root.querySelector("[data-flow-empty-create]")?.addEventListener("click", () => openFlowRoute("new"));
    root.querySelector("[data-flow-search]")?.addEventListener("input", (event) => root.querySelectorAll("[data-flow-row]").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(event.target.value.trim().toLowerCase()); }));
    root.querySelectorAll("[data-flow-edit]").forEach((button) => button.addEventListener("click", () => openFlowRoute(button.closest("[data-flow-id]").dataset.flowId)));
    root.querySelectorAll("[data-flow-duplicate]").forEach((button) => button.addEventListener("click", () => openFlowRoute(`copy:${button.closest("[data-flow-id]").dataset.flowId}`)));
    root.querySelectorAll("[data-flow-delete]").forEach((button) => button.addEventListener("click", async () => { const id = button.closest("[data-flow-id]").dataset.flowId; if (!confirm("Delete this flow? This cannot be undone.")) return; try { await request("delete_flow", { flowId: id }); toast("Flow deleted."); await onRefresh(); } catch (error) { toast(error.message || "Flow could not be deleted.", "error"); } }));
    root.querySelectorAll("[data-flow-toggle]").forEach((input) => input.addEventListener("change", async () => { const id = input.closest("[data-flow-id]").dataset.flowId; try { await request("set_flow_status", { flowId: id, status: input.checked ? "active" : "paused" }); toast(input.checked ? "Flow activated." : "Flow paused."); await onRefresh(); } catch (error) { input.checked = !input.checked; toast(error.message || "Flow status could not be changed.", "error"); } }));
  };
  if (!dialog) {
    bindFlowListControls();
    return;
  }
  const form = dialog.querySelector(":scope > form");
  const canvas = dialog.querySelector("[data-flow-canvas]");
  const nodeLayer = dialog.querySelector("[data-flow-nodes]");
  const lines = dialog.querySelector("[data-flow-lines]");
  const edgeControls = dialog.querySelector("[data-flow-edge-controls]");
  const connectMenu = dialog.querySelector("[data-flow-connect-menu]");
  const liveMessages = dialog.querySelector("[data-flow-live-messages]");
  const settingsDialog = root.querySelector("[data-flow-settings-dialog]");
  const paletteToggle = dialog.querySelector("[data-flow-palette-toggle]");
  let state = { id: null, description: "", status: "draft", triggerType: "keyword", triggerConfig: { keywords: [], fallback: "" }, nodes: starterNodes(), edges: [], scale: 1, panX: 0, panY: 0 };
  let selectedId = state.nodes[0].id;
  let suppressNodeClick = false;
  let isPanningCanvas = false;
  const isBuilderRoute = dialog.matches("[data-flow-builder-surface]");
  const goToList = () => { location.assign(listUrl); };
  const templateKeyFor = (template) => String(template.integrationId || `${template.name}|${template.language}`);
  const quickReplyButtons = (template) => (Array.isArray(template?.components) ? template.components : [])
    .filter((component) => String(component?.type || "").toUpperCase() === "BUTTONS")
    .flatMap((component) => Array.isArray(component?.buttons) ? component.buttons : [])
    .map((button, index) => ({ index, type: String(button?.type || "").toUpperCase(), label: String(button?.text || "").trim() }))
    .filter((button) => button.type === "QUICK_REPLY" && button.label)
    .slice(0, 3);
  const replyTemplates = templates.filter((template) => String(template?.status || "").toUpperCase() === "APPROVED" && quickReplyButtons(template).length);
  const templateByKey = (key) => replyTemplates.find((template) => templateKeyFor(template) === key) || null;
  const renderTemplateReplyMappings = (key = "") => {
    const holder = settingsDialog.querySelector("[data-flow-template-replies]");
    if (!holder) return;
    const template = templateByKey(key);
    const configured = Array.isArray(state.triggerConfig?.templateReplies) ? state.triggerConfig.templateReplies : [];
    if (!template) {
      holder.innerHTML = `<p>${replyTemplates.length ? "Select a template to map its replies." : "Create and approve a quick-reply template first."}</p>`;
      return;
    }
    const targets = state.nodes.filter((node) => node.type !== "start");
    holder.innerHTML = quickReplyButtons(template).map((button) => {
      const selected = configured.find((item) => Number(item?.index) === button.index)?.next || "";
      return `<label><span>${escapeHtml(button.label)}</span><select data-flow-template-reply="${button.index}"><option value="">Ignore this reply</option>${targets.map((node) => `<option value="${escapeHtml(node.id)}" ${node.id === selected ? "selected" : ""}>${escapeHtml(node.title || node.type)}</option>`).join("")}</select></label>`;
    }).join("");
  };
  const syncTriggerSettingsVisibility = () => {
    const type = settingsDialog.querySelector('[name="triggerType"]')?.value || "keyword";
    settingsDialog.querySelector("[data-flow-keyword-trigger]")?.toggleAttribute("hidden", type !== "keyword");
    settingsDialog.querySelector("[data-flow-template-trigger]")?.toggleAttribute("hidden", type !== "template_reply");
  };
  const setPaletteCollapsed = (collapsed, persist = true) => {
    dialog.classList.toggle("palette-collapsed", Boolean(collapsed));
    if (paletteToggle) {
      paletteToggle.setAttribute("aria-expanded", String(!collapsed));
      paletteToggle.setAttribute("aria-label", collapsed ? "Expand builder sidebar" : "Collapse builder sidebar");
      paletteToggle.textContent = collapsed ? "‹" : "›";
    }
    if (persist) {
      try { localStorage.setItem(PALETTE_COLLAPSED_KEY, collapsed ? "1" : "0"); } catch { /* Non-critical preference. */ }
    }
    window.setTimeout(() => {
      applyViewport();
      drawLines();
    }, 180);
  };
  const applyTransform = (element, transform) => {
    element.getAnimations().filter((animation) => animation.id === "wp-flow-layout").forEach((animation) => animation.cancel());
    element.style.transform = transform;
  };
  const markDraftChanged = () => {
    const saveState = dialog.querySelector("[data-flow-save-state]");
    if (saveState) saveState.textContent = "Draft changed";
  };
  const applyViewport = () => {
    const transform = `translate(${state.panX || 0}px, ${state.panY || 0}px) scale(${state.scale})`;
    applyTransform(nodeLayer, transform);
    applyTransform(lines, transform);
    if (edgeControls) applyTransform(edgeControls, transform);
  };
  const focusInlineCardField = (id) => {
    selectedId = id;
    renderNodes(false);
    window.requestAnimationFrame(() => {
      const selector = typeof CSS !== "undefined" && CSS.escape ? `[data-flow-node="${CSS.escape(id)}"]` : `[data-flow-node="${id}"]`;
      const card = nodeLayer.querySelector(selector);
      const field = card?.querySelector('textarea[data-node-field="body"], input[data-node-field="keywords"], input[data-node-field], textarea[data-node-field], select[data-node-field], [data-node-button-label], input:not([type="checkbox"]), textarea, select');
      card?.classList.add("editing");
      if (field) {
        field.focus({ preventScroll: true });
        if (typeof field.select === "function") field.select();
      }
      window.setTimeout(() => card?.classList.remove("editing"), 900);
    });
  };
  const updateSelectedCardPreview = (node) => {
    const card = nodeLayer.querySelector(`[data-flow-node="${CSS.escape(node.id)}"]`);
    if (!card) return;
    const title = card.querySelector("header strong");
    if (title) title.textContent = node.title;
    card.querySelectorAll("[data-flow-count]").forEach((counter) => {
      counter.textContent = `${Number((node.body || "").length)}/1024`;
    });
  };
  const setNodeField = (node, field, element) => {
    if (field === "body") {
      node.body = element.value || "";
      return;
    }
    node.config = { ...(node.config || {}) };
    node.config[field] = element.type === "checkbox" ? element.checked : element.value;
    if (node.type === "start" && field === "keywords") {
      state.triggerConfig = {
        ...(state.triggerConfig || {}),
        keywords: String(element.value || "").split(",").map((item) => item.trim()).filter(Boolean),
      };
    }
  };
  const normalizeButtonRoutes = (node) => {
    if (!node) return false;
    const buttons = buttonValues(node);
    const seenTargets = new Set();
    let changed = false;
    const nextButtons = buttons.map((button) => {
      const next = button.next || "";
      if (next && seenTargets.has(next)) {
        changed = true;
        return { ...button, next: "" };
      }
      if (next) seenTargets.add(next);
      return button;
    });
    if (changed) node.config = { ...(node.config || {}), buttons: nextButtons };
    return changed;
  };
  const visibleEdges = () => normalizedEdges();
  const reachableNodeIds = () => {
    const reachable = new Set([state.nodes[0]?.id].filter(Boolean));
    let changed = true;
    while (changed) {
      changed = false;
      visibleEdges().forEach((edge) => {
        if (reachable.has(edge.from) && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          changed = true;
        }
      });
    }
    return reachable;
  };
  const nodeHasContent = (node) => {
    if (!node) return false;
    const meaningfulBody = Boolean((node.body || "").trim()) && node.body !== DEFAULT_COPY[node.type];
    if (node.type === "start") return Boolean((fieldValue(node, "keywords") || fieldValue(node, "regex") || "").trim()) || visibleEdges().some((edge) => edge.from === node.id);
    if (["message", "media", "ask_media", "question", "address", "location", "attribute", "tag", "connect", "handoff", "end"].includes(node.type)) {
      return meaningfulBody || Boolean((fieldValue(node, "target") || fieldValue(node, "mediaUrl")).trim());
    }
    if (node.type === "condition") return Boolean(fieldValue(node, "expression").trim());
    if (node.type === "api") return Boolean(fieldValue(node, "endpoint").trim());
    if (node.type === "delay") return Boolean(fieldValue(node, "seconds").trim());
    return meaningfulBody;
  };
  const validationClassFor = (node, reachable = reachableNodeIds()) => {
    const connected = node.type === "start" || reachable.has(node.id);
    return connected && nodeHasContent(node) && nodeHasOutgoingPath(node) ? "ready" : "needs-attention";
  };
  const nodeHasOutgoingPath = (node) => {
    if (!node) return false;
    if (["end", "handoff", "connect"].includes(node.type)) return true;
    const filledButtons = buttonValues(node).filter((button) => button.label.trim());
    if (filledButtons.length) return filledButtons.every((button) => Boolean(button.next));
    return visibleEdges().some((edge) => edge.from === node.id);
  };

  const normalizedEdges = () => {
    const validIds = new Set(state.nodes.map((node) => node.id));
    const routed = [];
    const seen = new Set();
    const configuredButtonPairs = new Set(state.nodes.flatMap((node) => buttonValues(node).filter((button) => button.next).map((button) => `${node.id}:${button.next}`)));
    (Array.isArray(state.edges) ? state.edges : []).forEach((edge) => {
      if (!edge?.from || !edge?.to || edge.from === edge.to || !validIds.has(edge.from) || !validIds.has(edge.to)) return;
      const isButtonEdge = Number.isInteger(edge.fromButton);
      if (!isButtonEdge && configuredButtonPairs.has(`${edge.from}:${edge.to}`)) return;
      const key = isButtonEdge ? `${edge.from}:button:${edge.fromButton}:${edge.to}` : `${edge.from}:direct:${edge.to}`;
      if (seen.has(key)) return;
      seen.add(key);
      routed.push({ id: key, from: edge.from, to: edge.to, ...(isButtonEdge ? { fromButton: edge.fromButton } : {}) });
    });
    state.nodes.forEach((node) => {
      buttonValues(node).forEach((button, buttonIndex) => {
        if (button.next && validIds.has(button.next) && button.next !== node.id) {
          const key = `${node.id}:button:${buttonIndex}:${button.next}`;
          if (seen.has(key)) return;
          seen.add(key);
          routed.push({ id: key, from: node.id, to: button.next, fromButton: buttonIndex });
        }
      });
    });
    return routed;
  };
  const renderLiveNode = (node) => {
    if (!node || !liveMessages) return;
    const body = node.type === "start" ? "Customer starts the flow" : node.body || DEFAULT_COPY[node.type] || "Message";
    const buttons = buttonValues(node).filter((button) => button.label);
    const message = document.createElement("div");
    message.className = `wp-flow-live-message ${node.type === "start" ? "customer" : "business"}`;
    message.innerHTML = `<span>${escapeHtml(node.title)}</span><p>${escapeHtml(body)}</p>${buttons.length ? `<div>${buttons.map((button, index) => `<button type="button" data-live-button="${index}">${escapeHtml(button.label)}</button>`).join("")}</div>` : ""}`;
    liveMessages.appendChild(message);
    liveMessages.scrollTop = liveMessages.scrollHeight;
    message.querySelectorAll("[data-live-button]").forEach((button) => button.addEventListener("click", () => {
      const chosen = buttons[Number(button.dataset.liveButton)];
      const reply = document.createElement("div");
      reply.className = "wp-flow-live-message customer";
      reply.innerHTML = `<p>${escapeHtml(chosen.label)}</p>`;
      liveMessages.appendChild(reply);
      const routed = state.nodes.find((item) => item.id === chosen.next);
      if (routed) window.setTimeout(() => renderLiveNode(routed), 260);
    }));
    if (node.type === "start" || !buttons.length) {
      const nextEdge = normalizedEdges().find((edge) => edge.from === node.id && !Number.isInteger(edge.fromButton));
      const nextNode = state.nodes.find((item) => item.id === nextEdge?.to);
      if (nextNode) window.setTimeout(() => renderLiveNode(nextNode), node.type === "start" ? 260 : 420);
    }
  };
  const startLivePreview = () => {
    if (!liveMessages) return;
    liveMessages.innerHTML = "";
    renderLiveNode(state.nodes[0]);
  };
  const centerCanvasOn = (worldX, worldY) => {
    state.panX = Math.round((canvas.clientWidth / 2) - (worldX * state.scale));
    state.panY = Math.round((canvas.clientHeight / 2) - (worldY * state.scale));
    canvas.scrollTo({ left: 0, top: 0, behavior: "auto" });
    applyViewport();
    drawLines();
  };
  const worldPointFromPointer = (event) => {
    const canvasRect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - canvasRect.left - (state.panX || 0)) / state.scale,
      y: (event.clientY - canvasRect.top - (state.panY || 0)) / state.scale
    };
  };
  const worldPointFromNodeElement = (element, node) => {
    const card = element.closest("[data-flow-node]");
    if (!card) return null;
    let x = element.offsetWidth / 2;
    let y = element.offsetHeight / 2;
    let current = element;
    while (current && current !== card) {
      x += current.offsetLeft || 0;
      y += current.offsetTop || 0;
      current = current.offsetParent;
    }
    if (current !== card) return null;
    return { x: Number(node.x || 0) + x, y: Number(node.y || 0) + y };
  };
  const edgeStartPoint = (edge, node) => {
    if (Number.isInteger(edge.fromButton)) {
      const port = nodeLayer.querySelector(`[data-flow-node="${CSS.escape(node.id)}"] [data-flow-button-port="${edge.fromButton}"]`);
      const point = port ? worldPointFromNodeElement(port, node) : null;
      if (point) return point;
    }
    const port = nodeLayer.querySelector(`[data-flow-node="${CSS.escape(node.id)}"] [data-flow-node-port]`);
    const point = port ? worldPointFromNodeElement(port, node) : null;
    if (point) return point;
    return { x: Number(node.x || 0) + NODE_WIDTH, y: Number(node.y || 0) + 58 };
  };
  const edgeEndPoint = (node) => {
    const port = nodeLayer.querySelector(`[data-flow-node="${CSS.escape(node.id)}"] .wp-flow-port.in`);
    const point = port ? worldPointFromNodeElement(port, node) : null;
    if (point) return point;
    return { x: Number(node.x || 0) + NODE_WIDTH / 2, y: Number(node.y || 0) };
  };
  const cubicPoint = (start, controlOne, controlTwo, end, t) => {
    const inverse = 1 - t;
    return {
      x: (inverse ** 3 * start.x) + (3 * inverse ** 2 * t * controlOne.x) + (3 * inverse * t ** 2 * controlTwo.x) + (t ** 3 * end.x),
      y: (inverse ** 3 * start.y) + (3 * inverse ** 2 * t * controlOne.y) + (3 * inverse * t ** 2 * controlTwo.y) + (t ** 3 * end.y),
    };
  };
  const clearEdgeControlPoint = (start, controlOne, controlTwo, end) => {
    const clearance = 18;
    const occupied = state.nodes.map((node) => {
      const card = nodeLayer.querySelector(`[data-flow-node="${CSS.escape(node.id)}"]`);
      const height = Math.max(NODE_HEIGHT, card?.offsetHeight || NODE_HEIGHT);
      return {
        left: Number(node.x || 0) - clearance,
        top: Number(node.y || 0) - clearance,
        right: Number(node.x || 0) + NODE_WIDTH + clearance,
        bottom: Number(node.y || 0) + height + clearance,
      };
    });
    const candidates = [.5, .44, .56, .38, .62, .32, .68, .26, .74, .2, .8, .14, .86, .08, .92];
    return candidates.map((t) => cubicPoint(start, controlOne, controlTwo, end, t)).find((point) => !occupied.some((rect) => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom))
      || cubicPoint(start, controlOne, controlTwo, end, .5);
  };
  const drawLines = (preview = null) => {
    const worldWidth = Math.max(2400, ...state.nodes.map((node) => Number(node.x || 0) + NODE_WIDTH + 360));
    const worldHeight = Math.max(1600, ...state.nodes.map((node) => Number(node.y || 0) + 460));
    [canvas.querySelector(".wp-flow-canvas-grid"), nodeLayer, lines, edgeControls].filter(Boolean).forEach((layer) => {
      layer.style.width = `${worldWidth}px`;
      layer.style.height = `${worldHeight}px`;
    });
    lines.setAttribute("viewBox", `0 0 ${worldWidth} ${worldHeight}`);
    const controlMarkup = [];
    const edgeMarkup = visibleEdges().map((edge) => {
      const a = state.nodes.find((n) => n.id === edge.from);
      const b = state.nodes.find((n) => n.id === edge.to);
      if (!a || !b) return "";
      const start = edgeStartPoint(edge, a);
      const isButtonEdge = Number.isInteger(edge.fromButton);
      const end = edgeEndPoint(b);
      const spread = Math.max(54, Math.min(150, Math.abs(end.x - start.x) * .42));
      const controlOne = isButtonEdge ? { x: start.x + spread, y: start.y } : { x: start.x + 44, y: start.y + 72 };
      const controlTwo = isButtonEdge ? { x: end.x - spread, y: end.y } : { x: end.x - 44, y: end.y - 72 };
      const d = `M ${start.x} ${start.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${end.x} ${end.y}`;
      const controlPoint = clearEdgeControlPoint(start, controlOne, controlTwo, end);
      controlMarkup.push(`<button type="button" class="wp-flow-edge-clear" data-flow-edge-x="${controlPoint.x}" data-flow-edge-y="${controlPoint.y}" data-flow-edge-clear="${edge.from}:${isButtonEdge ? edge.fromButton : ""}:${edge.to}" aria-label="Remove connection" title="Remove connection">${CLOSE_ICON}</button>`);
      return `<g data-flow-edge="${edge.id}"><path class="${isButtonEdge ? "button-edge" : ""}" d="${d}" /></g>`;
    }).join("");
    let previewMarkup = "";
    if (preview) {
      const source = state.nodes.find((node) => node.id === preview.from);
      if (source) {
        const start = edgeStartPoint({ fromButton: preview.fromButton }, source);
        const end = preview.to;
        const spread = Math.max(54, Math.min(150, Math.abs(end.x - start.x) * .42));
        previewMarkup = `<path class="button-edge preview-edge" d="M ${start.x} ${start.y} C ${start.x + spread} ${start.y}, ${end.x - spread} ${end.y}, ${end.x} ${end.y}" />`;
      }
    }
    lines.innerHTML = edgeMarkup + previewMarkup;
    if (edgeControls) edgeControls.innerHTML = controlMarkup.join("");
    edgeControls?.querySelectorAll("[data-flow-edge-clear]").forEach((button) => {
      button.style.left = `${Number(button.dataset.flowEdgeX || 0)}px`;
      button.style.top = `${Number(button.dataset.flowEdgeY || 0)}px`;
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const [fromId, buttonIndex, toId] = button.dataset.flowEdgeClear.split(":");
        if (buttonIndex === "") clearNodeConnection(fromId, toId);
        else clearButtonConnection(fromId, Number(buttonIndex));
      });
    });
  };
  const selectNode = (id) => {
    selectedId = id; renderNodes(false);
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
  };
  const duplicateNode = (id) => {
    const sourceIndex = state.nodes.findIndex((item) => item.id === id);
    const source = state.nodes[sourceIndex];
    if (!source || source.type === "start") return;
    const clone = structuredClone(source);
    clone.id = crypto.randomUUID();
    clone.title = `${source.title || "Block"} copy`;
    clone.x = Math.max(20, Number(source.x || 80) + 36);
    clone.y = Math.max(20, Number(source.y || 90) + 46);
    state.nodes.splice(sourceIndex + 1, 0, clone);
    selectedId = clone.id;
    markDraftChanged();
    renderNodes();
  };
  const deleteNode = (id) => {
    const node = state.nodes.find((item) => item.id === id);
    if (!node || node.type === "start") return;
    state.nodes = state.nodes.filter((item) => item.id !== id);
    state.nodes.forEach((item) => {
      const buttons = buttonValues(item);
      if (!buttons.some((button) => button.next === id)) return;
      item.config = { ...(item.config || {}), buttons: buttons.map((button) => button.next === id ? { ...button, next: "" } : button) };
    });
    selectedId = state.nodes[Math.max(0, Math.min(state.nodes.length - 1, state.nodes.findIndex((item) => item.id === id)))]?.id || state.nodes[0]?.id;
    markDraftChanged();
    renderNodes();
  };
  const connectButtonToNode = (fromId, buttonIndex, toId) => {
    if (!fromId || !toId || fromId === toId) return false;
    const source = state.nodes.find((item) => item.id === fromId);
    if (!source) return false;
    source.config = { ...(source.config || {}) };
    const buttons = buttonValues(source).slice();
    const duplicateIndex = buttons.findIndex((button, index) => index !== buttonIndex && button.next === toId);
    if (duplicateIndex >= 0) {
      toast("That block is already connected from another button. Cancel the existing line first.", "error");
      return false;
    }
    buttons[buttonIndex] = { ...(buttons[buttonIndex] || { label: `Button ${buttonIndex + 1}`, next: "" }), next: toId };
    source.config.buttons = buttons;
    selectedId = fromId;
    markDraftChanged();
    renderNodes(false);
    toast("Button route connected.");
    return true;
  };
  const connectNodeToNode = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return false;
    const source = state.nodes.find((item) => item.id === fromId);
    const target = state.nodes.find((item) => item.id === toId);
    if (!source || !target) return false;
    state.edges = (Array.isArray(state.edges) ? state.edges : []).filter((edge) => edge.from !== fromId || Number.isInteger(edge.fromButton));
    state.edges.push({ id: `${fromId}:direct:${toId}`, from: fromId, to: toId });
    selectedId = fromId;
    markDraftChanged();
    renderNodes(false);
    toast("Flow path connected.");
    return true;
  };
  const clearButtonConnection = (fromId, buttonIndex) => {
    const source = state.nodes.find((item) => item.id === fromId);
    if (!source) return false;
    const buttons = buttonValues(source).slice();
    if (!buttons[buttonIndex]?.next) return false;
    buttons[buttonIndex] = { ...buttons[buttonIndex], next: "" };
    source.config = { ...(source.config || {}), buttons };
    selectedId = fromId;
    markDraftChanged();
    renderNodes(false);
    toast("Connection cancelled.");
    return true;
  };
  const clearNodeConnection = (fromId, toId = "") => {
    const before = Array.isArray(state.edges) ? state.edges.length : 0;
    state.edges = (Array.isArray(state.edges) ? state.edges : []).filter((edge) => edge.from !== fromId || (toId && edge.to !== toId) || Number.isInteger(edge.fromButton));
    if (state.edges.length === before) return false;
    selectedId = fromId;
    markDraftChanged();
    renderNodes(false);
    toast("Connection cancelled.");
    return true;
  };
  const hideConnectMenu = () => {
    if (!connectMenu) return;
    connectMenu.hidden = true;
    connectMenu.innerHTML = "";
  };
  const showConnectMenu = ({ fromId, buttonIndex = null, clientX, clientY, worldPoint }) => {
    if (!connectMenu) return;
    const choices = BLOCKS.filter((block) => !["end"].includes(block[0]));
    connectMenu.innerHTML = `<header><strong>Content Block</strong><button type="button" data-flow-connect-close aria-label="Close">${CLOSE_ICON}</button></header>${choices.map(([type, icon, title]) => `<button type="button" data-flow-connect-type="${type}"><i>${icon}</i><span>${title}</span></button>`).join("")}`;
    connectMenu.style.left = `${Math.min(clientX, window.innerWidth - 260)}px`;
    connectMenu.style.top = `${Math.min(clientY, window.innerHeight - 360)}px`;
    connectMenu.hidden = false;
    connectMenu.querySelector("[data-flow-connect-close]")?.addEventListener("click", hideConnectMenu);
    connectMenu.querySelectorAll("[data-flow-connect-type]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = state.nodes.find((item) => item.id === fromId);
        const targetX = source ? source.x + 380 : worldPoint.x + 320;
        let targetY = source ? Math.max(40, source.y + (Number.isInteger(buttonIndex) ? (buttonIndex - 1) * 360 : 0)) : worldPoint.y;
        while (state.nodes.some((item) => Math.abs(item.x - targetX) < 80 && Math.abs(item.y - targetY) < 320)) targetY += 360;
        const routedPoint = { x: targetX, y: targetY };
        // Reply-button branches must not also inherit the source's direct edge.
        // Their only route is the selected button; otherwise the runtime can
        // skip the choice and the canvas draws two competing connections.
        const node = addBlock(button.dataset.flowConnectType, routedPoint, Number.isInteger(buttonIndex) ? null : fromId, false);
        if (node) {
          if (Number.isInteger(buttonIndex)) connectButtonToNode(fromId, buttonIndex, node.id);
          else connectNodeToNode(fromId, node.id);
        }
        hideConnectMenu();
      });
    });
  };
  connectMenu?.addEventListener("wheel", (event) => {
    event.stopPropagation();
  }, { passive: true });
  connectMenu?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  const renderNodes = (refreshInspector = true) => {
    state.nodes.forEach(normalizeButtonRoutes);
    const reachable = reachableNodeIds();
    applyViewport();
    nodeLayer.innerHTML = state.nodes.map((node) => `<article class="wp-flow-node ${node.id === selectedId ? "selected" : ""} ${validationClassFor(node, reachable)}" data-flow-node="${node.id}">${node.id === selectedId && node.type !== "start" ? `<div class="wp-flow-card-actions"><button type="button" data-flow-copy-node aria-label="Copy block" title="Copy block">${COPY_ICON}</button><button type="button" data-flow-delete-node aria-label="Delete block" title="Delete block">${DELETE_ICON}</button></div>` : ""}<header><span>${iconFor(node.type)}</span><div><small>${blockLabelFor(node)}</small><strong>${escapeHtml(node.title)}</strong></div><button type="button" data-flow-edit-title aria-label="Edit block title">${MORE_ICON}</button></header>${renderNodeFields(node, escapeHtml, state.nodes, templates)}<footer data-flow-add-next="message" role="button" tabindex="0"><span>${PLUS_ICON} Add content</span></footer><i class="wp-flow-port in"></i><i class="wp-flow-port out" ${node.type === "start" ? `data-flow-node-port role="button" tabindex="0" title="Drag to connect Flow start"` : ""}></i></article>`).join("");
    nodeLayer.querySelectorAll("[data-flow-node]").forEach((card) => {
      const positionedNode = state.nodes.find((item) => item.id === card.dataset.flowNode);
      if (positionedNode) applyTransform(card, `translate(${positionedNode.x}px, ${positionedNode.y}px)`);
      card.addEventListener("click", (event) => {
        if (suppressNodeClick) {
          suppressNodeClick = false;
          return;
        }
        if (event.target.closest("button,input,textarea,select,label,[contenteditable]")) {
          selectedId = card.dataset.flowNode;
          nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => item.classList.toggle("selected", item === card));
          return;
        }
        selectNode(card.dataset.flowNode);
      });
      card.querySelector("[data-flow-edit-title]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        focusInlineCardField(card.dataset.flowNode);
      });
      card.querySelector("[data-flow-copy-node]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        duplicateNode(card.dataset.flowNode);
      });
      card.querySelector("[data-flow-delete-node]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteNode(card.dataset.flowNode);
      });
      card.querySelectorAll("[data-node-field]").forEach((field) => {
        field.addEventListener("input", () => {
          const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
          setNodeField(node, field.dataset.nodeField, field);
          updateSelectedCardPreview(node);
          markDraftChanged();
        });
        field.addEventListener("change", () => {
          const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
          setNodeField(node, field.dataset.nodeField, field);
          markDraftChanged();
        });
      });
      card.querySelector("[data-flow-template-select]")?.addEventListener("change", (event) => {
        const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
        const template = templates.find((item) => String(item.integrationId || `${item.name}|${item.language}`) === event.currentTarget.value) || null;
        node.config = { ...(node.config || {}) };
        if (template) {
          node.config.templateIntegrationId = String(template.integrationId || "");
          node.config.templateName = String(template.name || "");
          node.config.templateLanguage = String(template.language || "");
          node.config.templateCategory = String(template.category || "");
          node.body = templateMessagePreview(template) || `Template: ${template.name}`;
        } else {
          delete node.config.templateIntegrationId;
          delete node.config.templateName;
          delete node.config.templateLanguage;
          delete node.config.templateCategory;
          node.body = "";
        }
        selectedId = node.id;
        markDraftChanged();
        renderNodes(false);
      });
      card.querySelectorAll("[data-node-button-label],[data-node-button-next]").forEach((field) => {
        const updateButton = () => {
          const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
          node.config = { ...(node.config || {}) };
          const buttons = buttonValues(node).slice();
          const index = Number(field.dataset.nodeButtonLabel ?? field.dataset.nodeButtonNext);
          if (field.dataset.nodeButtonNext !== undefined && field.value && buttons.some((button, buttonIndex) => buttonIndex !== index && button.next === field.value)) {
            field.value = "";
            toast("That block is already connected from another button. Cancel the existing line first.", "error");
          }
          buttons[index] = { ...(buttons[index] || { label: "", next: "" }), [field.dataset.nodeButtonLabel !== undefined ? "label" : "next"]: field.value };
          node.config.buttons = buttons;
          markDraftChanged();
          if (field.dataset.nodeButtonNext !== undefined) drawLines();
        };
        field.addEventListener("input", updateButton);
        field.addEventListener("change", updateButton);
      });
      card.querySelectorAll("[data-flow-button-port]").forEach((port) => {
        port.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          hideConnectMenu();
          const sourceId = card.dataset.flowNode;
          const buttonIndex = Number(port.dataset.flowButtonPort);
          port.classList.add("connecting");
          nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => {
            item.classList.toggle("connect-target", item.dataset.flowNode !== sourceId);
          });
          port.setPointerCapture(event.pointerId);
          const move = (moveEvent) => {
            const targetCard = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest("[data-flow-node]");
            nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => {
              item.classList.toggle("connect-hover", targetCard === item && item.dataset.flowNode !== sourceId);
            });
            drawLines({ from: sourceId, fromButton: buttonIndex, to: worldPointFromPointer(moveEvent) });
          };
          const stop = (upEvent) => {
            port.classList.remove("connecting");
            nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => item.classList.remove("connect-target", "connect-hover"));
            const targetCard = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest("[data-flow-node]");
            port.removeEventListener("pointermove", move);
            port.removeEventListener("pointerup", stop);
            port.removeEventListener("pointercancel", stop);
            drawLines();
            if (targetCard && targetCard.dataset.flowNode !== sourceId) {
              connectButtonToNode(sourceId, buttonIndex, targetCard.dataset.flowNode);
              return;
            }
            const worldPoint = worldPointFromPointer(upEvent);
            showConnectMenu({ fromId: sourceId, buttonIndex, clientX: upEvent.clientX, clientY: upEvent.clientY, worldPoint });
          };
          port.addEventListener("pointermove", move);
          port.addEventListener("pointerup", stop);
          port.addEventListener("pointercancel", stop);
        });
      });
      card.querySelector("[data-flow-node-port]")?.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideConnectMenu();
        const sourceId = card.dataset.flowNode;
        const port = event.currentTarget;
        port.classList.add("connecting");
        nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => {
          item.classList.toggle("connect-target", item.dataset.flowNode !== sourceId);
        });
        port.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
          const targetCard = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest("[data-flow-node]");
          nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => {
            item.classList.toggle("connect-hover", targetCard === item && item.dataset.flowNode !== sourceId);
          });
          drawLines({ from: sourceId, to: worldPointFromPointer(moveEvent) });
        };
        const stop = (upEvent) => {
          port.classList.remove("connecting");
          nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => item.classList.remove("connect-target", "connect-hover"));
          const targetCard = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest("[data-flow-node]");
          port.removeEventListener("pointermove", move);
          port.removeEventListener("pointerup", stop);
          port.removeEventListener("pointercancel", stop);
          drawLines();
          if (targetCard && targetCard.dataset.flowNode !== sourceId) {
            connectNodeToNode(sourceId, targetCard.dataset.flowNode);
            return;
          }
          showConnectMenu({ fromId: sourceId, clientX: upEvent.clientX, clientY: upEvent.clientY, worldPoint: worldPointFromPointer(upEvent) });
        };
        port.addEventListener("pointermove", move);
        port.addEventListener("pointerup", stop);
        port.addEventListener("pointercancel", stop);
      });
      card.querySelector("[data-flow-add-button]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
        node.config = { ...(node.config || {}), buttons: [...buttonValues(node), { label: "", next: "" }] };
        markDraftChanged();
        renderNodes(false);
      });
      card.querySelectorAll("[data-flow-remove-button]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
          const buttons = buttonValues(node).slice();
          buttons.splice(Number(button.dataset.flowRemoveButton), 1);
          node.config = { ...(node.config || {}), buttons };
          markDraftChanged();
          renderNodes(false);
        });
      });
      card.querySelectorAll("[data-flow-add-next]").forEach((control) => {
        const add = (event) => {
          event.preventDefault();
          event.stopPropagation();
          addBlock(control.dataset.flowAddNext || "message", {}, card.dataset.flowNode);
        };
        control.addEventListener("click", add);
        control.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") add(event);
        });
      });
      card.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button,input,textarea,select,[data-flow-add-next],[data-flow-copy-node],[data-flow-delete-node]")) return;
        const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
        event.preventDefault();
        selectedId = node.id;
        nodeLayer.querySelectorAll("[data-flow-node]").forEach((item) => item.classList.toggle("selected", item.dataset.flowNode === node.id));
        const startX = event.clientX; const startY = event.clientY; const originX = node.x; const originY = node.y;
        let moved = false;
        card.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
          const deltaX = (moveEvent.clientX - startX) / state.scale;
          const deltaY = (moveEvent.clientY - startY) / state.scale;
          if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) moved = true;
          node.x = Math.max(-CANVAS_LIMIT, Math.min(CANVAS_LIMIT, Math.round(originX + deltaX)));
          node.y = Math.max(-CANVAS_LIMIT, Math.min(CANVAS_LIMIT, Math.round(originY + deltaY)));
          applyTransform(card, `translate(${node.x}px, ${node.y}px)`);
          drawLines();
        };
        const stop = () => {
          card.removeEventListener("pointermove", move);
          card.removeEventListener("pointerup", stop);
          card.removeEventListener("pointercancel", stop);
          if (moved) {
            suppressNodeClick = true;
            markDraftChanged();
            selectNode(node.id);
          }
        };
        card.addEventListener("pointermove", move);
        card.addEventListener("pointerup", stop);
        card.addEventListener("pointercancel", stop);
      });
    });
    window.requestAnimationFrame(drawLines);
    if (refreshInspector && selectedId) selectNode(selectedId);
  };
  const addBlock = (type, point = {}, afterId = null, shouldRender = true) => {
    const insertIndex = afterId ? Math.max(0, state.nodes.findIndex((item) => item.id === afterId)) + 1 : state.nodes.length;
    const index = insertIndex; const previous = state.nodes[index - 1] || state.nodes[state.nodes.length - 1];
    const source = afterId ? state.nodes.find((item) => item.id === afterId) : null;
    const node = { id: crypto.randomUUID(), type, title: BLOCKS.find((item) => item[0] === type)?.[2] || "Message", body: DEFAULT_COPY[type] || "Configure this step.", x: point.x ?? (source ? source.x + 380 : Math.max(80, (previous?.x || 80) + (index % 3 === 0 ? 380 : 0))), y: point.y ?? (source ? source.y : ((previous?.y || 20) + 260)), config: {} };
    state.nodes.splice(insertIndex, 0, node);
    if (afterId) {
      state.edges = (Array.isArray(state.edges) ? state.edges : []).filter((edge) => edge.from !== afterId || Number.isInteger(edge.fromButton));
      state.edges.push({ id: `${afterId}:direct:${node.id}`, from: afterId, to: node.id });
    }
    selectedId = node.id; markDraftChanged(); if (shouldRender) renderNodes(); return node;
  };
  const open = (flow = null) => {
    state = flow ? { id: flow.id, description: flow.description || "", status: flow.status || "draft", triggerType: flow.trigger_type || "keyword", triggerConfig: flow.trigger_config || {}, nodes: Array.isArray(flow.nodes) && flow.nodes.length ? structuredClone(flow.nodes) : starterNodes(), edges: flow.edges || [], scale: 1, panX: 0, panY: 0 } : { id: null, description: "", status: "draft", triggerType: "keyword", triggerConfig: { keywords: [], fallback: "" }, nodes: starterNodes(), edges: [], scale: 1, panX: 0, panY: 0 };
    const start = state.nodes.find((node) => node.type === "start");
    const canonicalKeywords = [...new Set([
      ...(Array.isArray(state.triggerConfig?.keywords) ? state.triggerConfig.keywords : []),
      ...String(start?.config?.keywords || "").split(","),
    ].map((item) => String(item || "").trim()).filter(Boolean))];
    state.triggerConfig = { ...(state.triggerConfig || {}), keywords: canonicalKeywords };
    if (start) start.config = { ...(start.config || {}), keywords: canonicalKeywords.join(",") };
    form.elements.name.value = flow?.name || "Untitled flow"; form.elements.active.checked = state.status === "active"; selectedId = state.nodes[0].id; if (!isBuilderRoute && typeof dialog.showModal === "function") dialog.showModal(); renderNodes();
  };
  bindFlowListControls();
  dialog.querySelectorAll("[data-flow-block]").forEach((button) => { button.addEventListener("click", () => addBlock(button.dataset.flowBlock)); button.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", button.dataset.flowBlock)); });
  dialog.querySelectorAll("[data-flow-tab]").forEach((tab) => tab.addEventListener("click", () => {
    dialog.querySelectorAll("[data-flow-tab]").forEach((item) => item.classList.toggle("active", item === tab));
    dialog.querySelectorAll("[data-flow-panel]").forEach((panel) => { panel.hidden = panel.dataset.flowPanel !== tab.dataset.flowTab; });
    if (tab.dataset.flowTab === "live") startLivePreview();
  }));
  dialog.querySelector("[data-flow-live-start]")?.addEventListener("click", startLivePreview);
  canvas.addEventListener("dragover", (event) => event.preventDefault()); canvas.addEventListener("drop", (event) => { event.preventDefault(); const type = event.dataTransfer.getData("text/plain"); if (!type) return; addBlock(type, worldPointFromPointer(event)); });
  const fitCanvas = () => {
    if (!state.nodes.length) return;
    const padding = 48;
    const bounds = state.nodes.reduce((result, node) => {
      const card = nodeLayer.querySelector(`[data-flow-node="${CSS.escape(node.id)}"]`);
      const height = Math.max(180, card?.offsetHeight || 360);
      result.minX = Math.min(result.minX, Number(node.x || 0));
      result.minY = Math.min(result.minY, Number(node.y || 0));
      result.maxX = Math.max(result.maxX, Number(node.x || 0) + NODE_WIDTH);
      result.maxY = Math.max(result.maxY, Number(node.y || 0) + height);
      return result;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(1, canvas.clientWidth - padding * 2);
    const availableHeight = Math.max(1, canvas.clientHeight - padding * 2);
    state.scale = Math.max(.2, Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight));
    state.panX = Math.round((canvas.clientWidth - contentWidth * state.scale) / 2 - bounds.minX * state.scale);
    state.panY = Math.round((canvas.clientHeight - contentHeight * state.scale) / 2 - bounds.minY * state.scale);
    canvas.scrollTo({ left: 0, top: 0, behavior: "auto" });
    applyViewport();
    drawLines();
  };
  const arrangeConnectedTree = () => {
    const edges = normalizedEdges();
    const children = new Map();
    edges.forEach((edge) => {
      const list = children.get(edge.from) || [];
      if (!list.includes(edge.to)) list.push(edge.to);
      children.set(edge.from, list);
    });
    const root = state.nodes.find((node) => node.type === "start") || state.nodes[0];
    if (!root) return;
    const positions = new Map();
    const visiting = new Set();
    let nextLeafY = 60;
    const leafGap = 340;
    const columnGap = 380;
    const place = (id, depth) => {
      if (positions.has(id)) return positions.get(id).y;
      if (visiting.has(id)) return nextLeafY;
      visiting.add(id);
      const childIds = (children.get(id) || []).filter((childId) => state.nodes.some((node) => node.id === childId));
      let y;
      if (!childIds.length) {
        y = nextLeafY;
        nextLeafY += leafGap;
      } else {
        const childYs = childIds.map((childId) => place(childId, depth + 1));
        y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
      }
      positions.set(id, { x: 80 + depth * columnGap, y: Math.max(40, Math.round(y)) });
      visiting.delete(id);
      return y;
    };
    place(root.id, 0);
    state.nodes.forEach((node) => {
      const position = positions.get(node.id);
      if (position) Object.assign(node, position);
    });
    markDraftChanged();
    renderNodes(false);
    window.requestAnimationFrame(fitCanvas);
    toast("Flow arranged into a clean connected tree.");
  };
  dialog.querySelector("[data-flow-arrange]")?.addEventListener("click", arrangeConnectedTree);
  const zoomCanvas = (delta, origin = null) => {
    const previous = state.scale;
    const next = Math.max(.2, Math.min(1.8, Number((state.scale + delta).toFixed(2))));
    if (next === previous) return;
    if (origin) {
      const rect = canvas.getBoundingClientRect();
      const ox = origin.clientX - rect.left;
      const oy = origin.clientY - rect.top;
    state.panX = ox - ((ox - (state.panX || 0)) / previous) * next;
      state.panY = oy - ((oy - (state.panY || 0)) / previous) * next;
    }
    state.scale = next;
    applyViewport();
    drawLines();
  };
  dialog.querySelector('[data-flow-zoom="in"]').addEventListener("click", () => zoomCanvas(.1));
  dialog.querySelector('[data-flow-zoom="out"]').addEventListener("click", () => zoomCanvas(-.1));
  dialog.querySelector("[data-flow-fit]").addEventListener("click", fitCanvas);
  canvas.addEventListener("wheel", (event) => {
    if (event.target.closest(".wp-flow-palette,.wp-flow-live-panel,.wp-flow-connect-menu,input,textarea,select")) return;
    event.preventDefault();
    zoomCanvas(event.deltaY > 0 ? -.06 : .06, event);
  }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("[data-flow-node],[data-flow-connect-menu],button,input,textarea,select")) return;
    event.preventDefault();
    hideConnectMenu();
    isPanningCanvas = true;
    canvas.classList.add("panning");
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = state.panX || 0;
    const originY = state.panY || 0;
    canvas.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      if (!isPanningCanvas) return;
      state.panX = originX + (moveEvent.clientX - startX);
      state.panY = originY + (moveEvent.clientY - startY);
      applyViewport();
      drawLines();
    };
    const stop = () => {
      isPanningCanvas = false;
      canvas.classList.remove("panning");
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", stop);
      canvas.removeEventListener("pointercancel", stop);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  });
  dialog.querySelector("[data-flow-settings]").addEventListener("click", () => {
    const triggerType = settingsDialog.querySelector('[name="triggerType"]');
    const templateSelect = settingsDialog.querySelector('[name="templateKey"]');
    triggerType.value = state.triggerType;
    settingsDialog.querySelector('[name="keywords"]').value = (state.triggerConfig.keywords || []).join(", ");
    settingsDialog.querySelector('[name="fallback"]').value = state.triggerConfig.fallback || "";
    templateSelect.innerHTML = `<option value="">Select a template</option>${replyTemplates.map((template) => `<option value="${escapeHtml(templateKeyFor(template))}">${escapeHtml(template.name)} · ${escapeHtml(template.language)}</option>`).join("")}`;
    templateSelect.value = state.triggerConfig.templateKey || "";
    syncTriggerSettingsVisibility();
    renderTemplateReplyMappings(templateSelect.value);
    settingsDialog.showModal();
  });
  settingsDialog.querySelector("[data-flow-settings-close]").addEventListener("click", () => settingsDialog.close());
  settingsDialog.querySelector('[name="triggerType"]')?.addEventListener("change", syncTriggerSettingsVisibility);
  settingsDialog.querySelector('[name="templateKey"]')?.addEventListener("change", (event) => renderTemplateReplyMappings(event.target.value));
  settingsDialog.querySelector("[data-flow-settings-apply]").addEventListener("click", () => {
    const triggerType = settingsDialog.querySelector('[name="triggerType"]').value;
    const keywords = settingsDialog.querySelector('[name="keywords"]').value.split(",").map((item) => item.trim()).filter(Boolean);
    const fallback = settingsDialog.querySelector('[name="fallback"]').value.trim();
    const templateKey = settingsDialog.querySelector('[name="templateKey"]').value;
    const template = templateByKey(templateKey);
    const templateReplies = [...settingsDialog.querySelectorAll("[data-flow-template-reply]")]
      .map((field) => ({ index: Number(field.dataset.flowTemplateReply), label: quickReplyButtons(template).find((button) => button.index === Number(field.dataset.flowTemplateReply))?.label || "", next: field.value }))
      .filter((reply) => reply.label && reply.next);
    if (triggerType === "template_reply" && (!template || !templateReplies.length)) return toast("Select an approved quick-reply template and map at least one reply.", "error");
    state.triggerType = triggerType;
    state.triggerConfig = {
      keywords,
      fallback,
      ...(triggerType === "template_reply" ? {
        templateKey,
        templateIntegrationId: String(template.integrationId || ""),
        templateName: String(template.name || ""),
        templateLanguage: String(template.language || ""),
        templateReplies,
      } : {}),
    };
    const start = state.nodes.find((node) => node.type === "start");
    if (start) start.config = { ...(start.config || {}), keywords: state.triggerConfig.keywords.join(",") };
    settingsDialog.close();
    renderNodes(false);
    toast("Trigger settings applied to this draft.");
  });
  form.addEventListener("submit", async (event) => { if (event.submitter?.value !== "save") return; event.preventDefault(); const submit = event.submitter; const name = form.elements.name.value.trim(); if (!name) return toast("Give the flow a name.", "error"); if (state.nodes.length < 2) return toast("Add at least one block after Flow start.", "error"); try { submit.disabled = true; submit.textContent = "Saving…"; const result = await request("save_flow", { flowId: state.id, name, description: state.description, status: form.elements.active.checked ? "active" : "draft", triggerType: state.triggerType, triggerConfig: state.triggerConfig, nodes: state.nodes, edges: normalizedEdges() }); state.id = result.flow.id; toast(form.elements.active.checked ? "Flow saved and activated." : "Flow saved as a draft."); const saveState = dialog.querySelector("[data-flow-save-state]"); if (saveState) saveState.textContent = "Draft saved"; if (isBuilderRoute) { history.replaceState({}, "", flowEditorUrl(state.id)); submit.disabled = false; submit.textContent = "Save changes"; } else { dialog.close(); await onRefresh(); } } catch (error) { toast(error.message || "Flow could not be saved.", "error"); submit.disabled = false; submit.textContent = "Save changes"; } });
  dialog.querySelector("[data-flow-exit]")?.addEventListener("click", goToList);
  paletteToggle?.addEventListener("click", () => setPaletteCollapsed(!dialog.classList.contains("palette-collapsed")));
  try { setPaletteCollapsed(localStorage.getItem(PALETTE_COLLAPSED_KEY) === "1", false); } catch { setPaletteCollapsed(false, false); }
  if (isBuilderRoute) {
    const requestedId = builderId || "new";
    if (requestedId.startsWith("copy:")) {
      const source = flows.find((flow) => flow.id === requestedId.slice(5));
      open(source ? { ...source, id: null, name: `${source.name} copy`, status: "draft" } : null);
    } else {
      const flow = requestedId && requestedId !== "new" ? flows.find((item) => item.id === requestedId) : null;
      if (requestedId !== "new" && !flow) toast("That flow could not be found. Starting a new draft.", "error");
      open(flow);
    }
  }
}
