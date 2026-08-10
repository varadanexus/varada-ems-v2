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
function statusLabel(value) { return value === "active" ? "Active" : value === "paused" ? "Paused" : "Draft"; }

export function renderFlowsView({ flows = [], escapeHtml }) {
  const active = flows.filter((flow) => flow.status === "active").length;
  const drafts = flows.filter((flow) => flow.status === "draft").length;
  const cards = flows.map((flow) => `<article class="wp-flow-row" data-flow-row data-flow-id="${escapeHtml(flow.id)}"><div class="wp-flow-row-icon">⌁</div><div><strong>${escapeHtml(flow.name)}</strong><p>${escapeHtml(flow.description || "Visual WhatsApp customer journey")}</p><footer><span>${escapeHtml(String(flow.trigger_type || "keyword").replaceAll("_", " "))} trigger</span><span>${Number(flow.nodes?.length || 0)} blocks</span><span>Updated ${escapeHtml(new Date(flow.updated_at).toLocaleDateString("en-IN"))}</span></footer></div><label class="wp-flow-status-switch"><input type="checkbox" data-flow-toggle ${flow.status === "active" ? "checked" : ""} /><span></span><em>${statusLabel(flow.status)}</em></label><div class="wp-flow-row-actions"><button class="wp-secondary" type="button" data-flow-duplicate>Duplicate</button><button class="wp-secondary" type="button" data-flow-edit>Edit</button><button class="wp-icon-danger" type="button" data-flow-delete aria-label="Delete ${escapeHtml(flow.name)}">×</button></div></article>`).join("");
  return `<section class="wp-route-page wp-flows-page"><div class="wp-route-heading"><div><span class="wp-kicker">No-code automation</span><h1>Flows</h1><p>Design chatbot journeys, qualify leads and automate support with a visual drag-and-drop builder.</p></div><button class="wp-primary" id="wpCreateFlowBtn" type="button">＋ Create flow</button></div><section class="wp-flow-summary"><article><span>Total flows</span><strong>${flows.length}</strong><small>Across this workspace</small></article><article><span>Active</span><strong>${active}</strong><small>Enabled in this workspace</small></article><article><span>Drafts</span><strong>${drafts}</strong><small>Ready to continue</small></article><article class="wp-flow-guide"><span>Quick guide</span><strong>Build → test → activate</strong><small>Start with a trigger, connect content and finish with an outcome.</small></article></section><section class="wp-card wp-flow-library"><header><div><span class="wp-card-eyebrow">Your automations</span><h2>Chatbot flows</h2></div><label class="wp-inbox-search"><span>⌕</span><input type="search" placeholder="Search flows" data-flow-search /></label></header><div class="wp-flow-list">${cards || `<div class="wp-inbox-empty"><span>⌁</span><strong>No flows yet</strong><p>Create your first visual WhatsApp automation without writing code.</p><button class="wp-primary" type="button" data-flow-empty-create>Create flow</button></div>`}</div></section>${builderDialog(escapeHtml)}</section>`;
}

function builderDialog(escapeHtml) {
  const groups = ["Message types", "Actions"].map((group) => `<section class="wp-flow-palette-group"><h3>${group}</h3><div>${BLOCKS.filter((item) => item[3] === group).map(([type, icon, label]) => `<button type="button" draggable="true" data-flow-block="${type}"><i>${icon}</i><span>${escapeHtml(label)}</span></button>`).join("")}</div></section>`).join("");
  return `<dialog class="wp-flow-builder-dialog" id="wpFlowBuilderDialog"><form method="dialog" novalidate><header class="wp-flow-builder-top"><button type="submit" value="cancel" class="wp-flow-back" aria-label="Close builder">←</button><div><input name="name" maxlength="120" value="Untitled flow" aria-label="Flow name" /><small data-flow-save-state>Draft not saved</small></div><label class="wp-flow-active-switch"><span>Inactive</span><input name="active" type="checkbox" /><i></i><strong>Active</strong></label><button class="wp-secondary" type="button" data-flow-settings>Triggers &amp; fallback</button><button class="wp-primary" type="submit" value="save">Save changes</button></header><div class="wp-flow-builder-shell"><aside class="wp-flow-palette"><div class="wp-flow-builder-tabs"><button class="active" type="button">Builder</button><button type="button" disabled>AI generator · soon</button></div>${groups}</aside><main class="wp-flow-canvas" data-flow-canvas><div class="wp-flow-canvas-grid"></div><svg aria-hidden="true" data-flow-lines></svg><div class="wp-flow-nodes" data-flow-nodes></div><div class="wp-flow-zoom"><button type="button" data-flow-zoom="in">＋</button><button type="button" data-flow-zoom="out">−</button><button type="button" data-flow-fit>Fit</button></div></main><aside class="wp-flow-inspector" data-flow-inspector><div class="wp-flow-inspector-empty"><span>✦</span><strong>Select a block</strong><p>Choose a block on the canvas to configure its message, action and routing.</p></div></aside></div></form></dialog><dialog class="wp-flow-settings-dialog" data-flow-settings-dialog><div><header><div><span class="wp-card-eyebrow">Entry &amp; recovery</span><h2>Triggers and fallback</h2></div><button type="button" data-flow-settings-close>×</button></header><label><span>Start this flow when</span><select name="triggerType"><option value="keyword">Customer sends a keyword</option><option value="any_message">Any new message arrives</option><option value="template_reply">Customer taps a template reply</option><option value="manual">Team starts it manually</option><option value="webhook">A secure webhook calls it</option></select></label><label><span>Keywords</span><input name="keywords" maxlength="500" placeholder="pricing, support, book demo" /><small>Comma-separated. Matching is case-insensitive.</small></label><label><span>Fallback message</span><textarea name="fallback" rows="4" maxlength="1024" placeholder="I didn't understand that. Please choose one of the options."></textarea></label><footer><button class="wp-primary" type="button" data-flow-settings-apply>Apply settings</button></footer></div></dialog>`;
}

export function bindFlowsView({ root, flows = [], request, onRefresh, toast, escapeHtml }) {
  const dialog = root.querySelector("#wpFlowBuilderDialog");
  if (!dialog) return;
  const form = dialog.querySelector(":scope > form");
  const canvas = dialog.querySelector("[data-flow-canvas]");
  const nodeLayer = dialog.querySelector("[data-flow-nodes]");
  const inspector = dialog.querySelector("[data-flow-inspector]");
  const lines = dialog.querySelector("[data-flow-lines]");
  const settingsDialog = root.querySelector("[data-flow-settings-dialog]");
  let state = { id: null, description: "", status: "draft", triggerType: "keyword", triggerConfig: { keywords: [], fallback: "" }, nodes: starterNodes(), edges: [], scale: 1 };
  let selectedId = state.nodes[0].id;
  const applyTransform = (element, transform) => {
    element.getAnimations().filter((animation) => animation.id === "wp-flow-layout").forEach((animation) => animation.cancel());
    const animation = element.animate({ transform }, { duration: 0, fill: "forwards" });
    animation.id = "wp-flow-layout";
  };

  const normalizedEdges = () => state.nodes.slice(0, -1).map((node, index) => ({ id: `${node.id}:${state.nodes[index + 1].id}`, from: node.id, to: state.nodes[index + 1].id }));
  const drawLines = () => {
    lines.innerHTML = normalizedEdges().map((edge) => { const a = state.nodes.find((n) => n.id === edge.from); const b = state.nodes.find((n) => n.id === edge.to); if (!a || !b) return ""; return `<path d="M ${a.x + 110} ${a.y + 154} C ${a.x + 110} ${a.y + 205}, ${b.x + 110} ${b.y - 50}, ${b.x + 110} ${b.y}" />`; }).join("");
    lines.setAttribute("viewBox", "0 0 2400 1600");
  };
  const selectNode = (id) => {
    selectedId = id; renderNodes(false);
    const node = state.nodes.find((item) => item.id === id);
    if (!node) return;
    inspector.innerHTML = `<header><span>${iconFor(node.type)}</span><div><small>${escapeHtml(node.type.replaceAll("_", " "))}</small><strong>${escapeHtml(node.title)}</strong></div>${node.type !== "start" ? `<button type="button" data-inspector-delete aria-label="Delete block">×</button>` : ""}</header><label><span>Block title</span><input name="nodeTitle" maxlength="80" value="${escapeHtml(node.title)}" /></label><label><span>Content or instruction</span><textarea name="nodeBody" rows="7" maxlength="2048">${escapeHtml(node.body)}</textarea></label>${node.type === "delay" ? `<label><span>Delay in minutes</span><input name="delayMinutes" type="number" min="1" max="10080" value="${Number(node.config?.minutes || 5)}" /></label>` : ""}${node.type === "api" ? `<label><span>HTTPS endpoint</span><input name="endpoint" type="url" placeholder="https://api.example.com/orders" value="${escapeHtml(node.config?.endpoint || "")}" /></label>` : ""}<div class="wp-flow-inspector-note"><strong>Next block</strong><p>Blocks follow the visual connection order. Drag them to arrange the journey.</p></div>`;
    inspector.querySelectorAll("input,textarea").forEach((input) => input.addEventListener("input", () => { node.title = inspector.querySelector('[name="nodeTitle"]')?.value || node.title; node.body = inspector.querySelector('[name="nodeBody"]')?.value || ""; node.config = { ...(node.config || {}), minutes: Number(inspector.querySelector('[name="delayMinutes"]')?.value || node.config?.minutes || 5), endpoint: inspector.querySelector('[name="endpoint"]')?.value || node.config?.endpoint || "" }; renderNodes(false); }));
    inspector.querySelector("[data-inspector-delete]")?.addEventListener("click", () => { state.nodes = state.nodes.filter((item) => item.id !== node.id); selectedId = state.nodes[0]?.id; renderNodes(); selectNode(selectedId); });
  };
  const renderNodes = (refreshInspector = true) => {
    applyTransform(nodeLayer, `scale(${state.scale})`);
    applyTransform(lines, `scale(${state.scale})`);
    nodeLayer.innerHTML = state.nodes.map((node, index) => `<article class="wp-flow-node ${node.id === selectedId ? "selected" : ""}" data-flow-node="${node.id}"><header><span>${iconFor(node.type)}</span><div><small>${node.type === "start" ? "Trigger" : `Step ${index}`}</small><strong>${escapeHtml(node.title)}</strong></div><button type="button" aria-label="More options">•••</button></header><p>${escapeHtml(node.body || DEFAULT_COPY[node.type])}</p>${node.type === "message" ? `<button type="button" tabindex="-1">＋ Add button</button>` : ""}<footer><span>${node.type === "condition" ? "Yes / No branches" : node.type === "handoff" ? "Assign team" : "＋ Add content"}</span></footer><i class="wp-flow-port in"></i><i class="wp-flow-port out"></i></article>`).join("");
    drawLines();
    nodeLayer.querySelectorAll("[data-flow-node]").forEach((card) => {
      const positionedNode = state.nodes.find((item) => item.id === card.dataset.flowNode);
      if (positionedNode) applyTransform(card, `translate(${positionedNode.x}px, ${positionedNode.y}px)`);
      card.addEventListener("click", () => selectNode(card.dataset.flowNode));
      card.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        const node = state.nodes.find((item) => item.id === card.dataset.flowNode); if (!node) return;
        const startX = event.clientX; const startY = event.clientY; const originX = node.x; const originY = node.y;
        card.setPointerCapture(event.pointerId);
        const move = (moveEvent) => { node.x = Math.max(20, originX + (moveEvent.clientX - startX) / state.scale); node.y = Math.max(20, originY + (moveEvent.clientY - startY) / state.scale); applyTransform(card, `translate(${node.x}px, ${node.y}px)`); drawLines(); };
        card.addEventListener("pointermove", move);
        card.addEventListener("pointerup", () => card.removeEventListener("pointermove", move), { once: true });
      });
    });
    if (refreshInspector && selectedId) selectNode(selectedId);
  };
  const addBlock = (type, point = {}) => {
    const index = state.nodes.length; const previous = state.nodes[index - 1];
    const node = { id: crypto.randomUUID(), type, title: BLOCKS.find((item) => item[0] === type)?.[2] || "Message", body: DEFAULT_COPY[type] || "Configure this step.", x: point.x ?? Math.max(80, (previous?.x || 80) + (index % 3 === 0 ? 280 : 0)), y: point.y ?? ((previous?.y || 20) + 210), config: {} };
    state.nodes.push(node); selectedId = node.id; renderNodes();
  };
  const open = (flow = null) => {
    state = flow ? { id: flow.id, description: flow.description || "", status: flow.status || "draft", triggerType: flow.trigger_type || "keyword", triggerConfig: flow.trigger_config || {}, nodes: Array.isArray(flow.nodes) && flow.nodes.length ? structuredClone(flow.nodes) : starterNodes(), edges: flow.edges || [], scale: 1 } : { id: null, description: "", status: "draft", triggerType: "keyword", triggerConfig: { keywords: [], fallback: "" }, nodes: starterNodes(), edges: [], scale: 1 };
    form.elements.name.value = flow?.name || "Untitled flow"; form.elements.active.checked = state.status === "active"; selectedId = state.nodes[0].id; dialog.showModal(); renderNodes();
  };
  root.querySelector("#wpCreateFlowBtn")?.addEventListener("click", () => open());
  root.querySelector("[data-flow-empty-create]")?.addEventListener("click", () => open());
  root.querySelector("[data-flow-search]")?.addEventListener("input", (event) => root.querySelectorAll("[data-flow-row]").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(event.target.value.trim().toLowerCase()); }));
  root.querySelectorAll("[data-flow-edit]").forEach((button) => button.addEventListener("click", () => open(flows.find((flow) => flow.id === button.closest("[data-flow-id]").dataset.flowId))));
  root.querySelectorAll("[data-flow-duplicate]").forEach((button) => button.addEventListener("click", () => { const source = flows.find((flow) => flow.id === button.closest("[data-flow-id]").dataset.flowId); open(source ? { ...source, id: null, name: `${source.name} copy`, status: "draft" } : null); }));
  root.querySelectorAll("[data-flow-delete]").forEach((button) => button.addEventListener("click", async () => { const id = button.closest("[data-flow-id]").dataset.flowId; if (!confirm("Delete this flow? This cannot be undone.")) return; try { await request("delete_flow", { flowId: id }); toast("Flow deleted."); await onRefresh(); } catch (error) { toast(error.message || "Flow could not be deleted.", "error"); } }));
  root.querySelectorAll("[data-flow-toggle]").forEach((input) => input.addEventListener("change", async () => { const id = input.closest("[data-flow-id]").dataset.flowId; try { await request("set_flow_status", { flowId: id, status: input.checked ? "active" : "paused" }); toast(input.checked ? "Flow activated." : "Flow paused."); await onRefresh(); } catch (error) { input.checked = !input.checked; toast(error.message || "Flow status could not be changed.", "error"); } }));
  dialog.querySelectorAll("[data-flow-block]").forEach((button) => { button.addEventListener("click", () => addBlock(button.dataset.flowBlock)); button.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", button.dataset.flowBlock)); });
  canvas.addEventListener("dragover", (event) => event.preventDefault()); canvas.addEventListener("drop", (event) => { event.preventDefault(); const type = event.dataTransfer.getData("text/plain"); if (!type) return; const rect = canvas.getBoundingClientRect(); addBlock(type, { x: (event.clientX - rect.left) / state.scale, y: (event.clientY - rect.top) / state.scale }); });
  dialog.querySelector('[data-flow-zoom="in"]').addEventListener("click", () => { state.scale = Math.min(1.4, state.scale + .1); renderNodes(false); });
  dialog.querySelector('[data-flow-zoom="out"]').addEventListener("click", () => { state.scale = Math.max(.5, state.scale - .1); renderNodes(false); });
  dialog.querySelector("[data-flow-fit]").addEventListener("click", () => { state.scale = .75; canvas.scrollTo({ top: 0, left: 0, behavior: "smooth" }); renderNodes(false); });
  dialog.querySelector("[data-flow-settings]").addEventListener("click", () => { settingsDialog.querySelector('[name="triggerType"]').value = state.triggerType; settingsDialog.querySelector('[name="keywords"]').value = (state.triggerConfig.keywords || []).join(", "); settingsDialog.querySelector('[name="fallback"]').value = state.triggerConfig.fallback || ""; settingsDialog.showModal(); });
  settingsDialog.querySelector("[data-flow-settings-close]").addEventListener("click", () => settingsDialog.close());
  settingsDialog.querySelector("[data-flow-settings-apply]").addEventListener("click", () => { state.triggerType = settingsDialog.querySelector('[name="triggerType"]').value; state.triggerConfig = { keywords: settingsDialog.querySelector('[name="keywords"]').value.split(",").map((item) => item.trim()).filter(Boolean), fallback: settingsDialog.querySelector('[name="fallback"]').value.trim() }; settingsDialog.close(); toast("Trigger settings applied to this draft."); });
  form.addEventListener("submit", async (event) => { if (event.submitter?.value !== "save") return; event.preventDefault(); const submit = event.submitter; const name = form.elements.name.value.trim(); if (!name) return toast("Give the flow a name.", "error"); if (state.nodes.length < 2) return toast("Add at least one block after Flow start.", "error"); try { submit.disabled = true; submit.textContent = "Saving…"; const result = await request("save_flow", { flowId: state.id, name, description: state.description, status: form.elements.active.checked ? "active" : "draft", triggerType: state.triggerType, triggerConfig: state.triggerConfig, nodes: state.nodes, edges: normalizedEdges() }); state.id = result.flow.id; dialog.close(); toast(form.elements.active.checked ? "Flow saved and activated." : "Flow saved as a draft."); await onRefresh(); } catch (error) { toast(error.message || "Flow could not be saved.", "error"); submit.disabled = false; submit.textContent = "Save changes"; } });
}
