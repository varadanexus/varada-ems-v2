const BLOCKS = [
  ["message", "▤", "Text & buttons", "Message types"],
  ["media", "▧", "Media message", "Message types"],
  ["list", "☷", "List", "Message types"],
  ["catalog", "▦", "Catalogue", "Message types"],
  ["single_product", "▱", "Single product", "Message types"],
  ["multi_product", "▦", "Multi product", "Message types"],
  ["template", "ϟ", "Approved template", "Message types"],
  ["question", "?", "Ask question", "Actions"],
  ["address", "⌖", "Ask address", "Actions"],
  ["location", "◎", "Ask location", "Actions"],
  ["ask_media", "▧", "Ask media", "Actions"],
  ["condition", "⑂", "Condition", "Actions"],
  ["api", "⌁", "API request", "Actions"],
  ["attribute", "◇", "Set attribute", "Actions"],
  ["tag", "◆", "Add tag", "Actions"],
  ["handoff", "♙", "Human handoff", "Actions"],
  ["connect", "↗", "Connect flow", "Actions"],
  ["delay", "◷", "Delay", "Actions"],
  ["end", "■", "End flow", "Actions"],
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

function iconFor(type) { return BLOCKS.find((item) => item[0] === type)?.[1] || (type === "start" ? "⚡" : "▤"); }
const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="10" rx="2"></rect><path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"></path></svg>`;
const DELETE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"></path><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"></path></svg>`;
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
  return `<option value="" ${!selected ? "selected" : ""}>Auto next step</option>${nodes.filter((item) => item.id !== selected).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title || item.type)}</option>`).join("")}`;
}
function renderQuickButtons(node, escapeHtml, nodes = []) {
  const buttons = buttonValues(node);
  return `<div class="wp-flow-inline-buttons"><span>Reply buttons</span>${buttons.map((button, index) => `<label><input data-node-button-label="${index}" maxlength="20" value="${escapeHtml(button.label)}" placeholder="Button ${index + 1}" /><select data-node-button-next="${index}" title="Route this button">${nodeOptions(nodes, escapeHtml, button.next)}</select><button type="button" data-flow-remove-button="${index}" aria-label="Remove button">×</button></label>`).join("")}<button type="button" data-flow-add-button>＋ Add Button</button></div>`;
}
function renderNodeFields(node, escapeHtml, nodes = []) {
  const config = node.config || {};
  if (node.type === "start") {
    return `<div class="wp-flow-inline-editor"><label><span>Keyword trigger</span><input data-node-field="keywords" maxlength="240" placeholder="Type, press enter to add keyword" value="${escapeHtml(fieldValue(node, "keywords"))}" /></label><label><span>Regex trigger</span><input data-node-field="regex" maxlength="240" placeholder="Enter regex to match substring trigger" value="${escapeHtml(fieldValue(node, "regex"))}" /></label><label class="wp-flow-inline-check"><input data-node-field="caseSensitive" type="checkbox" ${config.caseSensitive ? "checked" : ""} /><span>Case sensitive</span></label><div class="wp-flow-inline-note"><strong>Begin flow with</strong><button type="button" data-flow-add-next="template">Approved template</button><button type="button" data-flow-add-next="message">Message</button></div></div>`;
  }
  if (node.type === "media" || node.type === "ask_media") {
    return `<div class="wp-flow-inline-editor"><label><span>AI keywords</span><input data-node-field="aiKeywords" maxlength="240" placeholder="Enter AI keywords" value="${escapeHtml(fieldValue(node, "aiKeywords"))}" /></label><label><span>Media type</span><select data-node-field="mediaType"><option value="image" ${config.mediaType === "image" ? "selected" : ""}>Image</option><option value="video" ${config.mediaType === "video" ? "selected" : ""}>Video</option><option value="document" ${config.mediaType === "document" ? "selected" : ""}>Document</option></select></label><label><span>Media URL</span><input data-node-field="mediaUrl" type="url" placeholder="Paste secure media URL" value="${escapeHtml(fieldValue(node, "mediaUrl"))}" /></label><label><span>Caption</span><textarea data-node-field="body" maxlength="1024" placeholder="Caption...">${escapeHtml(node.body || "")}</textarea><em data-flow-count>${Number((node.body || "").length)}/1024</em></label>${renderQuickButtons(node, escapeHtml, nodes)}</div>`;
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
  if (["question", "address", "location", "attribute", "tag", "connect", "handoff", "end"].includes(node.type)) {
    return `<div class="wp-flow-inline-editor"><label><span>${node.type === "handoff" ? "Team note" : node.type === "connect" ? "Flow name" : node.type === "tag" ? "Tag name" : node.type === "attribute" ? "Attribute name" : "Prompt"}</span><input data-node-field="target" maxlength="120" placeholder="${escapeHtml(DEFAULT_COPY[node.type])}" value="${escapeHtml(fieldValue(node, "target"))}" /></label><label><span>Message</span><textarea data-node-field="body" maxlength="1024" placeholder="Type message...">${escapeHtml(node.body || "")}</textarea><em data-flow-count>${Number((node.body || "").length)}/1024</em></label></div>`;
  }
  return `<div class="wp-flow-inline-editor"><label><span>AI keywords</span><input data-node-field="aiKeywords" maxlength="240" placeholder="Enter AI keywords" value="${escapeHtml(fieldValue(node, "aiKeywords"))}" /></label><label><span>Message body</span><textarea data-node-field="body" maxlength="1024" placeholder="Type message...">${escapeHtml(node.body || "")}</textarea><em data-flow-count>${Number((node.body || "").length)}/1024</em></label>${renderQuickButtons(node, escapeHtml, nodes)}<label><span>Delay</span><input data-node-field="seconds" type="number" min="0" max="86400" placeholder="Type delay in seconds..." value="${escapeHtml(fieldValue(node, "seconds"))}" /></label><label class="wp-flow-inline-check"><input data-node-field="timeoutEnabled" type="checkbox" ${config.timeoutEnabled ? "checked" : ""} /><span>Set timeout</span></label></div>`;
}

export function renderFlowsView({ flows = [], escapeHtml }) {
  const active = flows.filter((flow) => flow.status === "active").length;
  const drafts = flows.filter((flow) => flow.status === "draft").length;
  const cards = flows.map((flow) => `<article class="wp-flow-row" data-flow-row data-flow-id="${escapeHtml(flow.id)}"><div class="wp-flow-row-icon">⌁</div><div><strong>${escapeHtml(flow.name)}</strong><p>${escapeHtml(flow.description || "Visual WhatsApp customer journey")}</p><footer><span>${escapeHtml(String(flow.trigger_type || "keyword").replaceAll("_", " "))} trigger</span><span>${Number(flow.nodes?.length || 0)} blocks</span><span>Updated ${escapeHtml(new Date(flow.updated_at).toLocaleDateString("en-IN"))}</span></footer></div><label class="wp-flow-status-switch"><input type="checkbox" data-flow-toggle ${flow.status === "active" ? "checked" : ""} /><span></span><em>${statusLabel(flow.status)}</em></label><div class="wp-flow-row-actions"><button class="wp-secondary" type="button" data-flow-duplicate>Duplicate</button><button class="wp-secondary" type="button" data-flow-edit>Edit</button><button class="wp-icon-danger" type="button" data-flow-delete aria-label="Delete ${escapeHtml(flow.name)}">×</button></div></article>`).join("");
  return `<section class="wp-route-page wp-flows-page"><div class="wp-route-heading"><div><span class="wp-kicker">No-code automation</span><h1>Flows</h1><p>Design chatbot journeys, qualify leads and automate support with a visual drag-and-drop builder.</p></div><button class="wp-primary" id="wpCreateFlowBtn" type="button">＋ Create flow</button></div><section class="wp-flow-summary"><article><span>Total flows</span><strong>${flows.length}</strong><small>Across this workspace</small></article><article><span>Active</span><strong>${active}</strong><small>Enabled in this workspace</small></article><article><span>Drafts</span><strong>${drafts}</strong><small>Ready to continue</small></article><article class="wp-flow-guide"><span>Quick guide</span><strong>Build → test → activate</strong><small>Start with a trigger, connect content and finish with an outcome.</small></article></section><section class="wp-card wp-flow-library"><header><div><span class="wp-card-eyebrow">Your automations</span><h2>Chatbot flows</h2></div><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search flows" data-flow-search /></label></header><div class="wp-flow-list">${cards || `<div class="wp-inbox-empty"><span>⌁</span><strong>No flows yet</strong><p>Create your first visual WhatsApp automation without writing code.</p><button class="wp-primary" type="button" data-flow-empty-create>Create flow</button></div>`}</div></section>${builderDialog(escapeHtml)}</section>`;
}

function builderDialog(escapeHtml) {
  const groups = ["Message types", "Actions"].map((group) => `<section class="wp-flow-palette-group"><h3>${group}</h3><div>${BLOCKS.filter((item) => item[3] === group).map(([type, icon, label]) => `<button type="button" draggable="true" data-flow-block="${type}"><i>${icon}</i><span>${escapeHtml(label)}</span></button>`).join("")}</div></section>`).join("");
  return `<dialog class="wp-flow-builder-dialog" id="wpFlowBuilderDialog"><form method="dialog" novalidate><header class="wp-flow-builder-top"><button type="submit" value="cancel" class="wp-flow-back" aria-label="Close builder">←</button><div><input name="name" maxlength="120" value="Untitled flow" aria-label="Flow name" /><small data-flow-save-state>Draft not saved</small></div><label class="wp-flow-ai-draft"><span>TRY AI</span><input name="aiPrompt" maxlength="240" placeholder="What should this flow create?" /><button type="button" data-flow-ai-draft>Generate draft</button></label><label class="wp-flow-active-switch"><span>Inactive</span><input name="active" type="checkbox" /><i></i><strong>Active</strong></label><button class="wp-secondary" type="button" data-flow-settings>Triggers &amp; fallback</button><button class="wp-primary" type="submit" value="save">Save changes</button></header><div class="wp-flow-builder-shell"><aside class="wp-flow-palette"><div class="wp-flow-builder-tabs"><button class="active" type="button" data-flow-tab="builder">Builder</button><button type="button" data-flow-tab="live">Live view</button><button type="button" disabled>AI generator · soon</button></div><div data-flow-panel="builder">${groups}</div><div class="wp-flow-live-panel" data-flow-panel="live" hidden><h3>Live flow test</h3><p>Preview how a customer will experience this automation before saving or activating it.</p><button type="button" class="wp-primary" data-flow-live-start>Start preview</button><div class="wp-flow-live-phone" data-flow-live-phone><header><span>WhatsApp</span><strong>Customer preview</strong></header><main data-flow-live-messages><div class="wp-flow-live-empty">Press Start preview to run this flow.</div></main><footer><input value="Customer reply…" readonly /></footer></div></div></aside><main class="wp-flow-canvas" data-flow-canvas><div class="wp-flow-canvas-grid"></div><svg aria-hidden="true" data-flow-lines></svg><div class="wp-flow-nodes" data-flow-nodes></div><div class="wp-flow-minimap" data-flow-minimap aria-label="Flow overview"></div><div class="wp-flow-zoom"><button type="button" data-flow-zoom="in">＋</button><button type="button" data-flow-zoom="out">−</button><button type="button" data-flow-fit>Fit</button></div></main></div></form></dialog><dialog class="wp-flow-settings-dialog" data-flow-settings-dialog><div><header><div><span class="wp-card-eyebrow">Entry &amp; recovery</span><h2>Triggers and fallback</h2></div><button type="button" data-flow-settings-close>×</button></header><label><span>Start this flow when</span><select name="triggerType"><option value="keyword">Customer sends a keyword</option><option value="any_message">Any new message arrives</option><option value="template_reply">Customer taps a template reply</option><option value="manual">Team starts it manually</option><option value="webhook">A secure webhook calls it</option></select></label><label><span>Keywords</span><input name="keywords" maxlength="500" placeholder="pricing, support, book demo" /><small>Comma-separated. Matching is case-insensitive.</small></label><label><span>Fallback message</span><textarea name="fallback" rows="4" maxlength="1024" placeholder="I didn't understand that. Please choose one of the options."></textarea></label><footer><button class="wp-primary" type="button" data-flow-settings-apply>Apply settings</button></footer></div></dialog>`;
}

export function bindFlowsView({ root, flows = [], request, onRefresh, toast, escapeHtml }) {
  const dialog = root.querySelector("#wpFlowBuilderDialog");
  if (!dialog) return;
  const form = dialog.querySelector(":scope > form");
  const canvas = dialog.querySelector("[data-flow-canvas]");
  const nodeLayer = dialog.querySelector("[data-flow-nodes]");
  const lines = dialog.querySelector("[data-flow-lines]");
  const miniMap = dialog.querySelector("[data-flow-minimap]");
  const liveMessages = dialog.querySelector("[data-flow-live-messages]");
  const settingsDialog = root.querySelector("[data-flow-settings-dialog]");
  let state = { id: null, description: "", status: "draft", triggerType: "keyword", triggerConfig: { keywords: [], fallback: "" }, nodes: starterNodes(), edges: [], scale: 1, panX: 0, panY: 0 };
  let selectedId = state.nodes[0].id;
  let suppressNodeClick = false;
  let isPanningCanvas = false;
  const applyTransform = (element, transform) => {
    element.getAnimations().filter((animation) => animation.id === "wp-flow-layout").forEach((animation) => animation.cancel());
    const animation = element.animate({ transform }, { duration: 0, fill: "forwards" });
    animation.id = "wp-flow-layout";
  };
  const markDraftChanged = () => {
    const saveState = dialog.querySelector("[data-flow-save-state]");
    if (saveState) saveState.textContent = "Draft changed";
  };
  const applyViewport = () => {
    const transform = `translate(${state.panX || 0}px, ${state.panY || 0}px) scale(${state.scale})`;
    applyTransform(nodeLayer, transform);
    applyTransform(lines, transform);
  };
  const focusInspectorField = (id, fieldName = "nodeBody") => {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    const nextTitle = prompt("Block title", node.title || "");
    if (nextTitle === null) return;
    node.title = nextTitle.trim() || node.title;
    markDraftChanged();
    renderNodes(false);
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
  };

  const normalizedEdges = () => state.nodes.slice(0, -1).map((node, index) => ({ id: `${node.id}:${state.nodes[index + 1].id}`, from: node.id, to: state.nodes[index + 1].id }));
  const nextNodeAfter = (node) => state.nodes[state.nodes.findIndex((item) => item.id === node.id) + 1] || null;
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
      const routed = state.nodes.find((item) => item.id === chosen.next) || nextNodeAfter(node);
      if (routed) window.setTimeout(() => renderLiveNode(routed), 260);
    }));
    if (!buttons.length && node.type !== "end") {
      const next = nextNodeAfter(node);
      if (next) window.setTimeout(() => renderLiveNode(next), 480);
    }
  };
  const startLivePreview = () => {
    if (!liveMessages) return;
    liveMessages.innerHTML = "";
    renderLiveNode(state.nodes[0]);
  };
  const drawMiniMap = () => {
    if (!miniMap) return;
    const inset = 9;
    const mapWidth = Math.max(1, miniMap.clientWidth - inset * 2);
    const mapHeight = Math.max(1, miniMap.clientHeight - inset * 2);
    const worldWidth = 2400;
    const worldHeight = 1600;
    const scaleX = mapWidth / worldWidth;
    const scaleY = mapHeight / worldHeight;
    const viewportLeft = Math.max(0, (canvas.scrollLeft - (state.panX || 0)) / state.scale);
    const viewportTop = Math.max(0, (canvas.scrollTop - (state.panY || 0)) / state.scale);
    const viewportWidth = Math.min(worldWidth, canvas.clientWidth / state.scale);
    const viewportHeight = Math.min(worldHeight, canvas.clientHeight / state.scale);
    const nodes = state.nodes.map((node) => {
      const left = inset + Math.max(0, Math.min(worldWidth - 260, Number(node.x || 0))) * scaleX;
      const top = inset + Math.max(0, Math.min(worldHeight - 180, Number(node.y || 0))) * scaleY;
      const width = Math.max(12, 260 * scaleX);
      const height = Math.max(8, 170 * scaleY);
      return `<span class="${node.id === selectedId ? "active" : ""}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px" title="${escapeHtml(node.title)}"></span>`;
    }).join("");
    miniMap.innerHTML = `${nodes}<i class="wp-flow-minimap-view" style="left:${inset + viewportLeft * scaleX}px;top:${inset + viewportTop * scaleY}px;width:${Math.max(18, viewportWidth * scaleX)}px;height:${Math.max(14, viewportHeight * scaleY)}px"></i>`;
  };
  const centerCanvasOn = (worldX, worldY) => {
    state.panX = Math.round((canvas.clientWidth / 2) - (worldX * state.scale));
    state.panY = Math.round((canvas.clientHeight / 2) - (worldY * state.scale));
    canvas.scrollTo({ left: 0, top: 0, behavior: "auto" });
    applyViewport();
    drawLines();
  };
  const navigateMiniMap = (event) => {
    if (!miniMap) return;
    const rect = miniMap.getBoundingClientRect();
    const inset = 9;
    const mapWidth = Math.max(1, rect.width - inset * 2);
    const mapHeight = Math.max(1, rect.height - inset * 2);
    const x = Math.max(0, Math.min(mapWidth, event.clientX - rect.left - inset));
    const y = Math.max(0, Math.min(mapHeight, event.clientY - rect.top - inset));
    centerCanvasOn((x / mapWidth) * 2400, (y / mapHeight) * 1600);
  };
  const drawLines = () => {
    lines.innerHTML = normalizedEdges().map((edge) => { const a = state.nodes.find((n) => n.id === edge.from); const b = state.nodes.find((n) => n.id === edge.to); if (!a || !b) return ""; return `<path d="M ${a.x + 110} ${a.y + 154} C ${a.x + 110} ${a.y + 205}, ${b.x + 110} ${b.y - 50}, ${b.x + 110} ${b.y}" />`; }).join("");
    lines.setAttribute("viewBox", "0 0 2400 1600");
    drawMiniMap();
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
    selectedId = state.nodes[Math.max(0, Math.min(state.nodes.length - 1, state.nodes.findIndex((item) => item.id === id)))]?.id || state.nodes[0]?.id;
    markDraftChanged();
    renderNodes();
  };
  const renderNodes = (refreshInspector = true) => {
    applyViewport();
    nodeLayer.innerHTML = state.nodes.map((node, index) => `<article class="wp-flow-node ${node.id === selectedId ? "selected" : ""}" data-flow-node="${node.id}">${node.id === selectedId && node.type !== "start" ? `<div class="wp-flow-card-actions"><button type="button" data-flow-copy-node aria-label="Copy block" title="Copy block">${COPY_ICON}</button><button type="button" data-flow-delete-node aria-label="Delete block" title="Delete block">${DELETE_ICON}</button></div>` : ""}<header><span>${iconFor(node.type)}</span><div><small>${node.type === "start" ? "Trigger" : `Step ${index}`}</small><strong>${escapeHtml(node.title)}</strong></div><button type="button" data-flow-edit-title aria-label="Edit block title">•••</button></header>${renderNodeFields(node, escapeHtml, state.nodes)}<footer data-flow-add-next="message" role="button" tabindex="0"><span>＋ Add content</span></footer><i class="wp-flow-port in"></i><i class="wp-flow-port out"></i></article>`).join("");
    drawLines();
    nodeLayer.querySelectorAll("[data-flow-node]").forEach((card) => {
      const positionedNode = state.nodes.find((item) => item.id === card.dataset.flowNode);
      if (positionedNode) applyTransform(card, `translate(${positionedNode.x}px, ${positionedNode.y}px)`);
      card.addEventListener("click", () => {
        if (suppressNodeClick) {
          suppressNodeClick = false;
          return;
        }
        selectNode(card.dataset.flowNode);
      });
      card.querySelector("[data-flow-edit-title]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        focusInspectorField(card.dataset.flowNode, "nodeTitle");
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
      card.querySelectorAll("[data-node-button-label],[data-node-button-next]").forEach((field) => {
        const updateButton = () => {
          const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
          node.config = { ...(node.config || {}) };
          const buttons = buttonValues(node).slice();
          const index = Number(field.dataset.nodeButtonLabel ?? field.dataset.nodeButtonNext);
          buttons[index] = { ...(buttons[index] || { label: "", next: "" }), [field.dataset.nodeButtonLabel !== undefined ? "label" : "next"]: field.value };
          node.config.buttons = buttons;
          markDraftChanged();
        };
        field.addEventListener("input", updateButton);
        field.addEventListener("change", updateButton);
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
          node.x = Math.max(20, Math.round(originX + deltaX));
          node.y = Math.max(20, Math.round(originY + deltaY));
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
    if (refreshInspector && selectedId) selectNode(selectedId);
  };
  const addBlock = (type, point = {}, afterId = null) => {
    const insertIndex = afterId ? Math.max(0, state.nodes.findIndex((item) => item.id === afterId)) + 1 : state.nodes.length;
    const index = insertIndex; const previous = state.nodes[index - 1] || state.nodes[state.nodes.length - 1];
    const node = { id: crypto.randomUUID(), type, title: BLOCKS.find((item) => item[0] === type)?.[2] || "Message", body: DEFAULT_COPY[type] || "Configure this step.", x: point.x ?? Math.max(80, (previous?.x || 80) + (index % 3 === 0 ? 280 : 0)), y: point.y ?? ((previous?.y || 20) + 210), config: {} };
    state.nodes.splice(insertIndex, 0, node); selectedId = node.id; markDraftChanged(); renderNodes();
  };
  const open = (flow = null) => {
    state = flow ? { id: flow.id, description: flow.description || "", status: flow.status || "draft", triggerType: flow.trigger_type || "keyword", triggerConfig: flow.trigger_config || {}, nodes: Array.isArray(flow.nodes) && flow.nodes.length ? structuredClone(flow.nodes) : starterNodes(), edges: flow.edges || [], scale: 1, panX: 0, panY: 0 } : { id: null, description: "", status: "draft", triggerType: "keyword", triggerConfig: { keywords: [], fallback: "" }, nodes: starterNodes(), edges: [], scale: 1, panX: 0, panY: 0 };
    form.elements.name.value = flow?.name || "Untitled flow"; form.elements.active.checked = state.status === "active"; selectedId = state.nodes[0].id; dialog.showModal(); renderNodes();
  };
  const generateDraft = () => {
    const prompt = form.elements.aiPrompt?.value.trim() || "customer follow up";
    const start = starterNodes()[0];
    start.config = { keywords: prompt.split(/\s+/).slice(0, 4).join(", "), caseSensitive: false };
    const first = { id: crypto.randomUUID(), type: "message", title: "Welcome message", body: `Thanks for reaching out about ${prompt}. How can we help you today?`, x: 420, y: 90, config: { aiKeywords: prompt, buttons: [{ label: "Talk to team", next: "" }, { label: "View details", next: "" }] } };
    const qualify = { id: crypto.randomUUID(), type: "question", title: "Qualify request", body: "Please share a few details so our team can guide you correctly.", x: 760, y: 90, config: { target: "Requirement" } };
    const handoff = { id: crypto.randomUUID(), type: "handoff", title: "Team handoff", body: "A specialist will review this conversation and respond shortly.", x: 1100, y: 90, config: { target: "Sales/support team" } };
    first.config.buttons[0].next = handoff.id;
    first.config.buttons[1].next = qualify.id;
    state.nodes = [start, first, qualify, handoff];
    selectedId = first.id;
    markDraftChanged();
    renderNodes();
    toast("Draft flow generated. Review the content and routing before saving.");
  };
  root.querySelector("#wpCreateFlowBtn")?.addEventListener("click", () => open());
  root.querySelector("[data-flow-empty-create]")?.addEventListener("click", () => open());
  root.querySelector("[data-flow-search]")?.addEventListener("input", (event) => root.querySelectorAll("[data-flow-row]").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(event.target.value.trim().toLowerCase()); }));
  root.querySelectorAll("[data-flow-edit]").forEach((button) => button.addEventListener("click", () => open(flows.find((flow) => flow.id === button.closest("[data-flow-id]").dataset.flowId))));
  root.querySelectorAll("[data-flow-duplicate]").forEach((button) => button.addEventListener("click", () => { const source = flows.find((flow) => flow.id === button.closest("[data-flow-id]").dataset.flowId); open(source ? { ...source, id: null, name: `${source.name} copy`, status: "draft" } : null); }));
  root.querySelectorAll("[data-flow-delete]").forEach((button) => button.addEventListener("click", async () => { const id = button.closest("[data-flow-id]").dataset.flowId; if (!confirm("Delete this flow? This cannot be undone.")) return; try { await request("delete_flow", { flowId: id }); toast("Flow deleted."); await onRefresh(); } catch (error) { toast(error.message || "Flow could not be deleted.", "error"); } }));
  root.querySelectorAll("[data-flow-toggle]").forEach((input) => input.addEventListener("change", async () => { const id = input.closest("[data-flow-id]").dataset.flowId; try { await request("set_flow_status", { flowId: id, status: input.checked ? "active" : "paused" }); toast(input.checked ? "Flow activated." : "Flow paused."); await onRefresh(); } catch (error) { input.checked = !input.checked; toast(error.message || "Flow status could not be changed.", "error"); } }));
  dialog.querySelectorAll("[data-flow-block]").forEach((button) => { button.addEventListener("click", () => addBlock(button.dataset.flowBlock)); button.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", button.dataset.flowBlock)); });
  dialog.querySelector("[data-flow-ai-draft]")?.addEventListener("click", generateDraft);
  dialog.querySelectorAll("[data-flow-tab]").forEach((tab) => tab.addEventListener("click", () => {
    dialog.querySelectorAll("[data-flow-tab]").forEach((item) => item.classList.toggle("active", item === tab));
    dialog.querySelectorAll("[data-flow-panel]").forEach((panel) => { panel.hidden = panel.dataset.flowPanel !== tab.dataset.flowTab; });
    if (tab.dataset.flowTab === "live") startLivePreview();
  }));
  dialog.querySelector("[data-flow-live-start]")?.addEventListener("click", startLivePreview);
  canvas.addEventListener("dragover", (event) => event.preventDefault()); canvas.addEventListener("drop", (event) => { event.preventDefault(); const type = event.dataTransfer.getData("text/plain"); if (!type) return; const rect = canvas.getBoundingClientRect(); addBlock(type, { x: (event.clientX - rect.left) / state.scale, y: (event.clientY - rect.top) / state.scale }); });
  const zoomCanvas = (delta, origin = null) => {
    const previous = state.scale;
    const next = Math.max(.35, Math.min(1.8, Number((state.scale + delta).toFixed(2))));
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
  dialog.querySelector("[data-flow-fit]").addEventListener("click", () => { state.scale = .75; state.panX = 0; state.panY = 0; canvas.scrollTo({ top: 0, left: 0, behavior: "smooth" }); renderNodes(false); });
  canvas.addEventListener("wheel", (event) => {
    if (event.target.closest(".wp-flow-palette,.wp-flow-live-panel,input,textarea,select")) return;
    event.preventDefault();
    zoomCanvas(event.deltaY > 0 ? -.06 : .06, event);
  }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("[data-flow-node],button,input,textarea,select")) return;
    event.preventDefault();
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
  miniMap?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    navigateMiniMap(event);
    miniMap.setPointerCapture(event.pointerId);
    const move = (moveEvent) => navigateMiniMap(moveEvent);
    const stop = () => {
      miniMap.removeEventListener("pointermove", move);
      miniMap.removeEventListener("pointerup", stop);
      miniMap.removeEventListener("pointercancel", stop);
    };
    miniMap.addEventListener("pointermove", move);
    miniMap.addEventListener("pointerup", stop);
    miniMap.addEventListener("pointercancel", stop);
  });
  canvas.addEventListener("scroll", drawMiniMap, { passive: true });
  dialog.querySelector("[data-flow-settings]").addEventListener("click", () => { settingsDialog.querySelector('[name="triggerType"]').value = state.triggerType; settingsDialog.querySelector('[name="keywords"]').value = (state.triggerConfig.keywords || []).join(", "); settingsDialog.querySelector('[name="fallback"]').value = state.triggerConfig.fallback || ""; settingsDialog.showModal(); });
  settingsDialog.querySelector("[data-flow-settings-close]").addEventListener("click", () => settingsDialog.close());
  settingsDialog.querySelector("[data-flow-settings-apply]").addEventListener("click", () => { state.triggerType = settingsDialog.querySelector('[name="triggerType"]').value; state.triggerConfig = { keywords: settingsDialog.querySelector('[name="keywords"]').value.split(",").map((item) => item.trim()).filter(Boolean), fallback: settingsDialog.querySelector('[name="fallback"]').value.trim() }; settingsDialog.close(); toast("Trigger settings applied to this draft."); });
  form.addEventListener("submit", async (event) => { if (event.submitter?.value !== "save") return; event.preventDefault(); const submit = event.submitter; const name = form.elements.name.value.trim(); if (!name) return toast("Give the flow a name.", "error"); if (state.nodes.length < 2) return toast("Add at least one block after Flow start.", "error"); try { submit.disabled = true; submit.textContent = "Saving…"; const result = await request("save_flow", { flowId: state.id, name, description: state.description, status: form.elements.active.checked ? "active" : "draft", triggerType: state.triggerType, triggerConfig: state.triggerConfig, nodes: state.nodes, edges: normalizedEdges() }); state.id = result.flow.id; dialog.close(); toast(form.elements.active.checked ? "Flow saved and activated." : "Flow saved as a draft."); await onRefresh(); } catch (error) { toast(error.message || "Flow could not be saved.", "error"); submit.disabled = false; submit.textContent = "Save changes"; } });
}
