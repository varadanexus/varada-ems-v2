import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import {
  cancelCampaign,
  getCampaign,
  getCampaignDeliveryBreakdown,
  getNotificationDirectory,
  listCampaigns,
  listCampaignTemplates,
  previewCampaignAudience,
  publishCampaign,
  retryCampaignDelivery,
  saveCampaign,
  saveCampaignTemplate,
} from "./notification-studio-api.js";

const state = {
  directory: {},
  campaigns: [],
  templates: [],
  preview: null,
  editing: null,
  view:
    document.body?.dataset.notificationView ||
    new URLSearchParams(location.search).get("view") ||
    "campaigns",
};
const VIEW_ROUTES = {
  studio: ROUTES.NOTIFICATION_STUDIO,
  campaigns: ROUTES.NOTIFICATION_CAMPAIGNS,
  compose: ROUTES.NOTIFICATION_COMPOSE,
  templates: ROUTES.NOTIFICATION_TEMPLATES,
  analytics: ROUTES.NOTIFICATION_ANALYTICS,
};
const esc = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const fmt = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const selected = (element) =>
  Array.from(element?.selectedOptions || []).map((o) => o.value);
const sum = (items, key) =>
  items.reduce((n, item) => n + Number(item[key] || 0), 0);
let audienceRefreshTimer;

function setView(view) {
  location.href = VIEW_ROUTES[view] || ROUTES.NOTIFICATION_CAMPAIGNS;
}

function openView(view, params = {}) {
  const url = new URL(VIEW_ROUTES[view] || ROUTES.NOTIFICATION_CAMPAIGNS, location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  location.href = `${url.pathname}${url.search}`;
}

function metric(label, value, note, tone = "") {
  return `<article class="ns-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function dashboard() {
  const sent = state.campaigns.filter((c) => c.status === "sent");
  const scheduled = state.campaigns.filter((c) => c.status === "scheduled");
  const recipients =
    sum(sent, "staff_recipient_count") + sum(sent, "portal_recipient_count");
  const reads = sum(sent, "staff_read_count") + sum(sent, "portal_read_count");
  const rate = recipients ? `${Math.round((reads / recipients) * 100)}%` : "0%";
  return `<section class="ns-metrics">
    ${metric("Campaigns sent", sent.length, "Completed broadcasts", "gold")}
    ${metric("Total recipients", recipients.toLocaleString("en-IN"), "Staff + portal accounts")}
    ${metric("Read rate", rate, `${reads.toLocaleString("en-IN")} confirmed reads`, "green")}
    ${metric("Scheduled", scheduled.length, "Queued for automatic delivery")}
  </section>`;
}

function studioOverview() {
  return `${dashboard()}<section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">WORKSPACE</span><h3>Notification operations</h3></div></div><div class="ns-template-grid"><article class="ns-template"><span class="ns-status info">CREATE</span><h4>Compose notification</h4><p>Build a targeted in-app, push, email and WhatsApp campaign.</p><button data-view="compose">Open Compose</button></article><article class="ns-template"><span class="ns-status info">CONTROL</span><h4>Campaigns</h4><p>Review drafts, schedules, delivery status and retry failed channels.</p><button data-view="campaigns">Open Campaigns</button></article><article class="ns-template"><span class="ns-status info">REUSE</span><h4>Templates</h4><p>Maintain approved reusable content and channel defaults.</p><button data-view="templates">Open Templates</button></article><article class="ns-template"><span class="ns-status info">MEASURE</span><h4>Analytics</h4><p>Monitor reach, reads and omnichannel campaign performance.</p><button data-view="analytics">Open Analytics</button></article></div></section>`;
}

function campaignTable() {
  if (!state.campaigns.length)
    return `<div class="empty-state">No campaigns yet. Create your first notification campaign.</div>`;
  return `<div class="ns-table-wrap"><table class="ns-table"><thead><tr><th>Campaign</th><th>Audience</th><th>Status</th><th>Delivery</th><th>Timing</th><th>Actions</th></tr></thead><tbody>${state.campaigns
    .map((c) => {
      const total =
        Number(c.staff_recipient_count || 0) +
        Number(c.portal_recipient_count || 0);
      const reads =
        Number(c.staff_read_count || 0) + Number(c.portal_read_count || 0);
      const mail = `${Number(c.email_sent_count || 0)} sent${Number(c.email_failed_count || 0) ? ` · ${Number(c.email_failed_count)} failed` : ""}`;
      const wa = `${Number(c.whatsapp_sent_count || 0)} sent${Number(c.whatsapp_failed_count || 0) ? ` · ${Number(c.whatsapp_failed_count)} failed` : ""}`;
      return `<tr><td><strong>${esc(c.campaign_name)}</strong><span>${esc(c.title)}</span></td><td><strong>${esc(String(c.audience_mode || "").replaceAll("_", " "))}</strong><span>${total ? `${total} account recipients` : "Direct recipients only / not dispatched"}</span></td><td><span class="ns-status ${esc(c.status)}">${esc(c.status)}</span></td><td><strong>${reads}/${total || 0} read · ${Number(c.push_delivered_count || 0)} push</strong><span>Email ${mail} · WhatsApp ${wa}</span></td><td><strong>${c.status === "scheduled" ? fmt(c.scheduled_for) : fmt(c.sent_at || c.created_at)}</strong><span>${esc(c.timezone || "Asia/Kolkata")}</span></td><td><div class="ns-actions"><button data-deliveries="${c.id}">Delivery log</button><button data-reuse="${c.id}">Reuse</button>${["draft", "scheduled"].includes(c.status) ? `<button data-edit="${c.id}">Edit</button><button data-cancel="${c.id}" class="danger">Cancel</button>` : ""}</div></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

const options = (items, value = "id", label = "name") =>
  (items || [])
    .map(
      (x) =>
        `<option value="${esc(x[value])}">${esc(x[label] || x.email || x[value])}</option>`,
    )
    .join("");
function composer() {
  const c = state.editing || {};
  return `<form id="campaignForm" class="ns-compose">
    <input type="hidden" name="id" value="${esc(c.id || "")}">
    <section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">MESSAGE</span><h3>Compose notification</h3></div><span class="ns-step">01</span></div>
      <div class="form-grid"><label>Campaign name<input name="campaign_name" required maxlength="120" value="${esc(c.campaign_name || "")}" placeholder="e.g. Quarterly policy announcement"></label><label>Category<select name="category"><option>general</option><option>announcement</option><option>operations</option><option>compliance</option><option>finance</option><option>security</option><option>maintenance</option></select></label></div>
      <label>Notification title<input name="title" required maxlength="120" value="${esc(c.title || "")}" placeholder="Short, clear headline"></label>
      <label>Message<textarea name="message" required maxlength="2000" rows="5" placeholder="Write the complete notification...">${esc(c.message || "")}</textarea><small><span id="messageCount">${String(c.message || "").length}</span>/2000 characters</small></label>
      <div class="form-grid three"><label>Severity<select name="severity"><option value="info">Information</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Critical</option></select></label><label>Action label<input name="action_label" maxlength="40" value="${esc(c.action_label || "")}" placeholder="Open details"></label><label>Action URL<input name="action_url" value="${esc(c.action_url || "")}" placeholder="/new-ems/modules/..."></label></div>
    </section>
    <section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">AUDIENCE</span><h3>Choose recipients</h3></div><span class="ns-step">02</span></div>
      <div class="ns-audience-grid"><label>Target group<select name="audience_mode" id="audienceMode"><option value="everyone">Everyone — all staff and portal users</option><option value="all_staff">All staff</option><option value="staff_roles">Staff by role</option><option value="staff_divisions">Staff by division</option><option value="staff_users">Selected staff</option><option value="all_portals">All portal users</option><option value="portal_types">Portal types</option><option value="portal_users">Selected portal users</option><option value="smart">Combined custom audience</option></select></label>
        <div id="audienceFields" class="ns-target-fields">
          <label data-target="staff_roles smart">Staff roles<select multiple name="role_codes">${options(state.directory.roles, "code")}</select></label>
          <label data-target="staff_divisions smart">Divisions<select multiple name="division_ids">${options(state.directory.divisions)}</select></label>
          <label data-target="staff_users smart">Staff users<select multiple name="staff_user_ids">${options(state.directory.staff)}</select></label>
          <label data-target="portal_types smart">Portal types<select multiple name="portal_types">${(state.directory.portal_types || []).map((x) => `<option>${esc(x)}</option>`).join("")}</select></label>
          <label data-target="portal_users smart">External portal users<select multiple name="external_user_ids">${options(state.directory.external_portals)}</select></label>
          <label data-target="portal_users smart">Transportation portal users<select multiple name="transport_user_ids">${options(state.directory.transport_portals)}</select></label>
        </div>
      </div>
      <div class="ns-direct-grid"><label>Additional email recipients<textarea name="direct_emails" rows="3" placeholder="accounts@example.com, client@example.com">${esc((c.audience?.direct_emails || []).join("\n"))}</textarea><small>Paste multiple addresses separated by commas, semicolons or new lines.</small></label><label>Additional mobile recipients<textarea name="direct_mobiles" rows="3" placeholder="9885623320\n+447700900123">${esc((c.audience?.direct_mobiles || []).join("\n"))}</textarea><small>10-digit numbers default to India (+91). Include +country code only for other countries.</small></label></div>
      <div id="audiencePreview" class="ns-recipient-preview">Calculating recipients…</div>
      <label class="ns-switch"><input type="checkbox" name="respect_preferences" checked><span>Respect staff notification preferences</span><small>Turn off only for mandatory operational or security notices.</small></label>
    </section>
    <section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">DELIVERY</span><h3>Channel and timing</h3></div><span class="ns-step">03</span></div>
      <div class="ns-channel-row"><label class="ns-channel active"><input type="checkbox" checked disabled>In-app inbox <small>Always retained for registered accounts</small></label><label class="ns-channel active"><input type="checkbox" name="push" checked>Background push <small>Android, web and iOS PWA devices</small></label><label class="ns-channel"><input type="checkbox" name="email">Email <small>Branded delivery through ZeptoMail</small></label><label class="ns-channel"><input type="checkbox" name="whatsapp">WhatsApp <small>Twilio delivery to verified mobile numbers</small></label></div>
      <div class="ns-channel-editor" id="emailEditor" hidden><div class="ns-channel-editor-head"><strong>Email content</strong><span>Leave blank to reuse the notification title and message.</span></div><label>Email subject<input name="email_subject" maxlength="150" value="${esc(c.channel_plan?.email_subject || "")}" placeholder="Optional channel-specific subject"></label><label>Email message<textarea name="email_message" rows="5" maxlength="5000" placeholder="Optional longer email copy">${esc(c.channel_plan?.email_message || "")}</textarea></label></div>
      <div class="ns-channel-editor" id="whatsappEditor" hidden><div class="ns-channel-editor-head"><strong>WhatsApp content</strong><span>Use an approved template for recipients outside the 24-hour WhatsApp service window.</span></div><label>WhatsApp message<textarea name="whatsapp_message" rows="4" maxlength="1600" placeholder="{{title}}&#10;&#10;{{message}}&#10;&#10;{{action_url}}">${esc(c.channel_plan?.whatsapp_message || "")}</textarea><small>Supported merge fields: {{name}}, {{title}}, {{message}}, {{action_label}}, {{action_url}}</small></label><div class="form-grid"><label>Approved template alias (optional)<input name="whatsapp_template_alias" value="${esc(c.channel_plan?.whatsapp_template_alias || "")}" placeholder="e.g. general_notification_v1"></label><label>Template variables JSON (advanced)<textarea name="whatsapp_variables" rows="3" placeholder='{"1":"{{name}}","2":"{{title}}"}'>${esc(JSON.stringify(c.channel_plan?.whatsapp_variables || {}, null, 2))}</textarea></label></div></div>
      <div class="form-grid"><label>Delivery timing<select name="delivery_timing" id="deliveryTiming"><option value="now">Send now</option><option value="schedule">Schedule</option><option value="draft">Save as draft</option></select></label><label id="scheduleField" hidden>Schedule date and time<input type="datetime-local" name="scheduled_for"></label></div>
    </section>
    <aside class="ns-preview-card"><span class="eyebrow">LIVE PREVIEW</span><div class="ns-preview-icon">VN</div><div><strong id="previewTitle">Your notification title</strong><p id="previewMessage">Your message will appear here.</p><small>Varada Nexus EMS · now</small></div></aside>
    <div class="ns-submit"><button type="button" class="btn btn-ghost" id="saveTemplateBtn">Save as template</button><button type="submit" class="btn" id="campaignSubmit">Review & send</button></div>
  </form>`;
}

function templates() {
  return `<section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">REUSABLE CONTENT</span><h3>Templates</h3></div><button class="btn" data-view="compose">+ New campaign</button></div><div class="ns-template-grid">${state.templates.length ? state.templates.map((t) => `<article class="ns-template"><span class="ns-status ${esc(t.severity)}">${esc(t.category)}</span><h4>${esc(t.name)}</h4><strong>${esc(t.title)}</strong><p>${esc(t.message)}</p><button data-template="${t.id}">Use template</button></article>`).join("") : `<div class="empty-state">No templates saved yet.</div>`}</div></section>`;
}

function analytics() {
  const sent = state.campaigns.filter((c) => c.status === "sent");
  return `${dashboard()}<section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">PERFORMANCE</span><h3>Campaign analytics</h3></div></div>${
    sent.length
      ? `<div class="ns-analytics-list">${sent
          .map((c) => {
            const total =
              Number(c.staff_recipient_count || 0) +
              Number(c.portal_recipient_count || 0);
            const read =
              Number(c.staff_read_count || 0) +
              Number(c.portal_read_count || 0);
            const pct = total ? Math.round((read / total) * 100) : 0;
            return `<article><div><strong>${esc(c.campaign_name)}</strong><span>${total} recipients · ${fmt(c.sent_at)}</span></div><div class="ns-progress"><i style="width:${pct}%"></i></div><b>${pct}% read</b></article>`;
          })
          .join("")}</div>`
      : `<div class="empty-state">Send a campaign to start collecting analytics.</div>`
  }</section>`;
}

async function openDeliveryLog(campaignId) {
  const data = await getCampaignDeliveryBreakdown(campaignId);
  const deliveries = data?.deliveries || [];
  const dialog = document.createElement("dialog");
  dialog.className = "ns-delivery-dialog";
  dialog.innerHTML = `<div class="ns-dialog-head"><div><span class="eyebrow">OMNICHANNEL AUDIT</span><h3>Delivery log</h3></div><button data-close aria-label="Close">×</button></div><div class="ns-delivery-summary">${(data?.summary || []).map((x) => `<span><strong>${esc(x.total)}</strong> ${esc(x.channel)} ${esc(x.status)}</span>`).join("") || "No email or WhatsApp attempts yet."}</div><div class="ns-delivery-list">${deliveries.length ? deliveries.map((x) => `<article><div><strong>${esc(x.channel)} · ${esc(x.destination || "Unavailable")}</strong><span>${esc(String(x.identity_kind || "").replaceAll("_", " "))} · ${fmt(x.updated_at)}</span></div><span class="ns-status ${esc(x.status)}">${esc(x.status)}</span><small>Attempts: ${esc(x.attempt_count || 0)}${x.last_error ? ` · ${esc(x.last_error)}` : ""}</small></article>`).join("") : `<div class="empty-state">No email or WhatsApp delivery attempts yet.</div>`}</div><div class="ns-dialog-actions"><button class="btn btn-ghost" data-close>Close</button><button class="btn" data-retry>Retry failed deliveries</button></div>`;
  document.body.append(dialog);
  dialog
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => dialog.close()),
    );
  dialog
    .querySelector("[data-retry]")
    ?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        await retryCampaignDelivery(campaignId);
        showToast(
          "Failed channel deliveries were queued for retry.",
          TOAST_TYPES.SUCCESS,
        );
        dialog.close();
        await load();
      } catch (error) {
        showToast(error.message || "Retry failed.", TOAST_TYPES.ERROR);
        event.currentTarget.disabled = false;
      }
    });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function render() {
  const body =
    state.view === "studio"
      ? studioOverview()
      : state.view === "compose"
      ? composer()
      : state.view === "templates"
        ? templates()
        : state.view === "analytics"
          ? analytics()
          : `${dashboard()}<section class="ns-panel"><div class="ns-panel-head"><div><span class="eyebrow">CAMPAIGN CONTROL</span><h3>Notification campaigns</h3></div><button class="btn" data-view="compose">+ Create campaign</button></div>${campaignTable()}</section>`;
  renderModuleContent(
    `<main class="ns-shell"><header class="ns-hero"><div><span class="eyebrow">COMMUNICATIONS · COMMAND CHANNEL</span><h1>${state.view === "studio" ? "Notification Studio" : state.view === "compose" ? "Compose Notification" : state.view === "templates" ? "Notification Templates" : state.view === "analytics" ? "Campaign Analytics" : "Notification Campaigns"}</h1><p>${state.view === "studio" ? "A unified overview of secure staff and portal communications." : state.view === "compose" ? "Create, target, schedule and deliver a secure omnichannel notification." : state.view === "templates" ? "Manage reusable notification content and channel defaults." : state.view === "analytics" ? "Measure audience reach, delivery health and confirmed engagement." : "Manage scheduled, draft and completed staff and portal campaigns."}</p></div><div class="ns-hero-actions"><button class="btn btn-ghost" id="refreshStudio">Refresh</button>${state.view !== "compose" ? `<button class="btn" data-view="compose">+ New notification</button>` : ""}</div></header>${body}</main>`,
  );
  bind();
}

function parsedRecipientList(value = "", { email = false } = {}) {
  return Array.from(
    new Set(
      String(value)
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .map((item) => (email ? item.toLowerCase() : item))
        .filter(Boolean),
    ),
  );
}

function audiencePayload(form) {
  return {
    role_codes: selected(form.elements.role_codes),
    division_ids: selected(form.elements.division_ids),
    staff_user_ids: selected(form.elements.staff_user_ids),
    portal_types: selected(form.elements.portal_types),
    external_user_ids: selected(form.elements.external_user_ids),
    transport_user_ids: selected(form.elements.transport_user_ids),
    direct_emails: parsedRecipientList(form.elements.direct_emails?.value, {
      email: true,
    }),
    direct_mobiles: parsedRecipientList(form.elements.direct_mobiles?.value),
  };
}
async function refreshAudience() {
  const form = document.querySelector("#campaignForm");
  if (!form) return;
  const mode = form.elements.audience_mode.value;
  document.querySelectorAll("[data-target]").forEach((el) => {
    el.hidden = !el.dataset.target.split(" ").includes(mode);
  });
  const box = document.querySelector("#audiencePreview");
  box.innerHTML = "Calculating recipients…";
  try {
    state.preview = await previewCampaignAudience(
      mode,
      audiencePayload(form),
      form.elements.respect_preferences.checked,
    );
    const directEmails = Number(state.preview.direct_emails || 0);
    const directMobiles = Number(state.preview.direct_mobiles || 0);
    box.innerHTML = `<strong>${Number(state.preview.total || 0).toLocaleString("en-IN")} account recipients${directEmails + directMobiles ? ` + ${directEmails + directMobiles} direct destinations` : ""}</strong><span>${state.preview.staff} staff · ${Number(state.preview.external_portals || 0) + Number(state.preview.transport_portals || 0)} portal users · ${state.preview.push_reachable} push-ready · ${state.preview.email_reachable || 0} email-ready (${directEmails} direct) · ${state.preview.whatsapp_reachable || 0} WhatsApp-ready (${directMobiles} direct)</span>`;
  } catch (e) {
    box.textContent = e.message || "Audience preview unavailable";
  }
}

function scheduleAudienceRefresh() {
  clearTimeout(audienceRefreshTimer);
  audienceRefreshTimer = setTimeout(refreshAudience, 350);
}

function formPayload(form, status) {
  const schedule =
    status === "scheduled" && form.elements.scheduled_for.value
      ? new Date(form.elements.scheduled_for.value).toISOString()
      : null;
  let whatsappVariables = {};
  const rawVariables = form.elements.whatsapp_variables?.value.trim();
  if (rawVariables) {
    try {
      whatsappVariables = JSON.parse(rawVariables);
    } catch {
      throw new Error("WhatsApp template variables must be valid JSON.");
    }
  }
  return {
    id: form.elements.id.value || null,
    campaign_name: form.elements.campaign_name.value.trim(),
    title: form.elements.title.value.trim(),
    message: form.elements.message.value.trim(),
    category: form.elements.category.value,
    severity: form.elements.severity.value,
    action_label: form.elements.action_label.value.trim() || null,
    action_url: form.elements.action_url.value.trim() || null,
    audience_mode: form.elements.audience_mode.value,
    audience: audiencePayload(form),
    channel_plan: {
      in_app: true,
      push: form.elements.push.checked,
      email: form.elements.email.checked,
      whatsapp: form.elements.whatsapp.checked,
      email_subject: form.elements.email_subject.value.trim() || null,
      email_message: form.elements.email_message.value.trim() || null,
      whatsapp_message: form.elements.whatsapp_message.value.trim() || null,
      whatsapp_template_alias:
        form.elements.whatsapp_template_alias.value.trim() || null,
      whatsapp_variables: whatsappVariables,
    },
    respect_preferences: form.elements.respect_preferences.checked,
    status,
    scheduled_for: schedule,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
  };
}

function hydrateForm(c) {
  const form = document.querySelector("#campaignForm");
  if (!form || !c) return;
  ["category", "severity", "audience_mode"].forEach((k) => {
    if (c[k]) form.elements[k].value = c[k];
  });
  const a = c.audience || {};
  Object.entries(a).forEach(([key, values]) => {
    const el = form.elements[key];
    if (!el || !Array.isArray(values)) return;
    if (el.matches("textarea, input")) {
      el.value = values.join("\n");
      return;
    }
    Array.from(el.options || []).forEach(
      (o) => (o.selected = values.includes(o.value)),
    );
  });
  form.elements.respect_preferences.checked = c.respect_preferences !== false;
  const channels = c.channel_plan || c.default_channel_plan || {};
  form.elements.push.checked = channels.push !== false;
  form.elements.email.checked = Boolean(channels.email);
  form.elements.whatsapp.checked = Boolean(channels.whatsapp);
  if (c.status === "scheduled") {
    form.elements.delivery_timing.value = "schedule";
    form.elements.scheduled_for.value = c.scheduled_for
      ? new Date(
          new Date(c.scheduled_for).getTime() -
            new Date().getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  }
  refreshAudience();
}

function bind() {
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  document.querySelector("#refreshStudio")?.addEventListener("click", load);
  const form = document.querySelector("#campaignForm");
  if (form) {
    hydrateForm(state.editing);
    [
      "audience_mode",
      "role_codes",
      "division_ids",
      "staff_user_ids",
      "portal_types",
      "external_user_ids",
      "transport_user_ids",
      "respect_preferences",
    ].forEach((n) =>
      form.elements[n]?.addEventListener("change", refreshAudience),
    );
    ["direct_emails", "direct_mobiles"].forEach((n) => {
      form.elements[n]?.addEventListener("input", scheduleAudienceRefresh);
      form.elements[n]?.addEventListener("change", refreshAudience);
      form.elements[n]?.addEventListener("blur", refreshAudience);
    });
    const syncChannelEditors = () => {
      document.querySelector("#emailEditor").hidden =
        !form.elements.email.checked;
      document.querySelector("#whatsappEditor").hidden =
        !form.elements.whatsapp.checked;
      form.elements.email
        .closest(".ns-channel")
        ?.classList.toggle("active", form.elements.email.checked);
      form.elements.whatsapp
        .closest(".ns-channel")
        ?.classList.toggle("active", form.elements.whatsapp.checked);
      form.elements.push
        .closest(".ns-channel")
        ?.classList.toggle("active", form.elements.push.checked);
    };
    ["push", "email", "whatsapp"].forEach((n) =>
      form.elements[n]?.addEventListener("change", syncChannelEditors),
    );
    syncChannelEditors();
    form.elements.delivery_timing.addEventListener("change", () => {
      const scheduled = form.elements.delivery_timing.value === "schedule";
      document.querySelector("#scheduleField").hidden = !scheduled;
      document.querySelector("#campaignSubmit").textContent = scheduled
        ? "Schedule campaign"
        : form.elements.delivery_timing.value === "draft"
          ? "Save draft"
          : "Review & send";
    });
    const updatePreview = () => {
      document.querySelector("#previewTitle").textContent =
        form.elements.title.value || "Your notification title";
      document.querySelector("#previewMessage").textContent =
        form.elements.message.value || "Your message will appear here.";
      document.querySelector("#messageCount").textContent =
        form.elements.message.value.length;
    };
    form.elements.title.addEventListener("input", updatePreview);
    form.elements.message.addEventListener("input", updatePreview);
    updatePreview();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const timing = form.elements.delivery_timing.value;
      const status = timing === "schedule" ? "scheduled" : "draft";
      const invalidEmails = parsedRecipientList(
        form.elements.direct_emails.value,
      ).filter((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
      const invalidMobiles = parsedRecipientList(
        form.elements.direct_mobiles.value,
      ).filter((value) => {
        const digits = value.replace(/\D/g, "");
        return digits.length < 10 || digits.length > 15;
      });
      if (invalidEmails.length)
        return showToast(
          `Invalid email: ${invalidEmails[0]}`,
          TOAST_TYPES.WARNING,
        );
      if (invalidMobiles.length)
        return showToast(
          `Invalid mobile number: ${invalidMobiles[0]}`,
          TOAST_TYPES.WARNING,
        );
      const reachable =
        Number(state.preview?.total || 0) +
        (form.elements.email.checked
          ? Number(state.preview?.email_reachable || 0)
          : 0) +
        (form.elements.whatsapp.checked
          ? Number(state.preview?.whatsapp_reachable || 0)
          : 0);
      if (!reachable)
        return showToast(
          "Choose an audience or enter at least one reachable email/mobile recipient.",
          TOAST_TYPES.WARNING,
        );
      if (
        timing === "now" &&
        !confirm(
          `Send this campaign now?\n\nAccounts: ${state.preview.total || 0}\nEmail-ready: ${form.elements.email.checked ? state.preview.email_reachable || 0 : 0}\nWhatsApp-ready: ${form.elements.whatsapp.checked ? state.preview.whatsapp_reachable || 0 : 0}`,
        )
      )
        return;
      try {
        const id = await saveCampaign(formPayload(form, status));
        const delivery = timing === "now" ? await publishCampaign(id) : null;
        state.editing = null;
        const channelProblems = (delivery?.channels || []).filter(
          (item) => !item.ok || Number(item.failed || 0) > 0,
        );
        showToast(
          timing === "now"
            ? channelProblems.length
              ? `Campaign created. ${channelProblems.map((item) => item.channel).join(", ")} has failed deliveries; open Delivery log to review or retry.`
              : "Campaign sent across all selected channels."
            : timing === "schedule"
              ? "Campaign scheduled."
              : "Draft saved.",
          channelProblems.length ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS,
        );
        openView("campaigns");
      } catch (e) {
        showToast(
          e.message || "Campaign could not be saved.",
          TOAST_TYPES.ERROR,
        );
      }
    });
    document
      .querySelector("#saveTemplateBtn")
      ?.addEventListener("click", async () => {
        const name = prompt(
          "Template name",
          form.elements.campaign_name.value || form.elements.title.value,
        );
        if (!name) return;
        try {
          const p = formPayload(form, "draft");
          await saveCampaignTemplate({
            name,
            title: p.title,
            message: p.message,
            category: p.category,
            severity: p.severity,
            action_label: p.action_label,
            action_url: p.action_url,
            default_audience_mode: p.audience_mode,
            default_channel_plan: p.channel_plan,
          });
          showToast("Template saved.", TOAST_TYPES.SUCCESS);
          state.templates = await listCampaignTemplates();
        } catch (e) {
          showToast(e.message, TOAST_TYPES.ERROR);
        }
      });
    refreshAudience();
  }
  document.querySelectorAll("[data-edit], [data-reuse]").forEach((b) =>
    b.addEventListener("click", () => {
      openView("compose", b.dataset.reuse ? { reuse: b.dataset.reuse } : { edit: b.dataset.edit });
    }),
  );
  document.querySelectorAll("[data-cancel]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Cancel this campaign?")) return;
      await cancelCampaign(b.dataset.cancel);
      await load();
    }),
  );
  document
    .querySelectorAll("[data-deliveries]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        openDeliveryLog(b.dataset.deliveries).catch((error) =>
          showToast(
            error.message || "Delivery log could not be loaded.",
            TOAST_TYPES.ERROR,
          ),
        ),
      ),
    );
  document.querySelectorAll("[data-template]").forEach((b) =>
    b.addEventListener("click", () => {
      openView("compose", { template: b.dataset.template });
    }),
  );
}

async function resolveComposeSource() {
  if (state.view !== "compose") return;
  const params = new URLSearchParams(location.search);
  const campaignId = params.get("edit") || params.get("reuse");
  if (campaignId) {
    const campaign = await getCampaign(campaignId);
    state.editing = params.has("reuse")
      ? { ...campaign, id: null, campaign_name: `${campaign.campaign_name} copy` }
      : campaign;
    return;
  }
  const templateId = params.get("template");
  const template = state.templates.find((item) => item.id === templateId);
  state.editing = template
    ? {
        campaign_name: template.name,
        title: template.title,
        message: template.message,
        category: template.category,
        severity: template.severity,
        action_label: template.action_label,
        action_url: template.action_url,
        audience_mode: template.default_audience_mode,
        channel_plan: template.default_channel_plan || {},
      }
    : null;
}

async function load() {
  renderModuleContent(
    `<div class="ns-shell"><div class="ns-panel">Loading Notification Studio…</div></div>`,
  );
  try {
    [state.directory, state.campaigns, state.templates] = await Promise.all([
      getNotificationDirectory(),
      listCampaigns(),
      listCampaignTemplates(),
    ]);
    await resolveComposeSource();
    render();
  } catch (e) {
    const message = e?.message || "Notification Studio could not be loaded.";
    renderModuleContent(
      `<div class="ns-shell"><section class="ns-panel"><span class="eyebrow">LOAD ERROR</span><h3>Notification Studio is unavailable</h3><p>${esc(message)}</p><button class="btn" id="studioRetry">Retry</button></section></div>`,
    );
    document
      .querySelector("#studioRetry")
      ?.addEventListener("click", () => load());
    showToast(message, TOAST_TYPES.ERROR);
  }
}

async function init() {
  const legacyView = new URLSearchParams(location.search).get("view");
  if (
    location.pathname === ROUTES.NOTIFICATION_STUDIO &&
    legacyView &&
    legacyView !== "studio" &&
    VIEW_ROUTES[legacyView]
  ) {
    openView(legacyView);
    return;
  }
  const pageNames = {
    studio: ["Notification Studio", "Advanced staff and portal notification campaigns"],
    campaigns: ["Notification Campaigns", "Manage staff and portal notification campaigns"],
    compose: ["Compose Notification", "Create and schedule an omnichannel notification"],
    templates: ["Notification Templates", "Manage reusable notification templates"],
    analytics: ["Campaign Analytics", "Review notification delivery and engagement"],
  };
  const [pageTitle, pageDescription] = pageNames[state.view] || pageNames.studio;
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.NOTIFICATIONS_CENTER,
    pageTitle,
    pageDescription,
    workspace: WORKSPACES.NOTIFICATIONS,
  });
  if (!boot) return;
  await load();
}
init();
