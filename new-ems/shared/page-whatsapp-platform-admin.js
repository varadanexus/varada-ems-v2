import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { getSupabaseAccessToken, getSupabaseClient } from "../config/supabase.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js?whatsappBillingNav=2";
import { showToast } from "./utils.js";

const BILLING_VIEWS = new Set(["billing", "subscriptions", "payments", "invoices", "refunds", "credit-notes", "reconciliation"]);
const VIEWS = new Set(["overview", "customers", "verification", "connections", "package-master", "packages", ...BILLING_VIEWS, "razorpay", "meta", "security"]);
const fileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = () => reject(new Error("The evidence photo could not be read."));
  reader.readAsDataURL(file);
});
const VIEW_META = Object.freeze({
  overview: {
    title: "Platform overview",
    description: "Monitor customer workspaces, product readiness and the operational health of WhatsApp Solutions.",
    section: "Product management",
    marker: "PO",
  },
  customers: {
    title: "Customers",
    description: "Manage customer companies, operational package assignments, seat capacity and workspace status.",
    section: "Product management",
    marker: "CU",
  },
  verification: {
    title: "Business verification",
    description: "Review customer identity evidence and control the verification gate used before Meta onboarding.",
    section: "Risk & onboarding",
    marker: "BV",
  },
  connections: {
    title: "Meta connections",
    description: "Inspect tenant-scoped WhatsApp Business Accounts and connection readiness without exposing credentials.",
    section: "Product management",
    marker: "MC",
  },
  "package-master": {
    title: "Package Master",
    description: "Maintain the central source of truth for customer entitlements, limits, billing and add-ons.",
    section: "Commercial control",
    marker: "PM",
  },
  packages: {
    title: "Packages & Offers",
    description: "Manage the public pricing and offer catalogue independently from operational customer access.",
    section: "Public website",
    marker: "P&",
  },
  billing: {
    title: "Billing overview",
    description: "Monitor WhatsApp subscription health, collected payments and commercial readiness.",
    section: "Billing",
    marker: "BO",
  },
  subscriptions: {
    title: "Subscriptions",
    description: "Review customer subscription lifecycles, billing dates, package state and provider status.",
    section: "Billing",
    marker: "SU",
  },
  payments: {
    title: "Payment ledger",
    description: "Review captured Razorpay transactions, balances and protected refund actions.",
    section: "Billing",
    marker: "PL",
  },
  invoices: {
    title: "Invoices",
    description: "Review central EMS invoice numbers, GST breakdowns and Razorpay transaction references.",
    section: "Billing",
    marker: "IN",
  },
  refunds: {
    title: "Refunds",
    description: "Monitor Razorpay refund requests, processing state and customer credit outcomes.",
    section: "Billing",
    marker: "RF",
  },
  "credit-notes": {
    title: "Credit notes",
    description: "Review central EMS credit notes issued from processed Razorpay refunds.",
    section: "Billing",
    marker: "CN",
  },
  reconciliation: {
    title: "Reconciliation",
    description: "Resolve gaps between payments, invoices, refunds, credit notes and webhook processing.",
    section: "Billing",
    marker: "RC",
  },
  razorpay: {
    title: "Razorpay settings",
    description: "Configure protected Razorpay credentials and the subscription webhook used by WhatsApp Solutions.",
    section: "Billing",
    marker: "RP",
  },
  meta: {
    title: "Meta App Setup",
    description: "Operate the provider application, Embedded Signup, webhook and protected server configuration.",
    section: "Application control",
    marker: "MA",
  },
  security: {
    title: "Security",
    description: "Review product isolation, privileged access controls and security operating requirements.",
    section: "Application control",
    marker: "SE",
  },
});
const state = { view: "overview", snapshot: null, loading: true, error: "", canManage: false, canApprove: false, hasFullAuthority: false, catalog: null, catalogError: "", catalogLoading: false, packageMaster: null, packageMasterError: "", packageMasterLoading: false, providerSecretStatus: null, providerSecretLoading: false, billingSnapshot: null, billingLoading: false, billingError: "" };
const db = getSupabaseClient();
let verificationPreviewUrl = "";
const VERIFICATION_ENTITY_TYPES = Object.freeze([
  ["private_limited", "Private limited company"], ["public_limited", "Public limited company"],
  ["partnership", "Partnership"], ["sole_proprietor", "Sole proprietor"],
  ["nonprofit", "Nonprofit"], ["government", "Government"], ["other", "Other"],
]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value); }
}

function status(value) {
  const safe = escapeHtml(value || "unknown");
  return `<span class="wa-status ${safe}">${safe.replaceAll("_", " ")}</span>`;
}

function metrics() {
  const totals = state.snapshot?.totals || {};
  return `<section class="wa-admin-stats">
    <article class="wa-admin-stat"><span>Customer companies</span><strong>${Number(totals.tenants || 0)}</strong><small>${Number(totals.activeTenants || 0)} active</small></article>
    <article class="wa-admin-stat"><span>Customer users</span><strong>${Number(totals.users || 0)}</strong><small>${Number(totals.activeSessions || 0)} active sessions</small></article>
    <article class="wa-admin-stat"><span>Meta connections</span><strong>${Number(totals.connections || 0)}</strong><small>${Number(totals.connected || 0)} connected</small></article>
    <article class="wa-admin-stat"><span>Customer access</span><strong>Protected</strong><small>Dedicated security boundary</small></article>
  </section>`;
}

function overview() {
  const recent = (state.snapshot?.tenants || []).slice(0, 5);
  return `${metrics()}<section class="wa-admin-grid">
    <article class="wa-admin-card"><h3>Recent customer workspaces</h3><p>Companies registering through the public product portal.</p><div class="wa-admin-list">${recent.length ? recent.map((item) => `<div class="wa-admin-row"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.ownerEmail)} · ${escapeHtml(item.planCode)}</small></div>${status(item.status)}</div>`).join("") : '<div class="wa-admin-empty">No customer workspaces have been created.</div>'}</div></article>
    <article class="wa-admin-card"><h3>Product readiness</h3><p>Operational controls for launching the customer-facing application.</p><div class="wa-admin-checklist">
      <div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Customer access controls</strong><small>Protected and independently managed</small></div>${status("ready")}</div>
      <div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Tenant isolation</strong><small>Customer data separated at database level</small></div>${status("ready")}</div>
      <div class="wa-admin-check pending"><span class="wa-admin-check-icon">2</span><div><strong>Meta App Review</strong><small>Tech Provider submission is currently with Meta</small></div>${status("in_review")}</div>
    </div></article>
  </section>`;
}

function customers() {
  if (!state.packageMaster && !state.packageMasterError && !state.packageMasterLoading) loadPackageMaster();
  const masterPackages = (state.packageMaster?.packages || []).filter((pkg) => pkg.status === "active");
  const rows = state.snapshot?.tenants || [];
  if (!rows.length) return '<section class="wa-admin-card"><h3>Customer companies</h3><p>Manage product tenants, plans and access status.</p><div class="wa-admin-empty">No customers yet. New public signups will appear here.</div></section>';
  const cards = rows.map((item) => {
    const planCode = item.planCode === "starter" ? "launch" : item.planCode;
    const masterPackage = masterPackages.find((pkg) => pkg.code === planCode);
    const included = masterPackage ? (masterPackage.team_member_limit == null ? null : Number(masterPackage.team_member_limit)) : (item.includedTeamSeats == null ? null : Number(item.includedTeamSeats));
    const seatAssignment = (state.packageMaster?.assignments || []).find((entry) => entry.tenantId === item.id && entry.addonCode === "extra_agent_seat" && entry.status === "active");
    const extra = seatAssignment ? Number(seatAssignment.quantity || 0) : Number(item.additionalTeamSeats || 0);
    const capacity = included == null ? "Unlimited" : String(included + extra);
    const packageOptions = masterPackages.length ? masterPackages.map((pkg) => `<option value="${escapeHtml(pkg.code)}" ${planCode === pkg.code ? "selected" : ""}>${escapeHtml(pkg.name)}${pkg.status === "draft" ? " (draft)" : ""}</option>`).join("") : `<option value="${escapeHtml(planCode)}" selected>${escapeHtml(masterPackage?.name || planCode)}</option>`;
    const members = item.users || [];
    const connections = item.connections || (state.snapshot?.connections || []).filter((connection) => connection.tenantId === item.id);
    const verification = item.verification || (state.snapshot?.verifications || []).find((entry) => entry.tenantId === item.id);
    const memberRows = members.length ? members.map((member) => `<tr><td><strong>${escapeHtml(member.displayName || "Unnamed member")}</strong><small>${escapeHtml(member.email)}</small></td><td>${status(member.roleCode || "viewer")}</td><td>${status(member.status || "disabled")}</td><td>${escapeHtml(member.lastLoginAt ? formatDate(member.lastLoginAt) : "Never")}</td></tr>`).join("") : '<tr><td colspan="4"><div class="wa-admin-empty">No users are attached to this account.</div></td></tr>';
    const connectionRows = connections.length ? connections.map((connection) => `<div class="wa-customer-connection"><div><strong>${escapeHtml(connection.verifiedName || connection.displayPhoneNumber || "WhatsApp connection")}</strong><small>${escapeHtml(connection.displayPhoneNumber || "Number not assigned")} · ${escapeHtml(connection.whatsappBusinessAccountId || "WABA not assigned")}</small></div>${status(connection.status || "pending")}</div>`).join("") : '<div class="wa-admin-empty">No Meta connection has been created.</div>';
    const modal = `<section class="wa-customer-modal" data-customer-modal="${escapeHtml(item.id)}" hidden role="dialog" aria-modal="true" aria-labelledby="waCustomer-${escapeHtml(item.id)}"><div class="wa-customer-modal-shell"><header><div><span>Customer account</span><strong id="waCustomer-${escapeHtml(item.id)}">${escapeHtml(item.name)}</strong><small>${escapeHtml(item.ownerEmail)} · created ${escapeHtml(formatDate(item.createdAt))}</small></div><div>${status(item.status)}<button type="button" data-customer-modal-close aria-label="Close customer account">×</button></div></header><main>
      <section class="wa-customer-detail-grid"><article><span>Workspace ID</span><strong class="wa-admin-code">${escapeHtml(item.id)}</strong></article><article><span>Workspace slug</span><strong>${escapeHtml(item.slug)}</strong></article><article><span>Package</span><strong>${escapeHtml(masterPackage?.name || planCode)}</strong></article><article><span>Verification</span><strong>${escapeHtml(verification?.status || item.verificationStatus || "not started")}</strong></article><article><span>Seat usage</span><strong>${Number(item.userCount || 0)} / ${capacity}</strong></article><article><span>Meta connections</span><strong>${connections.length}</strong></article></section>
      <section class="wa-customer-modal-section"><div class="wa-customer-section-head"><div><span>People &amp; access</span><h3>Users and roles</h3></div><small>${members.length} total records</small></div><div class="wa-admin-table-wrap"><table class="wa-admin-table wa-customer-users"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th></tr></thead><tbody>${memberRows}</tbody></table></div></section>
      <section class="wa-customer-modal-section"><div class="wa-customer-section-head"><div><span>Connected assets</span><h3>WhatsApp Business accounts</h3></div><small>${connections.length} connections</small></div><div class="wa-customer-connections">${connectionRows}</div></section>
      ${state.canManage ? `<section class="wa-customer-modal-section"><div class="wa-customer-section-head"><div><span>Account controls</span><h3>Plan and access</h3></div><small>Changes apply to this workspace</small></div><form class="wa-customer-account-form" data-tenant-form="${escapeHtml(item.id)}"><label><span>Package Master assignment</span><select name="plan">${packageOptions}</select></label><label><span>Extra seats</span><input name="additionalSeats" type="number" min="0" max="10000" step="1" value="${extra}" /></label><label><span>Status</span><select name="status"><option ${item.status === "active" ? "selected" : ""}>active</option><option ${item.status === "suspended" ? "selected" : ""}>suspended</option><option ${item.status === "closed" ? "selected" : ""}>closed</option></select></label><button class="wa-admin-button primary" type="submit">Save account</button></form></section>` : ""}
      ${state.hasFullAuthority ? `<section class="wa-customer-danger"><div><span>Danger zone</span><h3>Schedule complete account deletion</h3><p>Evidence is stored in the company’s protected Drive folder. The workspace owner or an administrator can reverse the request for 24 hours before guarded deletion begins.</p><button class="wa-admin-button danger" type="button" data-customer-delete-open="${escapeHtml(item.id)}">Delete account</button></div><form class="wa-customer-delete-form" data-customer-delete-form="${escapeHtml(item.id)}" data-customer-name="${escapeHtml(item.name)}" hidden><div class="wa-customer-delete-form-head"><strong>Deletion request and evidence</strong><button type="button" data-customer-delete-cancel>Cancel</button></div><label><span>Who requested this deletion?</span><input name="requestedBy" maxlength="160" autocomplete="off" placeholder="Customer name and email, or authorised requester" required /></label><label><span>Internal note</span><textarea name="internalNote" rows="3" minlength="10" maxlength="1000" placeholder="Record the request source, reason and internal context." required></textarea></label><label><span>Photo evidence of requester</span><input name="evidencePhoto" type="file" accept="image/png,image/jpeg" capture="user" required /><small>JPG or PNG, maximum 2 MB. Capture only with the person’s consent.</small></label><div class="wa-customer-location"><button class="wa-admin-button" type="button" data-capture-delete-location>Capture current location</button><span data-delete-location-status>Location not captured</span></div><input name="latitude" type="hidden" /><input name="longitude" type="hidden" /><input name="locationAccuracy" type="hidden" /><input name="locationCapturedAt" type="hidden" /><label><span>Type <strong>${escapeHtml(item.name)}</strong> to confirm</span><input name="confirmationName" autocomplete="off" required /></label><label class="wa-customer-delete-check"><input name="confirmed" type="checkbox" required /><span>I confirm the requester consented to the photo and location evidence. This request may be reversed within 24 hours; after that, guarded deletion is final.</span></label><button class="wa-admin-button danger" type="submit" disabled>Schedule deletion</button></form></section>` : ""}
    </main></div></section>`;
    return `<article class="wa-customer-card"><button type="button" class="wa-customer-card-open" data-open-customer="${escapeHtml(item.id)}"><header><span class="wa-customer-avatar">${escapeHtml(String(item.name || "C").slice(0, 1).toUpperCase())}</span><div><span>${escapeHtml(masterPackage?.name || planCode)} package</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.ownerEmail)}</small></div>${status(item.status)}</header><div class="wa-customer-card-metrics"><div><span>Team</span><strong>${Number(item.userCount || 0)} / ${capacity}</strong></div><div><span>Connections</span><strong>${connections.length}</strong></div><div><span>Verification</span><strong>${escapeHtml(verification?.status || item.verificationStatus || "not started")}</strong></div></div><footer><span>Created ${escapeHtml(formatDate(item.createdAt))}</span><strong>Open account →</strong></footer></button></article>${modal}`;
  }).join("");
  return `<section class="wa-admin-card wa-customer-directory"><div class="wa-admin-secret-heading"><div><h3>Customer companies</h3><p>Open a company card to review its full workspace record, users, roles, connected assets, plan and protected account controls.</p></div>${status(`${rows.length}_accounts`)}</div><div class="wa-customer-card-grid">${cards}</div></section>`;
}

function connections() {
  const rows = state.snapshot?.connections || [];
  return `<section class="wa-admin-card"><h3>Customer Meta connections</h3><p>Safe operational view of customer-owned WhatsApp Business Accounts. Provider secrets are never displayed.</p>${rows.length ? `<div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Company</th><th>Verified name</th><th>Phone</th><th>WABA ID</th><th>Status</th><th>Connected</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.tenantName)}</td><td>${escapeHtml(item.verifiedName || "—")}</td><td>${escapeHtml(item.displayPhoneNumber || "—")}</td><td><span class="wa-admin-code">${escapeHtml(item.whatsappBusinessAccountId || "not assigned")}</span></td><td>${status(item.status)}</td><td>${escapeHtml(formatDate(item.connectedAt))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="wa-admin-empty">No customer has connected a Meta Business Account.</div>'}</section>`;
}

function verificationLegacy() {
  const rows = state.snapshot?.verifications || [];
  const pending = rows.filter((item) => ["submitted", "in_review", "changes_requested", "rejected"].includes(item.status));
  const gate = state.snapshot?.verificationGate || { enabled: true };
  const gateControl = `<section class="wa-admin-card wa-gate-card ${gate.enabled ? "" : "paused"}"><div class="wa-admin-secret-heading"><div><h3>Production verification gate</h3><p>Controls whether an approved provider pre-check is required before customers can start Meta onboarding.</p></div>${status(gate.enabled ? "enabled" : "temporarily_paused")}</div>${gate.enabled ? `<p class="wa-gate-warning">Keep this enabled for normal operation. A temporary pause affects every customer workspace and automatically expires.</p>${state.canApprove ? `<form class="wa-gate-form" data-gate-pause><label>Reason<textarea name="reason" rows="2" minlength="10" maxlength="500" required placeholder="Example: Meta reviewer needs temporary access to reproduce onboarding"></textarea></label><label>Days disabled<select name="duration"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days (maximum)</option></select></label><button class="wa-admin-button" type="submit">Temporarily pause gate</button></form>` : ""}` : `<div class="wa-admin-notice"><strong>Gate paused until ${escapeHtml(formatDate(gate.bypassExpiresAt))}</strong><br>${escapeHtml(gate.reason || "Temporary operational bypass")}</div>${state.canApprove ? `<button class="wa-admin-button primary" type="button" data-gate-restore>Restore gate now</button>` : ""}`}</section>`;
  const cases = rows.length ? `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Provider business pre-check</h3><p>Confirm the legal-identity document and address or phone evidence before unlocking Meta onboarding. This decision does not replace Meta Business Verification, phone OTP or display-name approval.</p></div>${status(`${pending.length}_pending`)}</div><div class="wa-verification-list">${rows.map((item) => `<article class="wa-verification-case"><header><div><strong>${escapeHtml(item.tenantName)}</strong><small>${escapeHtml(item.ownerEmail)} · ${escapeHtml(String(item.entityType || "other").replaceAll("_", " "))}</small></div>${status(item.status)}</header><dl><div><dt>Registration</dt><dd>${escapeHtml(item.registrationNumber || "—")}</dd></div><div><dt>GSTIN</dt><dd>${escapeHtml(item.gstin || "Not provided")}</dd></div><div><dt>Representative</dt><dd>${escapeHtml(item.representativeName || "—")} · ${escapeHtml(item.representativeTitle || "—")}</dd></div><div><dt>Submitted</dt><dd>${escapeHtml(formatDate(item.submittedAt))}</dd></div></dl><div class="wa-verification-address"><strong>Registered address</strong><p>${escapeHtml(item.registeredAddress || "Not provided")}</p></div><div class="wa-verification-files">${(item.documents || []).map((document) => `<button type="button" data-verification-document="${escapeHtml(document.id)}" title="Open ${escapeHtml(document.name)}">${escapeHtml(String(document.type || "document").replaceAll("_", " "))}<small>${Math.ceil(Number(document.size || 0) / 1024)} KB</small></button>`).join("") || '<em>No active documents</em>'}</div>${item.reviewNotes ? `<div class="wa-admin-notice"><strong>Review notes</strong><br>${escapeHtml(item.reviewNotes)}</div>` : ""}${state.canApprove && item.status !== "verified" ? `<form class="wa-verification-review" data-verification-review="${escapeHtml(item.tenantId)}"><label>Reviewer notes<textarea name="notes" rows="3" maxlength="2000" placeholder="Required when requesting changes or rejecting"></textarea></label><div><button type="submit" name="decision" value="in_review">Start review</button><button type="submit" name="decision" value="changes_requested">Request changes</button><button type="submit" name="decision" value="rejected" class="danger">Reject</button><button type="submit" name="decision" value="verified" class="approve">Approve pre-check</button></div></form>` : ""}</article>`).join("")}</div></section>` : '<section class="wa-admin-card"><h3>Business verification</h3><p>Review entity details and evidence submitted by customer organisations.</p><div class="wa-admin-empty">No verification cases have been created.</div></section>';
  const reviewModal = `<section class="wa-document-review-modal" data-document-review-modal hidden role="dialog" aria-modal="true" aria-labelledby="waDocumentReviewTitle"><div class="wa-document-review-shell"><header class="wa-document-review-head"><div><span>Protected verification evidence</span><strong id="waDocumentReviewTitle" data-document-review-name>Document preview</strong><small data-document-review-meta>Loading document…</small></div><button type="button" data-document-review-close aria-label="Close document preview">×</button></header><div class="wa-document-review-toolbar" data-document-review-toolbar hidden><label><span>Reviewer notes</span><textarea rows="2" maxlength="2000" data-document-review-notes placeholder="Required when requesting changes or rejecting"></textarea></label><div class="wa-document-review-actions"><button type="button" data-document-decision="in_review">Start review</button><button type="button" data-document-decision="changes_requested">Request changes</button><button type="button" data-document-decision="rejected" class="danger">Reject</button><button type="button" data-document-decision="verified" class="approve">Approve pre-check</button></div></div><main class="wa-document-review-stage" data-document-review-stage><div class="wa-document-review-loading"><span></span><strong>Securely fetching document…</strong></div></main></div></section>`;
  return `${gateControl}${cases}${reviewModal}`;
}

function reviewStatusLabel(value) {
  return ({ pending: "Pending review", in_review: "In review", changes_requested: "Replacement requested", approved: "Approved", rejected: "Rejected" })[value] || "Pending review";
}

function verificationReviewControls(item) {
  if (!state.canApprove) return "";
  const verified = item.status === "verified";
  return `<form class="wa-verification-review" data-verification-review="${escapeHtml(item.tenantId)}"><label>Case-level reviewer notes<textarea name="notes" rows="3" maxlength="2000" placeholder="Required when requesting changes or rejecting">${escapeHtml(item.reviewNotes || "")}</textarea></label><div>${verified ? `<button type="submit" name="decision" value="in_review">Reopen business review</button>` : `<button type="submit" name="decision" value="in_review">Start review</button><button type="submit" name="decision" value="changes_requested">Request changes</button><button type="submit" name="decision" value="rejected" class="danger">Reject business</button><button type="submit" name="decision" value="verified" class="approve">Approve business pre-check</button>`}</div></form>`;
}

function verificationRequestRows(item) {
  const requests = (state.snapshot?.documentRequests || []).filter((request) => request.tenantId === item.tenantId && request.status !== "cancelled");
  if (!requests.length) return "";
  return `<section class="wa-document-requests"><h4>Additional evidence requested</h4>${requests.map((request) => `<article><div><strong>${escapeHtml(request.title)}</strong><small>${escapeHtml(reviewStatusLabel(request.status === "satisfied" ? "approved" : request.status === "uploaded" ? "in_review" : "changes_requested"))}${request.dueAt ? ` · due ${escapeHtml(formatDate(request.dueAt))}` : ""}</small>${request.instructions ? `<p>${escapeHtml(request.instructions)}</p>` : ""}</div>${state.canApprove && ["requested", "uploaded"].includes(request.status) ? `<button type="button" data-cancel-document-request="${escapeHtml(request.id)}">Cancel request</button>` : ""}</article>`).join("")}</section>`;
}

function verificationCaseModal(item) {
  const documents = item.documents || [];
  const approvedDocuments = documents.filter((document) => document.reviewStatus === "approved").length;
  const fields = state.canManage ? `<form class="wa-verification-detail-form" data-verification-details="${escapeHtml(item.tenantId)}">
    <div class="wa-verification-field-grid">
      <label class="wide"><span>Company / workspace name</span><input name="companyName" value="${escapeHtml(item.tenantName)}" minlength="2" maxlength="120" required /><small>This is the shared company identity shown throughout the customer portal.</small></label>
      <label><span>Entity type</span><select name="entityType" required>${VERIFICATION_ENTITY_TYPES.map(([value, label]) => `<option value="${value}" ${item.entityType === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label><span>Registration / licence number</span><input name="registrationNumber" value="${escapeHtml(item.registrationNumber || "")}" maxlength="80" /></label>
      <label><span>GSTIN</span><input name="gstin" value="${escapeHtml(item.gstin || "")}" maxlength="20" autocapitalize="characters" /></label>
      <label><span>Authorised representative</span><input name="representativeName" value="${escapeHtml(item.representativeName || "")}" maxlength="120" /></label>
      <label><span>Representative title</span><input name="representativeTitle" value="${escapeHtml(item.representativeTitle || "")}" maxlength="120" /></label>
      <label class="wide"><span>Registered business address</span><textarea name="registeredAddress" rows="4" maxlength="800">${escapeHtml(item.registeredAddress || "")}</textarea></label>
    </div>
    <footer class="wa-verification-savebar"><span>Saving updates the authoritative customer record and portal.</span><button type="submit" class="approve">Save customer details</button></footer>
  </form>` : `<dl class="wa-verification-detail-readonly"><div><dt>Registration</dt><dd>${escapeHtml(item.registrationNumber || "—")}</dd></div><div><dt>GSTIN</dt><dd>${escapeHtml(item.gstin || "Not provided")}</dd></div><div><dt>Representative</dt><dd>${escapeHtml(item.representativeName || "—")} · ${escapeHtml(item.representativeTitle || "—")}</dd></div><div><dt>Registered address</dt><dd>${escapeHtml(item.registeredAddress || "Not provided")}</dd></div></dl>`;
  return `<section class="wa-verification-case-modal" data-verification-case-modal="${escapeHtml(item.tenantId)}" hidden role="dialog" aria-modal="true" aria-labelledby="waVerificationCase-${escapeHtml(item.tenantId)}">
    <div class="wa-verification-case-shell">
      <header><div><span>Customer verification case</span><strong id="waVerificationCase-${escapeHtml(item.tenantId)}">${escapeHtml(item.tenantName)}</strong><small>${escapeHtml(item.ownerEmail)} · submitted ${escapeHtml(formatDate(item.submittedAt))}</small></div><div>${status(item.status)}<button type="button" data-verification-case-close aria-label="Close verification case">×</button></div></header>
      <main>
        <section class="wa-verification-case-section"><div class="wa-verification-section-heading"><div><span>Business identity</span><h3>Submitted details</h3></div><small>Owner email is account-controlled and remains read-only.</small></div>${fields}</section>
        <section class="wa-verification-case-section"><div class="wa-verification-section-heading"><div><span>Protected evidence</span><h3>Documents</h3></div><small>${approvedDocuments} of ${documents.length} approved</small></div><div class="wa-verification-files">${documents.map((document) => `<button type="button" class="document-${escapeHtml(document.reviewStatus || "pending")}" data-verification-document="${escapeHtml(document.id)}" title="Open ${escapeHtml(document.name)}"><span>${escapeHtml(String(document.type || "document").replaceAll("_", " "))}</span><small>${Math.ceil(Number(document.size || 0) / 1024)} KB · ${escapeHtml(reviewStatusLabel(document.reviewStatus))}</small></button>`).join("") || "<em>No active documents</em>"}</div>${state.canApprove ? `<button class="wa-request-evidence-button" type="button" data-request-document="${escapeHtml(item.tenantId)}">+ Request additional document</button>` : ""}${verificationRequestRows(item)}</section>
        <section class="wa-verification-case-section"><div class="wa-verification-section-heading"><div><span>Case decision</span><h3>Provider pre-check</h3></div><small>Document decisions remain independent.</small></div>${verificationReviewControls(item)}</section>
      </main>
    </div>
  </section>`;
}

function verification() {
  const rows = state.snapshot?.verifications || [];
  const pending = rows.filter((item) => ["submitted", "in_review", "changes_requested", "rejected"].includes(item.status));
  const gate = state.snapshot?.verificationGate || { enabled: true };
  const gateControl = `<details class="wa-admin-card wa-gate-card ${gate.enabled ? "" : "paused"}"><summary><div><h3>Production verification gate</h3><p>Controls whether an approved provider pre-check is required before customers can start Meta onboarding.</p></div><div>${status(gate.enabled ? "enabled" : "temporarily_paused")}<span class="wa-gate-chevron" aria-hidden="true">⌄</span></div></summary><div class="wa-gate-body">${gate.enabled ? `<p class="wa-gate-warning">Keep this enabled for normal operation. A temporary pause affects every customer workspace and automatically expires.</p>${state.canApprove ? `<form class="wa-gate-form" data-gate-pause><label>Reason<textarea name="reason" rows="2" minlength="10" maxlength="500" required placeholder="Explain the operational reason"></textarea></label><label>Days disabled<select name="duration"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days (maximum)</option></select></label><button class="wa-admin-button" type="submit">Temporarily pause gate</button></form>` : ""}` : `<div class="wa-admin-notice"><strong>Gate paused until ${escapeHtml(formatDate(gate.bypassExpiresAt))}</strong><br>${escapeHtml(gate.reason || "Temporary operational bypass")}</div>${state.canApprove ? `<button class="wa-admin-button primary" type="button" data-gate-restore>Restore gate now</button>` : ""}`}</div></details>`;
  const cases = rows.length ? `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Provider business pre-check</h3><p>Open a customer card to review identity details, edit the authoritative customer record, inspect protected evidence and record decisions.</p></div>${status(`${pending.length}_pending`)}</div><div class="wa-verification-card-grid">${rows.map((item) => {
    const documents = item.documents || [];
    const approved = documents.filter((document) => document.reviewStatus === "approved").length;
    const attention = documents.filter((document) => ["changes_requested", "rejected"].includes(document.reviewStatus)).length;
    return `<button class="wa-verification-summary-card" type="button" data-open-verification-case="${escapeHtml(item.tenantId)}"><span class="wa-verification-avatar">${escapeHtml((item.tenantName || "B").charAt(0).toUpperCase())}</span><span class="wa-verification-summary-copy"><span>${escapeHtml(String(item.entityType || "other").replaceAll("_", " "))}</span><strong>${escapeHtml(item.tenantName)}</strong><small>${escapeHtml(item.ownerEmail)}</small></span><span class="wa-verification-summary-meta">${status(item.status)}<small>${documents.length} document${documents.length === 1 ? "" : "s"} · ${approved} approved${attention ? ` · ${attention} needs action` : ""}</small><em>Open review →</em></span></button>`;
  }).join("")}</div></section>` : `<section class="wa-admin-card"><h3>Business verification</h3><div class="wa-admin-empty">No verification cases have been created.</div></section>`;
  const reviewModal = `<section class="wa-document-review-modal" data-document-review-modal hidden role="dialog" aria-modal="true" aria-labelledby="waDocumentReviewTitle"><div class="wa-document-review-shell"><header class="wa-document-review-head"><div><span>Protected verification evidence</span><strong id="waDocumentReviewTitle" data-document-review-name>Document preview</strong><small data-document-review-meta>Loading document…</small></div><button type="button" data-document-review-close aria-label="Close document preview">×</button></header><div class="wa-document-review-toolbar" data-document-review-toolbar hidden><div class="wa-document-review-notes"><label><span>Document reviewer notes</span><textarea rows="2" maxlength="2000" data-document-review-notes aria-describedby="waDocumentReviewHelp waDocumentReviewFeedback" placeholder="Explain what must be replaced or why the document is rejected"></textarea></label><small id="waDocumentReviewHelp">A clear reason of at least 10 characters is required for replacement or rejection.</small><p id="waDocumentReviewFeedback" class="wa-document-review-feedback" data-document-review-feedback role="alert" hidden></p></div><div class="wa-document-review-actions"><button type="button" data-document-decision="in_review">Start / reopen review</button><button type="button" data-document-decision="changes_requested">Request replacement</button><button type="button" data-document-decision="rejected" class="danger">Reject document</button><button type="button" data-document-decision="approved" class="approve">Approve document</button></div></div><main class="wa-document-review-stage" data-document-review-stage><div class="wa-document-review-loading"><span></span><strong>Securely fetching document…</strong></div></main></div></section>`;
  const requestModal = `<section class="wa-document-request-modal" data-document-request-modal hidden role="dialog" aria-modal="true" aria-labelledby="waDocumentRequestTitle"><form class="wa-document-request-shell" data-document-request-form><header><div><span>Additional evidence</span><strong id="waDocumentRequestTitle">Request a document</strong><small>The request appears immediately in the customer workspace.</small></div><button type="button" data-document-request-close aria-label="Close request form">×</button></header><div class="wa-document-request-fields"><label>Document type<select name="documentType" required><option value="letter_of_authorization">Letter of Authorization</option><option value="signatory_authorisation">Signatory authorisation</option><option value="gst_certificate">GST registration certificate</option><option value="incorporation_certificate">Certificate of incorporation</option><option value="business_address_proof">Business address proof</option><option value="bank_statement">Business bank statement</option><option value="other_requested_document">Other document</option></select></label><label>Request title<input name="title" maxlength="120" required value="Letter of Authorization" /></label><label>Instructions<textarea name="instructions" rows="5" maxlength="2000" placeholder="Explain what the document must contain, who must sign it, and the accepted date range."></textarea></label><label>Due date (optional)<input name="dueAt" type="date" /></label></div><footer><button type="button" data-document-request-close>Cancel</button><button type="submit" class="approve">Send request</button></footer></form></section>`;
  return `${gateControl}${cases}${rows.map(verificationCaseModal).join("")}${reviewModal}${requestModal}`;
}

function verificationDocumentContext(documentId) {
  for (const verification of state.snapshot?.verifications || []) {
    const document = (verification.documents || []).find((item) => item.id === documentId);
    if (document) return { document, verification };
  }
  return { document: {}, verification: {} };
}

function closeVerificationDocument() {
  const modal = document.querySelector("[data-document-review-modal]");
  if (modal) modal.hidden = true;
  if (verificationPreviewUrl) URL.revokeObjectURL(verificationPreviewUrl);
  verificationPreviewUrl = "";
  document.body.classList.remove("wa-document-review-open");
}

function closeDocumentRequest() {
  const modal = document.querySelector("[data-document-request-modal]");
  if (modal) { modal.hidden = true; delete modal.dataset.tenantId; }
  document.body.classList.remove("wa-document-review-open");
}

async function reviewVerification(tenantId, decision, notes, button) {
  if (!["in_review", "changes_requested", "rejected", "verified"].includes(decision)) return;
  if (["changes_requested", "rejected"].includes(decision) && notes.length < 10) {
    showToast("Add clear reviewer notes before this decision.", TOAST_TYPES.ERROR);
    return;
  }
  if (button) button.disabled = true;
  try {
    const token = await getSupabaseAccessToken();
    if (!token) throw new Error("Your secure session has expired. Sign in again.");
    const response = await fetch(`${window.EMS_RUNTIME_CONFIG?.supabaseUrl || ""}/functions/v1/whatsapp-platform-admin-verification`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || "", "Content-Type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ action: "review_verification", tenantId, decision, notes: notes || null }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Verification review could not be updated.");
    showToast(decision === "verified" ? "Provider business pre-check approved." : "Verification review updated.", TOAST_TYPES.SUCCESS);
    closeVerificationDocument();
    await loadSnapshot();
  } catch (error) {
    showToast(error?.message || "Verification review could not be updated.", TOAST_TYPES.ERROR);
    if (button) button.disabled = false;
  }
}

async function reviewDocument(documentId, decision, notes, button) {
  if (!["in_review", "changes_requested", "rejected", "approved"].includes(decision)) return;
  const modal = document.querySelector("[data-document-review-modal]");
  const notesField = modal?.querySelector("[data-document-review-notes]");
  const feedback = modal?.querySelector("[data-document-review-feedback]");
  const normalizedNotes = String(notes || "").trim();
  const showReviewError = (message) => {
    if (feedback) {
      feedback.textContent = message;
      feedback.hidden = false;
    }
    if (notesField) notesField.setAttribute("aria-invalid", "true");
    showToast(message, TOAST_TYPES.ERROR);
  };
  if (!documentId) {
    showReviewError("The selected document could not be identified. Close the preview and open it again.");
    return;
  }
  if (["changes_requested", "rejected"].includes(decision) && normalizedNotes.length < 10) {
    showReviewError("Enter a clear reason of at least 10 characters before requesting replacement or rejecting this document.");
    notesField?.focus();
    return;
  }
  if (feedback) feedback.hidden = true;
  notesField?.removeAttribute("aria-invalid");
  if (button) button.disabled = true;
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_review_document", { p_document_id: documentId, p_decision: decision, p_notes: normalizedNotes || null });
    if (error) throw error;
    showToast(decision === "approved" ? "Document approved independently." : "Document review updated.", TOAST_TYPES.SUCCESS);
    closeVerificationDocument();
    await loadSnapshot();
  } catch (error) {
    showReviewError(error?.message || "Document review could not be updated.");
    if (button) button.disabled = false;
  }
}

async function openVerificationDocument(documentId, button) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Your EMS session has expired.");
  const modal = document.querySelector("[data-document-review-modal]");
  const stage = modal?.querySelector("[data-document-review-stage]");
  const context = verificationDocumentContext(documentId);
  const name = context.document.name || "Verification document";
  const declaredMime = context.document.mimeType || "application/octet-stream";
  if (!modal || !stage) throw new Error("The document reviewer could not be opened.");
  const original = button.innerHTML;
  try {
    button.disabled = true;
    button.textContent = "Opening…";
    modal.hidden = false;
    modal.dataset.documentId = context.document.id || "";
    modal.querySelector("[data-document-review-name]").textContent = name;
    modal.querySelector("[data-document-review-meta]").textContent = `${declaredMime} · ${Math.ceil(Number(context.document.size || 0) / 1024)} KB · ${reviewStatusLabel(context.document.reviewStatus)}`;
    const notesField = modal.querySelector("[data-document-review-notes]");
    const feedback = modal.querySelector("[data-document-review-feedback]");
    notesField.value = context.document.reviewNotes || "";
    notesField.removeAttribute("aria-invalid");
    if (feedback) feedback.hidden = true;
    modal.querySelector("[data-document-review-toolbar]").hidden = !state.canApprove;
    stage.innerHTML = '<div class="wa-document-review-loading"><span></span><strong>Securely fetching document…</strong></div>';
    document.body.classList.add("wa-document-review-open");
    const response = await fetch(`${window.EMS_RUNTIME_CONFIG?.supabaseUrl || ""}/functions/v1/whatsapp-platform-admin-verification`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || "", "Content-Type": "application/json" }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", body: JSON.stringify({ documentId }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || "Document could not be opened."); }
    const blob = await response.blob();
    verificationPreviewUrl = URL.createObjectURL(blob);
    const mime = blob.type || declaredMime;
    if (mime.startsWith("image/")) stage.innerHTML = `<img src="${verificationPreviewUrl}" alt="${escapeHtml(name)}" />`;
    else if (mime === "application/pdf") stage.innerHTML = `<iframe src="${verificationPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH" title="${escapeHtml(name)}"></iframe>`;
    else stage.innerHTML = `<div class="wa-document-review-unsupported"><strong>Preview is not available for this file type.</strong><span>${escapeHtml(mime)}</span><a href="${verificationPreviewUrl}" download="${escapeHtml(name)}">Download a protected copy</a></div>`;
  } catch (error) {
    closeVerificationDocument();
    throw error;
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function metaSetup() {
  const config = window.WHATSAPP_PLATFORM_CONFIG || {};
  const embeddedReady = Boolean(config.embeddedSignupConfigId);
  const provider = state.providerSecretStatus;
  const providerState = state.providerSecretLoading ? "checking" : provider?.configured ? "configured" : "not_configured";
  const secretControl = state.hasFullAuthority ? `<article class="wa-admin-card wa-admin-secret-card"><div class="wa-admin-secret-heading"><div><h3>Meta App Secret</h3><p>Enter the current secret from Meta. It is sent directly to protected server storage and is never returned to this page.</p></div>${status(providerState)}</div><form data-meta-secret-form autocomplete="off"><label class="wa-admin-secret-field"><span>App Secret</span><span class="wa-admin-secret-input"><input name="meta_app_secret" type="password" autocomplete="new-password" inputmode="text" minlength="32" maxlength="128" pattern="[A-Fa-f0-9]{32,128}" required /><button type="button" data-meta-secret-toggle aria-label="Show App Secret" aria-pressed="false">Show</button></span><small>Paste the value directly from Meta. Do not send it in chat, email, or support messages.</small></label><div class="wa-admin-secret-footer"><span>${provider?.updatedAt ? `Last securely updated ${escapeHtml(formatDate(provider.updatedAt))}` : "No server-side secret is currently configured."}</span><button class="wa-admin-button primary" type="submit">Encrypt &amp; save</button></div></form></article>` : `<article class="wa-admin-card"><h3>Meta App Secret</h3><div class="wa-admin-empty">Only the Chairman &amp; Managing Director or Super Admin can configure this server credential.</div></article>`;
  const webhookControl = state.hasFullAuthority ? `<article class="wa-admin-card wa-admin-secret-card"><div class="wa-admin-secret-heading"><div><h3>WhatsApp webhook</h3><p>Generate a verification token, copy it once into Meta, and use the protected callback URL below.</p></div>${status(provider?.webhookConfigured ? "configured" : "not_configured")}</div><div class="wa-admin-list"><div class="wa-admin-row"><strong>Callback URL</strong><span class="wa-admin-code">https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/whatsapp-platform-webhook</span></div><div class="wa-admin-row"><strong>Verification token</strong><span>${provider?.webhookConfigured ? `Configured ${escapeHtml(formatDate(provider.webhookUpdatedAt))}` : "Not generated"}</span></div></div><div class="wa-webhook-token" data-webhook-token-output hidden><label>Copy this token into Meta now<input type="text" readonly data-webhook-token-value /></label><button class="wa-admin-button" type="button" data-webhook-copy>Copy token</button><small>This value is shown only once. Generating another token immediately invalidates the previous one.</small></div><button class="wa-admin-button primary" type="button" data-webhook-generate>${provider?.webhookConfigured ? "Rotate verification token" : "Generate verification token"}</button></article>` : "";
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><h3>Meta application</h3><p>Production configuration for the sellable WhatsApp Business Platform product.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Meta App ID</strong><span class="wa-admin-code">${escapeHtml(config.metaAppId || "Not configured")}</span></div><div class="wa-admin-row"><strong>Business verification</strong>${status("complete")}</div><div class="wa-admin-row"><strong>Tech Provider App Review</strong>${status("in_review")}</div><div class="wa-admin-row"><strong>Embedded Signup Configuration</strong>${status(embeddedReady ? "ready" : "not_configured")}</div><div class="wa-admin-row"><strong>Server credential</strong>${status(providerState)}</div><div class="wa-admin-row"><strong>Public portal</strong><a class="wa-admin-button" href="${escapeHtml(ROUTES.WHATSAPP_PLATFORM_PORTAL)}" target="_blank" rel="noopener">Open portal</a></div></div></article><article class="wa-admin-card"><h3>Launch checklist</h3><p>Complete these controls before accepting production customers.</p><div class="wa-admin-checklist"><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Dedicated Meta app created</strong><small>Varada Nexus Connect</small></div></div><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Business verification</strong><small>Verified in Meta Business Manager</small></div></div><div class="wa-admin-check"><span class="wa-admin-check-icon">✓</span><div><strong>Embedded Signup configuration</strong><small>Configuration ID ${escapeHtml(config.embeddedSignupConfigId || "pending")}</small></div></div><div class="wa-admin-check pending"><span class="wa-admin-check-icon">4</span><div><strong>Complete Tech Provider review</strong><small>Submission is in review; Meta may request additional evidence</small></div></div></div></article>${secretControl}${webhookControl}</section>`;
}

function razorpaySetup() {
  const provider = state.providerSecretStatus;
  const configured = provider?.razorpayConfigured === true;
  const webhookConfigured = provider?.razorpayWebhookConfigured === true;
  const endpoint = "https://ftejxcycoiagbslnzaab.supabase.co/functions/v1/whatsapp-platform-billing?webhook=razorpay";
  if (!state.hasFullAuthority) return `<section class="wa-admin-card"><h3>Razorpay billing credentials</h3><div class="wa-admin-empty">Only the Chairman &amp; Managing Director or Super Admin can configure payment credentials.</div></section>`;
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Subscription payment gateway</h3><p>The checkout uses Razorpay Subscriptions. Credentials are encrypted server-side and are never returned to the browser.</p></div>${status(configured && webhookConfigured ? "configured" : "not_configured")}</div><div class="wa-admin-list"><div class="wa-admin-row"><strong>API credentials</strong><span>${configured ? `Configured ${escapeHtml(formatDate(provider.razorpayUpdatedAt))}` : "Not configured"}</span></div><div class="wa-admin-row"><strong>Webhook signing secret</strong><span>${webhookConfigured ? `Configured ${escapeHtml(formatDate(provider.razorpayWebhookUpdatedAt))}` : "Not configured"}</span></div><div class="wa-admin-row"><strong>Webhook URL</strong><span class="wa-admin-code">${endpoint}</span></div></div></article><article class="wa-admin-card wa-admin-secret-card"><div class="wa-admin-secret-heading"><div><h3>${configured ? "Rotate Razorpay credentials" : "Enter Razorpay credentials"}</h3><p>Use Test Mode keys while testing. Replace them with Live Mode keys only when production billing is ready.</p></div>${status(configured ? "protected" : "action_required")}</div><form data-razorpay-secret-form autocomplete="off"><label class="wa-admin-secret-field"><span>Key ID</span><span class="wa-admin-secret-input"><input name="razorpay_key_id" type="text" autocomplete="off" minlength="17" maxlength="80" placeholder="rzp_test_…" required /></span><small>Razorpay Dashboard → Account &amp; Settings → API Keys.</small></label><label class="wa-admin-secret-field"><span>Key Secret</span><span class="wa-admin-secret-input"><input name="razorpay_key_secret" type="password" autocomplete="new-password" minlength="16" maxlength="128" required /><button type="button" data-secret-toggle="razorpay_key_secret" aria-label="Show Key Secret" aria-pressed="false">Show</button></span><small>This value is write-only. Saving a new value replaces the previous credential.</small></label><label class="wa-admin-secret-field"><span>Webhook signing secret</span><span class="wa-admin-secret-input"><input name="razorpay_webhook_secret" type="password" autocomplete="new-password" minlength="16" maxlength="128" required /><button type="button" data-secret-toggle="razorpay_webhook_secret" aria-label="Show webhook secret" aria-pressed="false">Show</button></span><small>Choose a private value and paste the exact same value when creating the webhook in Razorpay.</small></label><div class="wa-admin-secret-footer"><span>Nothing entered here is stored in the page or browser.</span><button class="wa-admin-button primary" type="submit">Encrypt &amp; save credentials</button></div></form></article><article class="wa-admin-card"><h3>Razorpay webhook setup</h3><p>After saving credentials, add the webhook in Razorpay and subscribe to the lifecycle events below.</p><ol class="wa-admin-steps"><li>Open Razorpay Dashboard → Account &amp; Settings → Webhooks.</li><li>Use the webhook URL shown above and the same signing secret entered on this page.</li><li>Select subscription authenticated, activated, charged, pending, halted, paused, resumed, cancelled, completed and expired events.</li></ol><div class="wa-admin-notice"><strong>Secret safety:</strong> never paste payment secrets into source files, chat, email, or screenshots.</div></article></section>`;
}

function adminBillingMoney(paise, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(paise || 0) / 100); }
  catch { return `${currency} ${(Number(paise || 0) / 100).toLocaleString("en-IN")}`; }
}

async function loadBillingSnapshot() {
  if (!state.hasFullAuthority || state.billingLoading) return;
  state.billingLoading = true; state.billingError = ""; render();
  try { state.billingSnapshot = await providerSecretRequest("billing_snapshot"); }
  catch (error) { state.billingSnapshot = null; state.billingError = error?.message || "Billing data could not be loaded."; }
  state.billingLoading = false; render();
}

async function submitBillingRefund(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const amountPaise = Math.round(Number(values.get("amount") || 0) * 100);
  const maxPaise = Number(values.get("maxPaise") || 0);
  const reason = String(values.get("reason") || "").trim();
  const button = form.querySelector('button[type="submit"]');
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || amountPaise > maxPaise) { showToast("Enter an amount within the refundable balance.", TOAST_TYPES.ERROR); return; }
  if (reason.length < 10 || reason.length > 500) { showToast("Enter a finance reason of 10 to 500 characters.", TOAST_TYPES.ERROR); return; }
  if (values.get("confirmed") !== "on") { showToast("Confirm the irreversible Razorpay refund instruction.", TOAST_TYPES.ERROR); return; }
  button.disabled = true; button.textContent = "Submitting securely…";
  try {
    const result = await providerSecretRequest("billing_refund", { paymentId: values.get("paymentId"), amountPaise, reason, confirmed: true });
    showToast(`Refund ${result?.refund?.id || "request"} submitted to Razorpay.`, TOAST_TYPES.SUCCESS);
    document.querySelector("[data-finance-refund-modal]")?.setAttribute("hidden", "");
    document.body.classList.remove("wa-finance-modal-open");
    await loadBillingSnapshot();
  } catch (error) {
    showToast(error?.message || "Refund could not be submitted.", TOAST_TYPES.ERROR);
    button.disabled = false; button.textContent = "Submit refund";
  }
}

function billingOverview() {
  if (state.billingLoading) return '<div class="wa-admin-empty">Loading protected billing data…</div>';
  if (state.billingError) return `<div class="wa-admin-notice"><strong>Billing data unavailable.</strong><br>${escapeHtml(state.billingError)}</div>`;
  const totals = state.billingSnapshot?.totals || {};
  const subscriptions = (state.billingSnapshot?.subscriptions || []).slice(0, 6);
  const payments = (state.billingSnapshot?.payments || []).slice(0, 6);
  return `<section class="wa-admin-stats wa-finance-stats"><article class="wa-admin-stat"><span>Active subscriptions</span><strong>${Number(totals.activeSubscriptions || 0)}</strong><small>${Number(totals.subscriptions || 0)} total records</small></article><article class="wa-admin-stat"><span>Needs attention</span><strong>${Number(totals.pendingSubscriptions || 0)}</strong><small>Created, pending or halted</small></article><article class="wa-admin-stat"><span>Captured payments</span><strong>${Number(totals.capturedPayments || 0)}</strong><small>${escapeHtml(adminBillingMoney(totals.capturedRevenuePaise))} gateway gross</small></article><article class="wa-admin-stat"><span>Issued invoices</span><strong>${Number(totals.invoices || 0)}</strong><small>${escapeHtml(adminBillingMoney(totals.issuedInvoicePaise))} documented</small></article><article class="wa-admin-stat"><span>Credit notes</span><strong>${Number(totals.creditNotes || 0)}</strong><small>${escapeHtml(adminBillingMoney(totals.issuedCreditPaise))} credited</small></article><article class="wa-admin-stat"><span>Net documented</span><strong>${escapeHtml(adminBillingMoney(totals.netDocumentedRevenuePaise))}</strong><small>Invoices less credit notes</small></article><article class="wa-admin-stat"><span>Processed refunds</span><strong>${Number(totals.processedRefunds || 0)}</strong><small>${Number(totals.pendingRefunds || 0)} pending at Razorpay</small></article><article class="wa-admin-stat ${Number(totals.reconciliationAlerts || 0) ? "attention" : "healthy"}"><span>Reconciliation alerts</span><strong>${Number(totals.reconciliationAlerts || 0)}</strong><small>${Number(totals.reconciliationAlerts || 0) ? "Requires finance review" : "Ledger is internally aligned"}</small></article></section><section class="wa-admin-grid"><article class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Recent subscriptions</h3><p>Latest customer subscription activity.</p></div><a class="wa-admin-button" href="?view=subscriptions">View all</a></div><div class="wa-admin-list">${subscriptions.length ? subscriptions.map((item) => `<div class="wa-admin-row"><div><strong>${escapeHtml(item.tenant_name)}</strong><small>${escapeHtml(item.package_code)} · ${escapeHtml(item.billing_interval)} · ${escapeHtml(item.mode)}</small></div>${status(item.status)}</div>`).join("") : '<div class="wa-admin-empty">No subscriptions yet.</div>'}</div></article><article class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Recent payments</h3><p>Newest entries in the protected payment ledger.</p></div><a class="wa-admin-button" href="?view=payments">View ledger</a></div><div class="wa-admin-list">${payments.length ? payments.map((item) => `<div class="wa-admin-row"><div><strong>${escapeHtml(item.tenant_name)}</strong><small>${escapeHtml(item.invoice_number || item.provider_payment_id)} · ${escapeHtml(formatDate(item.paid_at || item.created_at))}</small></div><span>${escapeHtml(adminBillingMoney(item.amount_paise, item.currency))}</span></div>`).join("") : '<div class="wa-admin-empty">No payments yet.</div>'}</div></article></section><section class="wa-admin-card"><h3>Billing controls</h3><p>Commercial definitions remain in Package Master. Each finance register now has a dedicated Billing page.</p><div class="wa-admin-actions"><a class="wa-admin-button" href="?view=package-master">Open Package Master</a><a class="wa-admin-button primary" href="?view=payments">Open payment ledger</a><a class="wa-admin-button" href="?view=reconciliation">Reconciliation</a><a class="wa-admin-button" href="?view=razorpay">Razorpay Settings</a></div></section>`;
}

function billingSubscriptions() {
  if (state.billingLoading) return '<div class="wa-admin-empty">Loading subscriptions and payments…</div>';
  if (state.billingError) return `<div class="wa-admin-notice"><strong>Billing data unavailable.</strong><br>${escapeHtml(state.billingError)}</div>`;
  const subscriptions = state.billingSnapshot?.subscriptions || [];
  const payments = state.billingSnapshot?.payments || [];
  const invoices = state.billingSnapshot?.invoices || [];
  const refunds = state.billingSnapshot?.refunds || [];
  const creditNotes = state.billingSnapshot?.creditNotes || [];
  const reconciliation = state.billingSnapshot?.reconciliation || {};
  const subscriptionRows = subscriptions.map((item) => `<tr><td><strong>${escapeHtml(item.tenant_name)}</strong><br><small>${escapeHtml(item.id)}</small></td><td>${escapeHtml(item.package_code)}<br><small>${escapeHtml(item.billing_interval)}</small></td><td>${status(item.status)}</td><td>${Number(item.paid_count || 0)}<br><small>${item.remaining_count == null ? "—" : `${Number(item.remaining_count)} remaining`}</small></td><td>${escapeHtml(formatDate(item.current_end || item.charge_at || item.created_at))}</td></tr>`).join("");
  const paymentRows = payments.map((item) => `<tr><td><strong>${escapeHtml(item.tenant_name)}</strong><br><small>${escapeHtml(item.provider_payment_id)} · ${escapeHtml(item.mode)}</small></td><td><strong>${escapeHtml(item.invoice_number || "Awaiting EMS invoice")}</strong><br><small>${escapeHtml(item.provider_invoice_id || "No Razorpay invoice")}</small></td><td>${escapeHtml(item.payment_method || "—")}</td><td>${status(item.status)}</td><td><strong>${escapeHtml(adminBillingMoney(item.amount_paise, item.currency))}</strong><br><small>${Number(item.refunded_paise || 0) ? `${escapeHtml(adminBillingMoney(item.refunded_paise, item.currency))} refunded` : "No refund"}</small></td><td>${escapeHtml(formatDate(item.paid_at || item.created_at))}</td><td>${Number(item.refundable_paise || 0) > 0 ? `<button class="wa-admin-button danger" type="button" data-billing-refund-open="${escapeHtml(item.id)}" data-refund-workspace="${escapeHtml(item.tenant_name)}" data-refund-payment="${escapeHtml(item.provider_payment_id)}" data-refund-currency="${escapeHtml(item.currency)}" data-refund-balance="${Number(item.refundable_paise)}">Refund</button>` : '<span class="wa-finance-settled">Settled</span>'}</td></tr>`).join("");
  const invoiceRows = invoices.map((item) => `<tr><td><strong>${escapeHtml(item.invoice_number)}</strong><br><small>${escapeHtml(item.document_environment)}</small></td><td>${escapeHtml(item.tenant_name)}</td><td>${status(item.status)}</td><td>${escapeHtml(adminBillingMoney(item.taxable_base_paise, item.currency))}<br><small>GST ${escapeHtml(adminBillingMoney(item.gst_paise, item.currency))}</small></td><td>${escapeHtml(adminBillingMoney(item.total_paise, item.currency))}</td><td>${escapeHtml(item.provider_invoice_id)}<br><small>${escapeHtml(item.provider_payment_id)}</small></td><td>${escapeHtml(formatDate(item.issued_at))}</td></tr>`).join("");
  const refundRows = refunds.map((item) => `<tr><td><strong>${escapeHtml(item.provider_refund_id)}</strong><br><small>${escapeHtml(item.provider_payment_id)}</small></td><td>${escapeHtml(item.tenant_name)}</td><td>${status(item.status)}</td><td>${escapeHtml(adminBillingMoney(item.amount_paise, item.currency))}</td><td>${escapeHtml(item.credit_note_number || (item.status === "processed" ? "Credit note pending" : "Issued after processing"))}</td><td>${escapeHtml(item.reason || "—")}</td><td>${escapeHtml(formatDate(item.processed_at || item.created_at))}</td></tr>`).join("");
  const creditRows = creditNotes.map((item) => `<tr><td><strong>${escapeHtml(item.credit_note_number)}</strong><br><small>${escapeHtml(item.document_environment)}</small></td><td>${escapeHtml(item.tenant_name)}</td><td>${status(item.status)}</td><td>${escapeHtml(adminBillingMoney(item.total_paise, item.currency))}</td><td>${escapeHtml(item.provider_refund_id)}</td><td>${escapeHtml(item.provider_invoice_id)}</td><td>${escapeHtml(formatDate(item.issued_at))}</td></tr>`).join("");
  const webhookRows = (reconciliation.webhookErrors || []).map((item) => `<div class="wa-admin-row"><div><strong>${escapeHtml(item.event_type)}</strong><small>${escapeHtml(item.provider_event_id)} · ${escapeHtml(formatDate(item.received_at))}</small></div><span>${escapeHtml(item.processing_error)}</span></div>`).join("");
  const refundModal = `<section class="wa-finance-refund-modal" data-finance-refund-modal hidden><form class="wa-finance-refund-shell" data-finance-refund-form><header><div><span>Protected finance action</span><strong>Issue Razorpay refund</strong><small data-refund-summary></small></div><button type="button" data-finance-refund-close aria-label="Close">×</button></header><main><div class="wa-finance-refund-balance"><span>Refundable balance</span><strong data-refund-balance-label></strong></div><input type="hidden" name="paymentId" /><input type="hidden" name="maxPaise" /><label>Refund amount<input name="amount" type="number" min="0.01" step="0.01" required /><small>The amount is submitted to Razorpay in the payment currency.</small></label><label>Finance reason<textarea name="reason" minlength="10" maxlength="500" rows="4" required placeholder="Explain why this refund is being issued."></textarea></label><label class="wa-finance-confirm"><input name="confirmed" type="checkbox" required /><span>I confirm this is an irreversible instruction to refund the customer through Razorpay. A central EMS credit note will be issued only when Razorpay reports the refund as processed.</span></label></main><footer><button class="wa-admin-button" type="button" data-finance-refund-close>Cancel</button><button class="wa-admin-button danger" type="submit">Submit refund</button></footer></form></section>`;
  return `<section class="wa-admin-card wa-finance-reconciliation ${Number(state.billingSnapshot?.totals?.reconciliationAlerts || 0) ? "attention" : "healthy"}"><div class="wa-admin-secret-heading"><div><h3>Reconciliation control</h3><p>Cross-checks captured payments, EMS invoices, processed refunds, central credit notes and webhook processing.</p></div>${status(`${Number(state.billingSnapshot?.totals?.reconciliationAlerts || 0)}_alerts`)}</div><div class="wa-finance-checks"><div><span>Captured payments missing invoice</span><strong>${Number(reconciliation.missingInvoices || 0)}</strong></div><div><span>Processed refunds missing credit note</span><strong>${Number(reconciliation.missingCredits || 0)}</strong></div><div><span>Failed webhook events</span><strong>${Number((reconciliation.webhookErrors || []).length)}</strong></div><div><span>Expired refund reservations</span><strong>${Number(reconciliation.staleRefundRequests || 0)}</strong></div></div>${webhookRows ? `<div class="wa-admin-list wa-finance-webhook-errors">${webhookRows}</div>` : ""}</section><section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Customer subscriptions</h3><p>Razorpay lifecycle state synchronized by verified checkout callbacks and webhooks.</p></div>${status(`${subscriptions.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Workspace</th><th>Package</th><th>Status</th><th>Payments</th><th>Next billing date</th></tr></thead><tbody>${subscriptionRows || '<tr><td colspan="5">No subscriptions yet.</td></tr>'}</tbody></table></div></section><section class="wa-admin-card" id="payments"><div class="wa-admin-secret-heading"><div><h3>Payment &amp; refund ledger</h3><p>Refund commands are balance-checked, submitted server-side and recorded in the EMS audit log.</p></div>${status(`${payments.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Workspace / payment</th><th>EMS / Razorpay invoice</th><th>Method</th><th>Status</th><th>Amount</th><th>Paid</th><th>Action</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="7">No payments yet.</td></tr>'}</tbody></table></div></section><section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Central invoice register</h3><p>Taxable value, GST, central EMS sequence and Razorpay references.</p></div>${status(`${invoices.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>EMS invoice</th><th>Workspace</th><th>Status</th><th>Taxable / GST</th><th>Total</th><th>Razorpay references</th><th>Issued</th></tr></thead><tbody>${invoiceRows || '<tr><td colspan="7">No invoices issued.</td></tr>'}</tbody></table></div></section><section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Refund register</h3><p>Razorpay refund state and the resulting EMS credit note.</p></div>${status(`${refunds.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Refund / payment</th><th>Workspace</th><th>Status</th><th>Amount</th><th>Credit note</th><th>Reason</th><th>Updated</th></tr></thead><tbody>${refundRows || '<tr><td colspan="7">No refunds recorded.</td></tr>'}</tbody></table></div></section><section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Central credit-note register</h3><p>Credit notes inherit the EMS-wide statutory sequence in live mode.</p></div>${status(`${creditNotes.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>EMS credit note</th><th>Workspace</th><th>Status</th><th>Total</th><th>Razorpay refund</th><th>Razorpay invoice</th><th>Issued</th></tr></thead><tbody>${creditRows || '<tr><td colspan="7">No credit notes issued.</td></tr>'}</tbody></table></div></section>${refundModal}`;
}

function financePageState(loadingText) {
  if (state.billingLoading) return `<div class="wa-admin-empty">${escapeHtml(loadingText)}</div>`;
  if (state.billingError) return `<div class="wa-admin-notice"><strong>Billing data unavailable.</strong><br>${escapeHtml(state.billingError)}</div>`;
  return "";
}

function financeRefundModal() {
  return `<section class="wa-finance-refund-modal" data-finance-refund-modal hidden><form class="wa-finance-refund-shell" data-finance-refund-form><header><div><span>Protected finance action</span><strong>Issue Razorpay refund</strong><small data-refund-summary></small></div><button type="button" data-finance-refund-close aria-label="Close">×</button></header><main><div class="wa-finance-refund-balance"><span>Refundable balance</span><strong data-refund-balance-label></strong></div><input type="hidden" name="paymentId" /><input type="hidden" name="maxPaise" /><label>Refund amount<input name="amount" type="number" min="0.01" step="0.01" required /><small>The amount is submitted to Razorpay in the payment currency.</small></label><label>Finance reason<textarea name="reason" minlength="10" maxlength="500" rows="4" required placeholder="Explain why this refund is being issued."></textarea></label><label class="wa-finance-confirm"><input name="confirmed" type="checkbox" required /><span>I confirm this is an irreversible instruction to refund the customer through Razorpay. A central EMS credit note will be issued only when Razorpay reports the refund as processed.</span></label></main><footer><button class="wa-admin-button" type="button" data-finance-refund-close>Cancel</button><button class="wa-admin-button danger" type="submit">Submit refund</button></footer></form></section>`;
}

function billingSubscriptionsPage() {
  const guard = financePageState("Loading customer subscriptions…"); if (guard) return guard;
  const rows = (state.billingSnapshot?.subscriptions || []).map((item) => `<tr><td><strong>${escapeHtml(item.tenant_name)}</strong><br><small>${escapeHtml(item.id)}</small></td><td>${escapeHtml(item.package_code)}<br><small>${escapeHtml(item.billing_interval)} · ${escapeHtml(item.mode)}</small></td><td>${status(item.status)}</td><td>${Number(item.paid_count || 0)}<br><small>${item.remaining_count == null ? "—" : `${Number(item.remaining_count)} remaining`}</small></td><td>${escapeHtml(formatDate(item.current_start || item.activated_at || item.created_at))}</td><td>${escapeHtml(formatDate(item.current_end || item.charge_at || item.created_at))}</td><td>${item.cancel_at_cycle_end ? status("ends_at_cycle") : status("recurring")}</td></tr>`).join("");
  return `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Customer subscription register</h3><p>One focused lifecycle register for package, interval, provider mode and renewal state.</p></div>${status(`${(state.billingSnapshot?.subscriptions || []).length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Workspace</th><th>Package</th><th>Status</th><th>Payments</th><th>Started</th><th>Next billing</th><th>Renewal</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No subscriptions yet.</td></tr>'}</tbody></table></div></section>`;
}

function billingPaymentsPage() {
  const guard = financePageState("Loading protected payment ledger…"); if (guard) return guard;
  const payments = state.billingSnapshot?.payments || [];
  const rows = payments.map((item) => `<tr><td><strong>${escapeHtml(item.tenant_name)}</strong><br><small>${escapeHtml(item.provider_payment_id)} · ${escapeHtml(item.mode)}</small></td><td><strong>${escapeHtml(item.invoice_number || "Awaiting EMS invoice")}</strong><br><small>${escapeHtml(item.provider_invoice_id || "No Razorpay invoice")}</small></td><td>${escapeHtml(item.payment_method || "—")}</td><td>${status(item.status)}</td><td><strong>${escapeHtml(adminBillingMoney(item.amount_paise, item.currency))}</strong><br><small>${Number(item.refunded_paise || 0) ? `${escapeHtml(adminBillingMoney(item.refunded_paise, item.currency))} refunded` : "No refund"}</small></td><td>${escapeHtml(adminBillingMoney(item.refundable_paise, item.currency))}</td><td>${escapeHtml(formatDate(item.paid_at || item.created_at))}</td><td>${Number(item.refundable_paise || 0) > 0 ? `<button class="wa-admin-button danger" type="button" data-billing-refund-open="${escapeHtml(item.id)}" data-refund-workspace="${escapeHtml(item.tenant_name)}" data-refund-payment="${escapeHtml(item.provider_payment_id)}" data-refund-currency="${escapeHtml(item.currency)}" data-refund-balance="${Number(item.refundable_paise)}">Refund</button>` : '<span class="wa-finance-settled">Settled</span>'}</td></tr>`).join("");
  return `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Verified payment ledger</h3><p>Captured Razorpay transactions with EMS documents, refunded value and remaining refundable balance.</p></div>${status(`${payments.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Workspace / payment</th><th>EMS / Razorpay invoice</th><th>Method</th><th>Status</th><th>Gross / refunded</th><th>Refundable</th><th>Paid</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No payments yet.</td></tr>'}</tbody></table></div></section>${financeRefundModal()}`;
}

function billingInvoicesPage() {
  const guard = financePageState("Loading central invoice register…"); if (guard) return guard;
  const invoices = state.billingSnapshot?.invoices || [];
  const rows = invoices.map((item) => `<tr><td><strong>${escapeHtml(item.invoice_number)}</strong><br><small>${escapeHtml(item.document_environment)} · ${escapeHtml(formatDate(item.invoice_date))}</small></td><td>${escapeHtml(item.tenant_name)}<br><small>${escapeHtml(item.billing_gstin || "GSTIN not supplied")}</small></td><td>${status(item.status)}</td><td>${escapeHtml(adminBillingMoney(item.taxable_base_paise, item.currency))}</td><td>${escapeHtml(adminBillingMoney(item.gst_paise, item.currency))}</td><td>${escapeHtml(adminBillingMoney(item.gateway_adjustment_paise, item.currency))}</td><td><strong>${escapeHtml(adminBillingMoney(item.total_paise, item.currency))}</strong></td><td>${escapeHtml(item.provider_invoice_id)}<br><small>${escapeHtml(item.provider_payment_id)}</small></td><td>${escapeHtml(formatDate(item.issued_at))}</td></tr>`).join("");
  return `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Central invoice register</h3><p>EMS invoice sequence, taxable value, GST, gateway adjustment and Razorpay references.</p></div>${status(`${invoices.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>EMS invoice</th><th>Customer</th><th>Status</th><th>Taxable</th><th>GST</th><th>Gateway</th><th>Total</th><th>Razorpay references</th><th>Issued</th></tr></thead><tbody>${rows || '<tr><td colspan="9">No invoices issued.</td></tr>'}</tbody></table></div></section>`;
}

function billingRefundsPage() {
  const guard = financePageState("Loading refund register…"); if (guard) return guard;
  const refunds = state.billingSnapshot?.refunds || [];
  const requests = state.billingSnapshot?.refundRequests || [];
  const rows = refunds.map((item) => `<tr><td><strong>${escapeHtml(item.provider_refund_id)}</strong><br><small>${escapeHtml(item.provider_payment_id)}</small></td><td>${escapeHtml(item.tenant_name)}</td><td>${status(item.status)}</td><td>${escapeHtml(adminBillingMoney(item.amount_paise, item.currency))}</td><td>${escapeHtml(item.credit_note_number || (item.status === "processed" ? "Credit note pending" : "Issued after processing"))}</td><td>${escapeHtml(item.reason || "—")}</td><td>${escapeHtml(formatDate(item.processed_at || item.created_at))}</td></tr>`).join("");
  const requestRows = requests.map((item) => `<tr><td><strong>${escapeHtml(item.id)}</strong><br><small>${escapeHtml(item.provider_refund_id || "Provider ID pending")}</small></td><td>${status(item.status)}</td><td>${escapeHtml(adminBillingMoney(item.amount_paise, item.currency))}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.provider_error || "—")}</td><td>${escapeHtml(formatDate(item.completed_at || item.submitted_at || item.created_at))}</td></tr>`).join("");
  return `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Razorpay refund register</h3><p>Provider status, reason, amount and the linked central EMS credit note.</p></div>${status(`${refunds.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Refund / payment</th><th>Workspace</th><th>Status</th><th>Amount</th><th>Credit note</th><th>Reason</th><th>Updated</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No refunds recorded.</td></tr>'}</tbody></table></div></section><section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Refund command audit</h3><p>Every EMS refund reservation, provider submission and failure remains traceable.</p></div>${status(`${requests.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>EMS request / provider refund</th><th>Status</th><th>Amount</th><th>Reason</th><th>Provider error</th><th>Updated</th></tr></thead><tbody>${requestRows || '<tr><td colspan="6">No refund commands recorded.</td></tr>'}</tbody></table></div></section>`;
}

function billingCreditNotesPage() {
  const guard = financePageState("Loading central credit-note register…"); if (guard) return guard;
  const notes = state.billingSnapshot?.creditNotes || [];
  const rows = notes.map((item) => `<tr><td><strong>${escapeHtml(item.credit_note_number)}</strong><br><small>${escapeHtml(item.document_environment)} · ${escapeHtml(formatDate(item.credit_note_date))}</small></td><td>${escapeHtml(item.tenant_name)}</td><td>${status(item.status)}</td><td><strong>${escapeHtml(adminBillingMoney(item.total_paise, item.currency))}</strong></td><td>${escapeHtml(item.provider_refund_id)}</td><td>${escapeHtml(item.provider_invoice_id)}<br><small>${escapeHtml(item.provider_payment_id)}</small></td><td>${escapeHtml(item.reason || "—")}</td><td>${escapeHtml(formatDate(item.issued_at))}</td></tr>`).join("");
  return `<section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Central credit-note register</h3><p>EMS-wide credit-note sequence linked to the original Razorpay invoice, payment and refund.</p></div>${status(`${notes.length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>EMS credit note</th><th>Customer</th><th>Status</th><th>Total</th><th>Razorpay refund</th><th>Invoice / payment</th><th>Reason</th><th>Issued</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No credit notes issued.</td></tr>'}</tbody></table></div></section>`;
}

function billingReconciliationPage() {
  const guard = financePageState("Running finance reconciliation…"); if (guard) return guard;
  const reconciliation = state.billingSnapshot?.reconciliation || {};
  const total = Number(state.billingSnapshot?.totals?.reconciliationAlerts || 0);
  const webhookRows = (reconciliation.webhookErrors || []).map((item) => `<tr><td>${escapeHtml(item.event_type)}</td><td>${escapeHtml(item.provider_event_id)}</td><td>${escapeHtml(item.processing_error)}</td><td>${escapeHtml(formatDate(item.received_at))}</td></tr>`).join("");
  return `<section class="wa-admin-card wa-finance-reconciliation ${total ? "attention" : "healthy"}"><div class="wa-admin-secret-heading"><div><h3>Finance reconciliation status</h3><p>Cross-check captured payments, EMS documents, Razorpay refunds and webhook processing.</p></div>${status(`${total}_alerts`)}</div><div class="wa-finance-checks"><div><span>Captured payments missing invoice</span><strong>${Number(reconciliation.missingInvoices || 0)}</strong></div><div><span>Processed refunds missing credit note</span><strong>${Number(reconciliation.missingCredits || 0)}</strong></div><div><span>Failed webhook events</span><strong>${Number((reconciliation.webhookErrors || []).length)}</strong></div><div><span>Expired refund reservations</span><strong>${Number(reconciliation.staleRefundRequests || 0)}</strong></div></div></section><section class="wa-admin-card"><div class="wa-admin-secret-heading"><div><h3>Webhook processing exceptions</h3><p>Failures remain visible until the underlying event is reconciled.</p></div>${status(`${(reconciliation.webhookErrors || []).length}_records`)}</div><div class="wa-admin-table-wrap"><table class="wa-admin-table"><thead><tr><th>Event</th><th>Provider event ID</th><th>Error</th><th>Received</th></tr></thead><tbody>${webhookRows || '<tr><td colspan="4">No webhook processing exceptions.</td></tr>'}</tbody></table></div></section>`;
}

function providerSecretEndpoint() {
  return `${window.EMS_RUNTIME_CONFIG?.supabaseUrl || ""}/functions/v1/whatsapp-platform-admin-secrets`;
}

async function providerSecretRequest(action, payload = {}) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Your EMS session has expired.");
  const response = await fetch(providerSecretEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || "",
      "Content-Type": "application/json",
    },
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Provider configuration request failed.");
  return data;
}

async function loadProviderSecretStatus() {
  if (!state.hasFullAuthority || state.providerSecretLoading) return;
  state.providerSecretLoading = true;
  render();
  try { state.providerSecretStatus = await providerSecretRequest("status"); }
  catch (error) { state.providerSecretStatus = { configured: false, error: error?.message || "Could not check server configuration." }; }
  state.providerSecretLoading = false;
  render();
}

async function saveProviderSecret(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.meta_app_secret;
  const button = form.querySelector("button[type=submit]");
  const secret = String(input.value || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(secret)) { showToast("Enter the valid Meta App Secret.", TOAST_TYPES.ERROR); return; }
  button.disabled = true; button.textContent = "Encrypting…";
  try {
    state.providerSecretStatus = await providerSecretRequest("set", { secret });
    form.reset();
    const locationStatus = form.querySelector("[data-delete-location-status]");
    if (locationStatus) locationStatus.textContent = "Location not captured";
    input.type = "password";
    showToast("Meta App Secret encrypted and saved.", TOAST_TYPES.SUCCESS);
    render();
  } catch (error) {
    input.value = "";
    showToast(error?.message || "Could not save the Meta App Secret.", TOAST_TYPES.ERROR);
    button.disabled = false; button.textContent = "Encrypt & save";
  }
}

async function saveRazorpaySecrets(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const keyId = String(form.elements.razorpay_key_id.value || "").trim();
  const keySecret = String(form.elements.razorpay_key_secret.value || "").trim();
  const webhookSecret = String(form.elements.razorpay_webhook_secret.value || "").trim();
  if (!/^rzp_(test|live)_[A-Za-z0-9]{8,64}$/.test(keyId)) { showToast("Enter a valid Razorpay Key ID.", TOAST_TYPES.ERROR); return; }
  if (keySecret.length < 16 || webhookSecret.length < 16) { showToast("Both secrets must contain at least 16 characters.", TOAST_TYPES.ERROR); return; }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = "Encrypting…";
  try {
    state.providerSecretStatus = { ...(state.providerSecretStatus || {}), ...(await providerSecretRequest("set_razorpay", { keyId, keySecret, webhookSecret })) };
    form.reset();
    showToast("Razorpay credentials encrypted and saved.", TOAST_TYPES.SUCCESS);
    render();
  } catch (error) {
    form.elements.razorpay_key_secret.value = "";
    form.elements.razorpay_webhook_secret.value = "";
    showToast(error?.message || "Could not save Razorpay credentials.", TOAST_TYPES.ERROR);
    button.disabled = false; button.textContent = "Encrypt & save credentials";
  }
}

function security() {
  const auth = state.snapshot?.security || {};
  return `<section class="wa-admin-grid"><article class="wa-admin-card"><h3>Customer access boundary</h3><p>The sellable product maintains a dedicated, protected access boundary separate from staff operations.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Access controls</strong><span>Protected</span></div><div class="wa-admin-row"><strong>Credential handling</strong><span>Restricted</span></div><div class="wa-admin-row"><strong>Access lifecycle</strong><span>Managed</span></div><div class="wa-admin-row"><strong>Business separation</strong><span>Enforced</span></div><div class="wa-admin-row"><strong>Provider secrets</strong><span>Protected</span></div></div></article><article class="wa-admin-card"><h3>Security activity</h3><p>Aggregate access signals are shown without exposing credentials or security implementation details.</p><div class="wa-admin-list"><div class="wa-admin-row"><strong>Sign-in attempts · 24h</strong><span>${Number(auth.loginAttempts24h || 0)}</span></div><div class="wa-admin-row"><strong>Signup attempts · 24h</strong><span>${Number(auth.signupAttempts24h || 0)}</span></div><div class="wa-admin-row"><strong>Active access grants</strong><span>${Number(state.snapshot?.totals?.activeSessions || 0)}</span></div><div class="wa-admin-row"><strong>Inactive access grants</strong><span>${Number(auth.inactiveSessions || 0)}</span></div></div></article></section>`;
}

async function loadPackageMaster() {
  state.packageMasterLoading = true;
  const { data, error } = await db.rpc("whatsapp_platform_admin_package_master");
  state.packageMasterLoading = false;
  if (error) { state.packageMasterError = error.message || "Could not load Package Master."; state.packageMaster = null; }
  else { state.packageMaster = data || { packages: [], addons: [], assignments: [] }; state.packageMasterError = ""; }
  render();
}

function masterValue(record, key) { return escapeHtml(record?.[key] ?? ""); }
function masterLimit(record, key) { return record?.[key] == null ? "" : escapeHtml(record[key]); }
function masterOption(value, current, label = value) { return `<option value="${escapeHtml(value)}" ${String(current) === value ? "selected" : ""}>${escapeHtml(label)}</option>`; }
function masterDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return escapeHtml(local.toISOString().slice(0, 16));
}

function masterPackageForm(pkg) {
  const p = pkg || {};
  const isNew = !p.id;
  const access = p.entitlements || {};
  const accessToggle = (key, label) => `<label class="wa-master-toggle"><input type="checkbox" name="access_${key}" ${access[key] === true ? "checked" : ""}/><span>${escapeHtml(label)}</span></label>`;
  return `<form class="wa-master-record" data-master-package-form="${escapeHtml(p.id || "")}">
    <header><div><span class="wa-admin-kicker">${isNew ? "New operational package" : `Package · ${escapeHtml(p.code)}`}</span><h3>${escapeHtml(p.name || "Create package")}</h3><p>${isNew ? "Create an internal package definition. It will not appear on the public website." : "Controls customer access, limits and recurring billing."}</p></div><span class="wa-master-state ${escapeHtml(p.status || "draft")}">${escapeHtml(p.status || "draft")}</span></header>
    <div class="wa-master-section"><h4>Identity &amp; lifecycle</h4><div class="wa-pkg-grid">
      <label>Package code<input name="code" required pattern="[a-z0-9][a-z0-9_-]{1,49}" value="${masterValue(p,"code")}" placeholder="launch" ${isNew ? "" : "readonly"}/><small>Immutable key used by customer assignments.</small></label>
      <label>Customer portal name<input name="name" required value="${masterValue(p,"name")}" placeholder="Launch"/></label>
      <label>Status<select name="status">${masterOption("draft",p.status,"Draft")}${masterOption("active",p.status,"Active")}${masterOption("retired",p.status,"Retired")}</select></label>
      <label class="wa-pkg-full">Internal description<textarea name="description" rows="2">${masterValue(p,"description")}</textarea></label>
    </div></div>
    <div class="wa-master-section"><h4>Billing authority</h4><div class="wa-pkg-grid">
      <label>Billing model<select name="billingModel">${masterOption("subscription",p.billing_model,"Subscription")}${masterOption("contact_sales",p.billing_model,"Contact sales")}${masterOption("free",p.billing_model,"Free")}</select></label>
      <label>Currency<input name="currency" maxlength="3" pattern="[A-Z]{3}" value="${masterValue(p,"currency") || "INR"}"/></label>
      <label>Trial days<input name="trialDays" type="number" min="0" max="365" value="${masterValue(p,"trial_days") || 0}"/></label>
      <label>Monthly base price — excluding GST/taxes<input name="monthlyAmount" type="number" min="0" step="0.01" value="${masterValue(p,"monthly_amount") || 0}"/><small>Authoritative customer price before GST and checkout adjustments.</small></label>
      <label>Annual base price — excluding GST/taxes<input name="annualAmount" type="number" min="0" step="0.01" value="${masterValue(p,"annual_amount") || 0}"/><small>A price edit creates an immutable revision for the next renewal.</small></label>
      <label>Sort order<input name="sortOrder" type="number" value="${masterValue(p,"sort_order") || 0}"/></label>
    </div></div>
    <div class="wa-master-section"><h4>Enforced resource limits</h4><p class="wa-master-help">Blank means unlimited. Zero disables a metered capability.</p><div class="wa-master-limits">
      <label>Team seats<input name="teamMemberLimit" type="number" min="1" value="${masterLimit(p,"team_member_limit")}" placeholder="Unlimited"/></label>
      <label>WhatsApp numbers<input name="whatsappNumberLimit" type="number" min="1" value="${masterLimit(p,"whatsapp_number_limit")}" placeholder="Unlimited"/></label>
      <label>Contacts<input name="contactLimit" type="number" min="0" value="${masterLimit(p,"contact_limit")}" placeholder="Unlimited"/></label>
      <label>Messages / month<input name="monthlyMessageLimit" type="number" min="0" value="${masterLimit(p,"monthly_message_limit")}" placeholder="Unlimited"/></label>
      <label>Templates<input name="templateLimit" type="number" min="0" value="${masterLimit(p,"template_limit")}" placeholder="Unlimited"/></label>
      <label>Flows<input name="flowLimit" type="number" min="0" value="${masterLimit(p,"flow_limit")}" placeholder="Unlimited"/></label>
      <label>Campaigns<input name="campaignLimit" type="number" min="0" value="${masterLimit(p,"campaign_limit")}" placeholder="Unlimited"/></label>
      <label>Automations<input name="automationLimit" type="number" min="0" value="${masterLimit(p,"automation_limit")}" placeholder="Unlimited"/></label>
      <label>Integrations<input name="integrationLimit" type="number" min="0" value="${masterLimit(p,"integration_limit")}" placeholder="Unlimited"/></label>
      <label>Storage (MB)<input name="storageLimitMb" type="number" min="0" value="${masterLimit(p,"storage_limit_mb")}" placeholder="Unlimited"/></label>
    </div></div>
    <div class="wa-master-section"><h4>Feature access</h4><div class="wa-master-toggles">${accessToggle("team_inbox","Team inbox")}${accessToggle("contacts","Contacts")}${accessToggle("templates","Message templates")}${accessToggle("campaigns","Campaigns")}${accessToggle("flows","Flows")}${accessToggle("automations","Automations")}${accessToggle("api_access","API access")}${accessToggle("priority_support","Priority support")}</div></div>
    <footer><span>${p.current_price_version_id ? "Versioned financial price · " : "New financial price · "}Last updated ${escapeHtml(formatDate(p.updated_at))}</span><button class="wa-admin-button primary" type="submit">${isNew ? "Create package" : "Save master package"}</button></footer>
  </form>`;
}

function masterAddonForm(addon, packages) {
  const a = addon || {};
  const isNew = !a.id;
  const eligible = Array.isArray(a.eligible_plan_codes) ? a.eligible_plan_codes : [];
  const effects = a.entitlement_effects || {};
  return `<form class="wa-master-record compact" data-master-addon-form="${escapeHtml(a.id || "")}">
    <header><div><span class="wa-admin-kicker">${isNew ? "New operational add-on" : `Add-on · ${escapeHtml(a.code)}`}</span><h3>${escapeHtml(a.name || "Create add-on")}</h3><p>Defines billing and the exact access or capacity change.</p></div><span class="wa-master-state ${escapeHtml(a.status || "draft")}">${escapeHtml(a.status || "draft")}</span></header>
    <div class="wa-pkg-grid">
      <label>Add-on code<input name="code" required pattern="[a-z0-9][a-z0-9_-]{1,79}" value="${masterValue(a,"code")}" ${isNew ? "" : "readonly"}/></label>
      <label>Customer portal name<input name="name" required value="${masterValue(a,"name")}"/></label>
      <label>Status<select name="status">${masterOption("draft",a.status,"Draft")}${masterOption("active",a.status,"Active")}${masterOption("retired",a.status,"Retired")}</select></label>
      <label>Billing model<select name="billingModel">${masterOption("recurring",a.billing_model,"Recurring")}${masterOption("one_time",a.billing_model,"One-time")}${masterOption("usage",a.billing_model,"Usage")}${masterOption("contact_sales",a.billing_model,"Contact sales")}</select></label>
      <label>Interval<select name="billingInterval">${masterOption("month",a.billing_interval,"Monthly")}${masterOption("year",a.billing_interval,"Annual")}${masterOption("one_time",a.billing_interval,"One-time")}${masterOption("usage",a.billing_interval,"Usage")}${masterOption("custom",a.billing_interval,"Custom")}</select></label>
      <label>Currency<input name="currency" maxlength="3" value="${masterValue(a,"currency") || "INR"}"/></label>
      <label>Unit base price — excluding GST/taxes<input name="unitAmount" type="number" min="0" step="0.01" value="${masterValue(a,"unit_amount") || 0}"/><small>Authoritative price per billing unit.</small></label>
      <label>Billing unit<input name="unitName" value="${masterValue(a,"unit_name") || "unit"}"/></label>
      <label data-addon-quantity-field>Quantity step<input name="quantityStep" type="number" min="1" value="${masterValue(a,"quantity_step") || 1}"/></label>
      <label data-addon-quantity-field>Minimum quantity<input name="minimumQuantity" type="number" min="1" value="${masterValue(a,"minimum_quantity") || 1}"/></label>
      <label data-addon-quantity-field>Maximum quantity<input name="maximumQuantity" type="number" min="1" value="${masterLimit(a,"maximum_quantity")}" placeholder="Unlimited"/></label>
      <label>Sort order<input name="sortOrder" type="number" value="${masterValue(a,"sort_order") || 0}"/></label>
      <label class="wa-pkg-full">Description<textarea name="description" rows="2">${masterValue(a,"description")}</textarea></label>
    </div>
    <div class="wa-master-section"><h4>Customer quantity control</h4><p class="wa-master-help">Enable this for add-ons customers can buy in multiple units, such as seats, WhatsApp numbers and integrations. Fixed add-ons are always purchased once.</p><div class="wa-master-toggles"><label class="wa-master-toggle"><input type="checkbox" name="quantityEnabled" data-addon-quantity-toggle ${a.quantity_enabled !== false ? "checked" : ""}/><span>Show quantity selector to customer</span></label></div></div>
    <div class="wa-master-section"><h4>Eligible packages</h4><div class="wa-master-toggles">${packages.map((p) => `<label class="wa-master-toggle"><input type="checkbox" name="eligible_${escapeHtml(p.code)}" ${eligible.includes(p.code) ? "checked" : ""}/><span>${escapeHtml(p.name)}</span></label>`).join("") || "<span>Create a package first.</span>"}</div></div>
    <div class="wa-master-section"><h4>Entitlement effect per unit</h4><div class="wa-master-limits"><label>Extra seats<input name="effect_team_member_limit" type="number" min="0" value="${escapeHtml(effects.team_member_limit ?? 0)}"/></label><label>Extra numbers<input name="effect_whatsapp_number_limit" type="number" min="0" value="${escapeHtml(effects.whatsapp_number_limit ?? 0)}"/></label><label>Extra integrations<input name="effect_integration_limit" type="number" min="0" value="${escapeHtml(effects.integration_limit ?? 0)}"/></label><label class="wa-master-toggle"><input name="effect_priority_support" type="checkbox" ${effects.priority_support ? "checked" : ""}/><span>Enable priority support</span></label></div></div>
    <footer><label class="wa-master-toggle"><input name="isSelfService" type="checkbox" ${a.is_self_service ? "checked" : ""}/><span>Customer can purchase</span></label><button class="wa-admin-button primary" type="submit">${isNew ? "Create add-on" : "Save master add-on"}</button></footer>
  </form>`;
}

function masterCouponForm(coupon, packages, addons) {
  const c = coupon || {};
  const isNew = !c.id;
  const packageCodes = Array.isArray(c.applies_to_package_codes) ? c.applies_to_package_codes : [];
  const addonCodes = Array.isArray(c.applies_to_addon_codes) ? c.applies_to_addon_codes : [];
  const intervals = Array.isArray(c.billing_intervals) ? c.billing_intervals : ["month", "year"];
  const percentage = c.percentage_bps == null ? "" : Number(c.percentage_bps) / 100;
  const fixedAmount = c.fixed_amount_paise == null ? "" : Number(c.fixed_amount_paise) / 100;
  const maximumDiscount = c.max_discount_paise == null ? "" : Number(c.max_discount_paise) / 100;
  const minimumSubtotal = c.minimum_subtotal_paise == null ? 0 : Number(c.minimum_subtotal_paise) / 100;
  return `<form class="wa-master-record compact" data-master-coupon-form="${escapeHtml(c.id || "")}">
    <header><div><span class="wa-admin-kicker">${isNew ? "New coupon" : `Coupon · ${escapeHtml(c.code)}`}</span><h3>${escapeHtml(c.name || "Create coupon code")}</h3><p>Discounts are validated and calculated server-side against the tax-exclusive Package Master price.</p></div><span class="wa-master-state ${escapeHtml(c.status || "draft")}">${escapeHtml(c.status || "draft")}</span></header>
    <div class="wa-pkg-grid">
      <label>Coupon code<input name="code" required minlength="3" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,39}" value="${masterValue(c,"code")}" placeholder="WELCOME20"/><small>Customer enters this code at checkout.</small></label>
      <label>Internal name<input name="name" required maxlength="120" value="${masterValue(c,"name")}" placeholder="Launch offer"/></label>
      <label>Status<select name="status">${masterOption("draft",c.status,"Draft")}${masterOption("active",c.status,"Active")}${masterOption("disabled",c.status,"Disabled")}</select></label>
      <label>Discount type<select name="discountType">${masterOption("percentage",c.discount_type || "percentage","Percentage")}${masterOption("fixed",c.discount_type,"Fixed amount")}</select></label>
      <label>Percentage discount<input name="percentage" type="number" min="0.01" max="100" step="0.01" value="${escapeHtml(percentage)}" placeholder="20"/><small>Used only for percentage coupons.</small></label>
      <label>Fixed discount — excluding GST<input name="fixedAmount" type="number" min="0.01" step="0.01" value="${escapeHtml(fixedAmount)}" placeholder="500"/><small>Used only for fixed coupons.</small></label>
      <label>Maximum discount<input name="maximumDiscount" type="number" min="0.01" step="0.01" value="${escapeHtml(maximumDiscount)}" placeholder="No cap"/></label>
      <label>Minimum base subtotal<input name="minimumSubtotal" type="number" min="0" step="0.01" value="${escapeHtml(minimumSubtotal)}"/></label>
      <label>Currency<input name="currency" maxlength="3" pattern="[A-Z]{3}" value="${masterValue(c,"currency") || "INR"}"/></label>
      <label>Valid from<input name="validFrom" type="datetime-local" value="${masterDateTime(c.valid_from || new Date())}" required/></label>
      <label>Valid until<input name="validUntil" type="datetime-local" value="${masterDateTime(c.valid_until)}"/><small>Blank means no scheduled expiry.</small></label>
      <label>Total redemption limit<input name="maximumRedemptions" type="number" min="1" value="${masterLimit(c,"maximum_redemptions")}" placeholder="Unlimited"/></label>
      <label>Limit per customer<input name="maximumRedemptionsPerTenant" type="number" min="1" value="${masterValue(c,"maximum_redemptions_per_tenant") || 1}" required/></label>
      <label>Razorpay Subscription Offer ID<input name="providerOfferId" maxlength="70" pattern="offer_[A-Za-z0-9]{6,64}" value="${masterValue(c,"provider_offer_id")}" placeholder="offer_xxxxxxxxxxxxxx"/><small>Required for first-payment-only coupons. Create a matching Single Use offer in Razorpay, then paste its ID here.</small></label>
      <label class="wa-pkg-full">Description<textarea name="description" rows="2">${masterValue(c,"description")}</textarea></label>
    </div>
    <div class="wa-master-section"><h4>Eligible billing intervals</h4><div class="wa-master-toggles"><label class="wa-master-toggle"><input type="checkbox" name="interval_month" ${intervals.includes("month") ? "checked" : ""}/><span>Monthly</span></label><label class="wa-master-toggle"><input type="checkbox" name="interval_year" ${intervals.includes("year") ? "checked" : ""}/><span>Annual</span></label><label class="wa-master-toggle"><input type="checkbox" name="firstPaymentOnly" ${c.first_payment_only ? "checked" : ""}/><span>First successful payment only</span></label></div></div>
    <div class="wa-master-section"><h4>Eligible packages</h4><p class="wa-master-help">Leave all unchecked to allow every active package.</p><div class="wa-master-toggles">${packages.map((p) => `<label class="wa-master-toggle"><input type="checkbox" name="package_${escapeHtml(p.code)}" ${packageCodes.includes(p.code) ? "checked" : ""}/><span>${escapeHtml(p.name)}</span></label>`).join("") || "<span>Create a package first.</span>"}</div></div>
    <div class="wa-master-section"><h4>Eligible add-ons</h4><p class="wa-master-help">Leave all unchecked to allow package-only checkout and every eligible add-on.</p><div class="wa-master-toggles">${addons.map((a) => `<label class="wa-master-toggle"><input type="checkbox" name="addon_${escapeHtml(a.code)}" ${addonCodes.includes(a.code) ? "checked" : ""}/><span>${escapeHtml(a.name)}</span></label>`).join("") || "<span>No add-ons configured.</span>"}</div></div>
    <footer><span>Coupon values reduce the base subtotal before GST. Redemption is recorded only by verified checkout.</span><button class="wa-admin-button primary" type="submit">${isNew ? "Create coupon" : "Save coupon"}</button></footer>
  </form>`;
}

function masterAssignments(tenants, addons, assignments) {
  const addonMap = new Map(addons.map((addon) => [addon.code, addon]));
  const assignmentRows = assignments.map((item) => {
    const addon = addonMap.get(item.addonCode);
    return `<form class="wa-master-assignment" data-master-assignment><input type="hidden" name="tenantId" value="${escapeHtml(item.tenantId)}"/><input type="hidden" name="addonCode" value="${escapeHtml(item.addonCode)}"/><div><strong>${escapeHtml(item.tenantName)}</strong><small>${escapeHtml(item.planCode)}</small></div><div><strong>${escapeHtml(addon?.name || item.addonCode)}</strong><small>${escapeHtml(item.addonCode)}</small></div><label>Quantity<input name="quantity" type="number" min="0" max="10000" value="${Number(item.quantity || 0)}"/></label><label>Status<select name="status">${masterOption("active",item.status,"Active")}${masterOption("pending",item.status,"Pending")}${masterOption("paused",item.status,"Paused")}${masterOption("cancelled",item.status,"Cancelled")}</select></label><button class="wa-admin-button" type="submit">Update</button></form>`;
  }).join("");
  const tenantOptions = tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)} · ${escapeHtml(tenant.planCode)}</option>`).join("");
  const addonOptions = addons.filter((addon) => addon.status === "active").map((addon) => `<option value="${escapeHtml(addon.code)}">${escapeHtml(addon.name)}</option>`).join("");
  return `<section class="wa-master-stack"><div class="wa-master-heading"><div><h3>Customer add-on assignments</h3><p>This ledger is the billing and entitlement source used by customer workspaces.</p></div></div><div class="wa-master-assignment-list">${assignmentRows || '<div class="wa-admin-empty">No customer add-ons assigned.</div>'}</div>${state.canManage ? `<form class="wa-master-assignment create" data-master-assignment><div><strong>Assign an add-on</strong><small>Eligibility is checked against the customer package.</small></div><label>Customer<select name="tenantId" required><option value="">Select customer</option>${tenantOptions}</select></label><label>Add-on<select name="addonCode" required><option value="">Select add-on</option>${addonOptions}</select></label><label>Quantity<input name="quantity" type="number" min="1" max="10000" value="1" required/></label><label>Status<select name="status"><option value="active">Active</option><option value="pending">Pending</option></select></label><button class="wa-admin-button primary" type="submit">Assign add-on</button></form>` : ""}</section>`;
}

function masterCurrency(amount, currency = "INR") {
  const value = Number(amount || 0);
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: String(currency || "INR").toUpperCase(), maximumFractionDigits: 2 }).format(value); }
  catch { return `${escapeHtml(currency || "INR")} ${value.toFixed(2)}`; }
}

function masterModal(kind, id, title, subtitle, form) {
  const key = `${kind}:${id || "new"}`;
  return `<section class="wa-master-modal" data-master-modal="${escapeHtml(key)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" hidden>
    <div class="wa-master-modal-shell">
      <header class="wa-master-modal-head"><div><span>${escapeHtml(subtitle)}</span><strong>${escapeHtml(title)}</strong></div><button type="button" data-master-modal-close aria-label="Close editor">&times;</button></header>
      <main>${form}</main>
    </div>
  </section>`;
}

function masterPackageCard(pkg) {
  const p = pkg || {};
  const activeFeatures = Object.values(p.entitlements || {}).filter(Boolean).length;
  const limits = [p.team_member_limit, p.whatsapp_number_limit, p.contact_limit, p.monthly_message_limit].filter((value) => value != null).length;
  return `<button class="wa-master-card package" type="button" data-master-open="package:${escapeHtml(p.id)}">
    <span class="wa-master-card-top"><span class="wa-master-card-icon">${escapeHtml(String(p.name || p.code || "P").slice(0, 2).toUpperCase())}</span><span class="wa-master-state ${escapeHtml(p.status || "draft")}">${escapeHtml(p.status || "draft")}</span></span>
    <span class="wa-master-card-copy"><small>Package · ${escapeHtml(p.code)}</small><strong>${escapeHtml(p.name)}</strong><em>${escapeHtml(p.description || "No internal description")}</em></span>
    <span class="wa-master-card-price"><strong>${masterCurrency(p.monthly_amount, p.currency)}</strong><small>/ month + GST</small></span>
    <span class="wa-master-card-meta"><span>${Number(p.trial_days || 0)}-day trial</span><span>${limits} metered limits</span><span>${activeFeatures} features</span></span>
    <span class="wa-master-card-action">Open package editor <b aria-hidden="true">&rarr;</b></span>
  </button>`;
}

function masterAddonCard(addon) {
  const a = addon || {};
  const eligible = Array.isArray(a.eligible_plan_codes) ? a.eligible_plan_codes.length : 0;
  return `<button class="wa-master-card addon" type="button" data-master-open="addon:${escapeHtml(a.id)}">
    <span class="wa-master-card-top"><span class="wa-master-card-icon">${escapeHtml(String(a.name || a.code || "A").slice(0, 2).toUpperCase())}</span><span class="wa-master-state ${escapeHtml(a.status || "draft")}">${escapeHtml(a.status || "draft")}</span></span>
    <span class="wa-master-card-copy"><small>Add-on · ${escapeHtml(a.code)}</small><strong>${escapeHtml(a.name)}</strong><em>${escapeHtml(a.description || "No description")}</em></span>
    <span class="wa-master-card-price"><strong>${masterCurrency(a.unit_amount, a.currency)}</strong><small>/ ${escapeHtml(a.unit_name || "unit")} · ${escapeHtml(a.billing_interval || "custom")}</small></span>
    <span class="wa-master-card-meta"><span>${eligible || "All"} eligible package${eligible === 1 ? "" : "s"}</span><span>${a.is_self_service ? "Self-service" : "Admin assigned"}</span><span>${a.quantity_enabled === false ? "Single purchase" : "Customer quantity"}</span></span>
    <span class="wa-master-card-action">Open add-on editor <b aria-hidden="true">&rarr;</b></span>
  </button>`;
}

function masterCouponCard(coupon) {
  const c = coupon || {};
  const discount = c.discount_type === "fixed" ? masterCurrency(Number(c.fixed_amount_paise || 0) / 100, c.currency) : `${Number(c.percentage_bps || 0) / 100}%`;
  return `<button class="wa-master-card coupon" type="button" data-master-open="coupon:${escapeHtml(c.id)}">
    <span class="wa-master-card-top"><span class="wa-master-card-icon">%</span><span class="wa-master-state ${escapeHtml(c.status || "draft")}">${escapeHtml(c.status || "draft")}</span></span>
    <span class="wa-master-card-copy"><small>Coupon · ${escapeHtml(c.code)}</small><strong>${escapeHtml(c.name)}</strong><em>${escapeHtml(c.description || "Controlled checkout discount")}</em></span>
    <span class="wa-master-card-price"><strong>${escapeHtml(discount)}</strong><small>${c.first_payment_only ? "first payment only" : "eligible payments"}</small></span>
    <span class="wa-master-card-meta"><span>${Number(c.redemption_count || 0)} redeemed</span><span>${c.valid_until ? `Ends ${escapeHtml(formatDate(c.valid_until))}` : "No expiry"}</span></span>
    <span class="wa-master-card-action">Open coupon editor <b aria-hidden="true">&rarr;</b></span>
  </button>`;
}

function masterCreateCard(kind, title, copy) {
  return `<button class="wa-master-card create" type="button" data-master-open="${escapeHtml(kind)}:new"><span class="wa-master-create-icon">+</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small><span class="wa-master-card-action">Open new record <b aria-hidden="true">&rarr;</b></span></button>`;
}

function masterDirectory(title, description, kind, records, cardRenderer, formRenderer, createTitle, createCopy) {
  const cards = records.map(cardRenderer).join("");
  const modals = records.map((record) => masterModal(kind, record.id, record.name || record.code, `Edit ${kind}`, formRenderer(record))).join("");
  const create = state.canManage ? masterCreateCard(kind, createTitle, createCopy) : "";
  const createModal = state.canManage ? masterModal(kind, "new", createTitle, `New ${kind}`, formRenderer(null)) : "";
  return `<section class="wa-master-stack"><div class="wa-master-heading"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><span>${records.length} record${records.length === 1 ? "" : "s"}</span></div><div class="wa-master-card-grid">${cards}${create || (!records.length ? '<div class="wa-admin-empty">No records configured.</div>' : "")}</div>${modals}${createModal}</section>`;
}

function packageMaster() {
  if (!state.packageMaster && !state.packageMasterError) { if (!state.packageMasterLoading) loadPackageMaster(); return '<div class="wa-admin-empty">Loading Package Master…</div>'; }
  if (state.packageMasterError) return `<div class="wa-admin-notice"><strong>Package Master is not active yet.</strong><br>${escapeHtml(state.packageMasterError)}</div>`;
  const packages = state.packageMaster?.packages || [];
  const addons = state.packageMaster?.addons || [];
  const coupons = state.packageMaster?.coupons || [];
  const tenants = state.packageMaster?.tenants || [];
  const assignments = state.packageMaster?.assignments || [];
  const active = packages.filter((item) => item.status === "active").length;
  return `<section class="wa-master-intro"><div><span class="wa-admin-kicker">Central source of truth</span><h3>Package Master</h3><p>Customer portal access and billing are resolved from these operational records. Public Packages &amp; Offers are maintained separately.</p></div><div class="wa-master-summary"><span><strong>${packages.length}</strong> packages</span><span><strong>${active}</strong> active</span><span><strong>${addons.length}</strong> add-ons</span><span><strong>${coupons.length}</strong> coupons</span></div></section>
    ${!state.canManage ? '<div class="wa-admin-notice">You have view-only access to Package Master.</div>' : ""}
    ${masterDirectory("Customer packages","Entitlements, hard limits, trials and authoritative subscription prices.","package",packages,masterPackageCard,masterPackageForm,"Add package","Create a new operational package and its financial source of truth.")}
    ${masterDirectory("Add-on master","Billable capacity and feature extensions eligible for each package.","addon",addons,masterAddonCard,(addon) => masterAddonForm(addon,packages),"Add add-on","Create recurring, one-time or usage-based capacity.")}
    ${masterDirectory("Coupon codes","Controlled discounts with server-enforced eligibility and redemption limits.","coupon",coupons,masterCouponCard,(coupon) => masterCouponForm(coupon,packages,addons),"Add coupon","Create a customer checkout discount code.")}${masterAssignments(tenants,addons,assignments)}`;
}

function nullableNumber(formData, name) {
  const raw = String(formData.get(name) ?? "").trim();
  return raw === "" ? "" : Number(raw);
}

async function saveMasterPackage(event, form) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  if (!form.reportValidity()) return;
  button.disabled = true;
  const values = new FormData(form);
  const entitlements = {};
  ["team_inbox","contacts","templates","campaigns","flows","automations","api_access","priority_support"].forEach((key) => { entitlements[key] = values.get(`access_${key}`) === "on"; });
  const payload = {
    code: values.get("code"), name: values.get("name"), description: values.get("description"), status: values.get("status"),
    billingModel: values.get("billingModel"), currency: String(values.get("currency") || "INR").toUpperCase(),
    monthlyAmount: Number(values.get("monthlyAmount") || 0), annualAmount: Number(values.get("annualAmount") || 0), trialDays: Number(values.get("trialDays") || 0),
    teamMemberLimit: nullableNumber(values,"teamMemberLimit"), whatsappNumberLimit: nullableNumber(values,"whatsappNumberLimit"), contactLimit: nullableNumber(values,"contactLimit"),
    monthlyMessageLimit: nullableNumber(values,"monthlyMessageLimit"), templateLimit: nullableNumber(values,"templateLimit"), flowLimit: nullableNumber(values,"flowLimit"),
    campaignLimit: nullableNumber(values,"campaignLimit"), automationLimit: nullableNumber(values,"automationLimit"), integrationLimit: nullableNumber(values,"integrationLimit"),
    storageLimitMb: nullableNumber(values,"storageLimitMb"), entitlements, sortOrder: Number(values.get("sortOrder") || 0),
  };
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_save_master_package", { p_id: form.dataset.masterPackageForm || null, p_payload: payload });
    if (error) throw error;
    showToast("Package Master updated. Financial price revisions and renewal notices were created where required.", TOAST_TYPES.SUCCESS);
    state.packageMaster = null; await loadPackageMaster();
  } catch (error) { showToast(error?.message || "Could not save master package.", TOAST_TYPES.ERROR); button.disabled = false; }
}

async function saveMasterAddon(event, form) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  if (!form.reportValidity()) return;
  button.disabled = true;
  const values = new FormData(form);
  const packages = state.packageMaster?.packages || [];
  const eligiblePlanCodes = packages.filter((p) => values.get(`eligible_${p.code}`) === "on").map((p) => p.code);
  const entitlementEffects = {};
  [["team_member_limit","effect_team_member_limit"],["whatsapp_number_limit","effect_whatsapp_number_limit"],["integration_limit","effect_integration_limit"]].forEach(([key,name]) => { const number = Number(values.get(name) || 0); if (number) entitlementEffects[key] = number; });
  if (values.get("effect_priority_support") === "on") entitlementEffects.priority_support = true;
  const quantityEnabled = values.get("quantityEnabled") === "on";
  const payload = {
    code: values.get("code"), name: values.get("name"), description: values.get("description"), status: values.get("status"), billingModel: values.get("billingModel"),
    billingInterval: values.get("billingInterval"), currency: String(values.get("currency") || "INR").toUpperCase(), unitAmount: Number(values.get("unitAmount") || 0),
    unitName: values.get("unitName"), quantityEnabled, minimumQuantity: quantityEnabled ? Number(values.get("minimumQuantity") || 1) : 1, maximumQuantity: quantityEnabled ? nullableNumber(values,"maximumQuantity") : 1, quantityStep: quantityEnabled ? Number(values.get("quantityStep") || 1) : 1,
    eligiblePlanCodes, entitlementEffects, isSelfService: values.get("isSelfService") === "on", sortOrder: Number(values.get("sortOrder") || 0),
  };
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_save_master_addon", { p_id: form.dataset.masterAddonForm || null, p_payload: payload });
    if (error) throw error;
    showToast("Add-on Master updated. The tax-exclusive price revision is now authoritative.", TOAST_TYPES.SUCCESS);
    state.packageMaster = null; await loadPackageMaster();
  } catch (error) { showToast(error?.message || "Could not save master add-on.", TOAST_TYPES.ERROR); button.disabled = false; }
}

function bindMasterAddonQuantityControl(form) {
  const toggle = form.querySelector("[data-addon-quantity-toggle]");
  if (!toggle) return;
  const sync = () => form.querySelectorAll("[data-addon-quantity-field]").forEach((field) => {
    field.hidden = !toggle.checked;
    field.querySelectorAll("input").forEach((input) => { input.disabled = !toggle.checked; });
  });
  toggle.addEventListener("change", sync);
  sync();
}

async function saveMasterCoupon(event, form) {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const values = new FormData(form);
  const packages = state.packageMaster?.packages || [];
  const addons = state.packageMaster?.addons || [];
  const payload = {
    code: String(values.get("code") || "").trim().toUpperCase(), name: values.get("name"), description: values.get("description"), status: values.get("status"),
    discountType: values.get("discountType"), percentage: values.get("percentage"), fixedAmount: values.get("fixedAmount"), maximumDiscount: values.get("maximumDiscount"),
    minimumSubtotal: Number(values.get("minimumSubtotal") || 0), currency: String(values.get("currency") || "INR").toUpperCase(),
    validFrom: values.get("validFrom") ? new Date(String(values.get("validFrom"))).toISOString() : new Date().toISOString(),
    validUntil: values.get("validUntil") ? new Date(String(values.get("validUntil"))).toISOString() : "",
    maximumRedemptions: values.get("maximumRedemptions"), maximumRedemptionsPerTenant: Number(values.get("maximumRedemptionsPerTenant") || 1),
    firstPaymentOnly: values.get("firstPaymentOnly") === "on",
    providerOfferId: String(values.get("providerOfferId") || "").trim(),
    billingIntervals: ["month", "year"].filter((interval) => values.get(`interval_${interval}`) === "on"),
    packageCodes: packages.filter((item) => values.get(`package_${item.code}`) === "on").map((item) => item.code),
    addonCodes: addons.filter((item) => values.get(`addon_${item.code}`) === "on").map((item) => item.code),
  };
  if (!payload.billingIntervals.length) { showToast("Select at least one billing interval.", TOAST_TYPES.ERROR); button.disabled = false; return; }
  if (payload.discountType === "percentage" && !(Number(payload.percentage) > 0)) { showToast("Enter the percentage discount.", TOAST_TYPES.ERROR); button.disabled = false; return; }
  if (payload.discountType === "fixed" && !(Number(payload.fixedAmount) > 0)) { showToast("Enter the fixed discount amount.", TOAST_TYPES.ERROR); button.disabled = false; return; }
  if (payload.firstPaymentOnly && !/^offer_[A-Za-z0-9]{6,64}$/.test(payload.providerOfferId)) { showToast("First-payment-only coupons require the matching Razorpay single-use Subscription Offer ID.", TOAST_TYPES.ERROR); button.disabled = false; return; }
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_save_billing_coupon", { p_id: form.dataset.masterCouponForm || null, p_payload: payload });
    if (error) throw error;
    showToast("Coupon saved. Checkout will validate its dates, eligibility and redemption limits server-side.", TOAST_TYPES.SUCCESS);
    state.packageMaster = null; await loadPackageMaster();
  } catch (error) { showToast(error?.message || "Could not save coupon.", TOAST_TYPES.ERROR); button.disabled = false; }
}

async function saveMasterAssignment(event, form) {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const values = new FormData(form);
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_set_tenant_addon", { p_tenant_id: values.get("tenantId"), p_addon_code: values.get("addonCode"), p_quantity: Number(values.get("quantity") || 0), p_status: values.get("status") || "active" });
    if (error) throw error;
    showToast("Customer add-on assignment updated.", TOAST_TYPES.SUCCESS);
    state.packageMaster = null; await loadPackageMaster(); await loadSnapshot();
  } catch (error) { showToast(error?.message || "Could not update customer add-on.", TOAST_TYPES.ERROR); button.disabled = false; }
}

async function loadCatalog() {
  state.catalogLoading = true;
  const { data, error } = await db.rpc("whatsapp_platform_admin_catalog");
  state.catalogLoading = false;
  if (error) { state.catalogError = error.message || "Could not load packages."; state.catalog = null; }
  else { state.catalog = data || { plans: [], addons: [], rates: {} }; state.catalogError = ""; }
  render();
}

function planForm(plan) {
  const p = plan || {};
  const val = (k) => escapeHtml(p[k] ?? "");
  const feat = Array.isArray(p.features) ? p.features.join("\n") : "";
  const isNew = !p.id;
  return `<form class="wa-pkg-form" data-plan-form="${escapeHtml(p.id || "")}">
    <div class="wa-pkg-head"><strong>${isNew ? "➕ Add a new plan" : escapeHtml(p.label || p.code)}</strong>${isNew ? "" : `<button type="button" class="wa-pkg-del" data-plan-delete="${escapeHtml(p.id)}">Delete</button>`}</div>
    <div class="wa-pkg-grid">
      <label>Label<input name="label" value="${val("label")}" placeholder="Growth" /></label>
      <label>Code<input name="code" value="${val("code")}" placeholder="growth" /></label>
      <label>Heading<input name="name" value="${val("name")}" placeholder="For scaling customer teams" /></label>
      <label>Badge<input name="badge" value="${val("badge")}" placeholder="Most popular" /></label>
      <label>Price / month (₹)<input name="price_monthly" type="number" step="1" value="${escapeHtml(p.priceMonthly ?? 0)}" /></label>
      <label>Price / month ($)<input name="price_monthly_usd" type="number" step="0.01" value="${escapeHtml(p.priceMonthlyUsd ?? 0)}" /></label>
      <label>Price prefix<input name="price_prefix" value="${val("pricePrefix")}" placeholder="from " /></label>
      <label>Price suffix<input name="price_suffix" value="${escapeHtml(p.priceSuffix ?? "/mo")}" /></label>
      <label>Annual note<input name="annual_note" value="${val("annualNote")}" /></label>
      <label>Sort order<input name="sort_order" type="number" value="${escapeHtml(p.sortOrder ?? 0)}" /></label>
      <label>CTA label<input name="cta_label" value="${val("ctaLabel")}" /></label>
      <label>CTA link<input name="cta_href" value="${val("ctaHref")}" /></label>
    </div>
    <label class="wa-pkg-full">Tagline<textarea name="tagline" rows="2">${val("tagline")}</textarea></label>
    <label class="wa-pkg-full">Features (one per line)<textarea name="features" rows="6">${escapeHtml(feat)}</textarea></label>
    <div class="wa-pkg-foot">
      <label class="wa-pkg-check"><input type="checkbox" name="is_featured" ${p.isFeatured ? "checked" : ""} /> Featured</label>
      <label class="wa-pkg-check"><input type="checkbox" name="is_active" ${p.isActive === false ? "" : "checked"} /> Active</label>
      <button type="submit" class="wa-admin-button primary">${isNew ? "Add plan" : "Save"}</button>
    </div>
  </form>`;
}

function addonForm(addon) {
  const a = addon || {};
  const val = (k) => escapeHtml(a[k] ?? "");
  const isNew = !a.id;
  return `<form class="wa-pkg-form" data-addon-form="${escapeHtml(a.id || "")}">
    <div class="wa-pkg-head"><strong>${isNew ? "➕ Add a new add-on" : escapeHtml(a.name)}</strong>${isNew ? "" : `<button type="button" class="wa-pkg-del" data-addon-delete="${escapeHtml(a.id)}">Delete</button>`}</div>
    <div class="wa-pkg-grid">
      <label>Name<input name="name" value="${val("name")}" /></label>
      <label>Short description<input name="description" value="${val("description")}" /></label>
      <label>Price display<input name="price_display" value="${val("priceDisplay")}" placeholder="₹400" /></label>
      <label>Price unit<input name="price_unit" value="${val("priceUnit")}" placeholder="/number/mo" /></label>
      <label>Sort order<input name="sort_order" type="number" value="${escapeHtml(a.sortOrder ?? 0)}" /></label>
    </div>
    <label class="wa-pkg-full">Tooltip (the “i” explanation)<textarea name="tooltip" rows="3">${val("tooltip")}</textarea></label>
    <div class="wa-pkg-foot">
      <label class="wa-pkg-check"><input type="checkbox" name="is_active" ${a.isActive === false ? "" : "checked"} /> Active</label>
      <button type="submit" class="wa-admin-button primary">${isNew ? "Add add-on" : "Save"}</button>
    </div>
  </form>`;
}

function ratesForm(rates) {
  const inr = (rates && rates.INR) || {};
  const usd = (rates && rates.USD) || {};
  const n = (v) => escapeHtml(v ?? 0);
  return `<section class="wa-admin-card"><h3>Calculator rates</h3><p>Per-message rates the customer pays you — used by the public pricing calculator. Service / user-initiated messages are always free.</p>
    <form data-rates-form>
      <div class="wa-pkg-grid">
        <label>Marketing (₹)<input name="inr_marketing" type="number" step="0.01" value="${n(inr.marketing)}" /></label>
        <label>Utility (₹)<input name="inr_utility" type="number" step="0.01" value="${n(inr.utility)}" /></label>
        <label>Authentication (₹)<input name="inr_authentication" type="number" step="0.01" value="${n(inr.authentication)}" /></label>
        <label>Marketing ($)<input name="usd_marketing" type="number" step="0.0001" value="${n(usd.marketing)}" /></label>
        <label>Utility ($)<input name="usd_utility" type="number" step="0.0001" value="${n(usd.utility)}" /></label>
        <label>Authentication ($)<input name="usd_authentication" type="number" step="0.0001" value="${n(usd.authentication)}" /></label>
      </div>
      <div class="wa-pkg-foot"><button type="submit" class="wa-admin-button primary">Save rates</button></div>
    </form>
  </section>`;
}

function packages() {
  if (!state.canManage) return '<section class="wa-admin-card"><h3>Packages &amp; Offers</h3><div class="wa-admin-empty">You have view-only access. A manage permission is required to edit packages and pricing.</div></section>';
  if (!state.catalog && !state.catalogError) { if (!state.catalogLoading) loadCatalog(); return '<div class="wa-admin-empty">Loading packages…</div>'; }
  if (state.catalogError) return `<div class="wa-admin-notice"><strong>Packages data is not active yet.</strong><br>${escapeHtml(state.catalogError)}<br><br>Apply the pending WhatsApp Platform packages migration to activate management.</div>`;
  const plans = state.catalog.plans || [];
  const addons = state.catalog.addons || [];
  return `<section class="wa-admin-notice"><strong>Public website content only.</strong><br>Changes here control public pricing cards and calculator presentation. Customer access, limits and billing are controlled exclusively in Package Master.</section><section class="wa-admin-card"><h3>Plans</h3><p>These render on the public pricing page. Price is monthly; the calculator uses each plan's monthly price as the subscription line.</p><div class="wa-pkg-list">${plans.map(planForm).join("")}${planForm(null)}</div></section>
    <section class="wa-admin-card"><h3>Add-ons</h3><p>Shown in the “Extend any plan” grid, each with an info tooltip. Price display is free text (e.g. ₹400) plus a unit (e.g. /number/mo or one-time).</p><div class="wa-pkg-list">${addons.map(addonForm).join("")}${addonForm(null)}</div></section>
    ${ratesForm(state.catalog.rates || {})}`;
}

async function savePlan(event, form) {
  event.preventDefault();
  const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
  const v = new FormData(form);
  const features = String(v.get("features") || "").split("\n").map((s) => s.trim()).filter(Boolean);
  try {
    const { data: planId, error } = await db.rpc("whatsapp_platform_admin_upsert_plan", {
      p_id: form.dataset.planForm || null,
      p_code: v.get("code"), p_label: v.get("label"), p_name: v.get("name"), p_tagline: v.get("tagline"),
      p_price_monthly: Number(v.get("price_monthly") || 0), p_price_monthly_usd: Number(v.get("price_monthly_usd") || 0),
      p_price_prefix: v.get("price_prefix"), p_price_suffix: v.get("price_suffix"),
      p_annual_note: v.get("annual_note"), p_badge: v.get("badge"),
      p_cta_label: v.get("cta_label"), p_cta_href: v.get("cta_href"),
      p_features: features, p_is_featured: v.get("is_featured") === "on",
      p_is_active: v.get("is_active") === "on", p_sort_order: Number(v.get("sort_order") || 0)
    });
    if (error) throw error;
    showToast("Plan saved.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not save plan.", TOAST_TYPES.ERROR); btn.disabled = false; }
}

async function deletePlan(id) {
  if (!id || !window.confirm("Delete this plan? This cannot be undone.")) return;
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_delete_plan", { p_id: id });
    if (error) throw error;
    showToast("Plan deleted.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not delete plan.", TOAST_TYPES.ERROR); }
}

async function saveAddon(event, form) {
  event.preventDefault();
  const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
  const v = new FormData(form);
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_upsert_addon", {
      p_id: form.dataset.addonForm || null,
      p_name: v.get("name"), p_description: v.get("description"), p_tooltip: v.get("tooltip"),
      p_price_display: v.get("price_display"), p_price_unit: v.get("price_unit"),
      p_is_active: v.get("is_active") === "on", p_sort_order: Number(v.get("sort_order") || 0)
    });
    if (error) throw error;
    showToast("Add-on saved.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not save add-on.", TOAST_TYPES.ERROR); btn.disabled = false; }
}

async function deleteAddon(id) {
  if (!id || !window.confirm("Delete this add-on? This cannot be undone.")) return;
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_delete_addon", { p_id: id });
    if (error) throw error;
    showToast("Add-on deleted.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not delete add-on.", TOAST_TYPES.ERROR); }
}

async function saveRates(event) {
  event.preventDefault();
  const form = event.currentTarget; const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
  const v = new FormData(form);
  const num = (k) => Number(v.get(k) || 0);
  const rates = {
    INR: { marketing: num("inr_marketing"), utility: num("inr_utility"), authentication: num("inr_authentication"), service: 0 },
    USD: { marketing: num("usd_marketing"), utility: num("usd_utility"), authentication: num("usd_authentication"), service: 0 }
  };
  try {
    const { error } = await db.rpc("whatsapp_platform_admin_save_rates", { p_rates: rates });
    if (error) throw error;
    showToast("Calculator rates saved.", TOAST_TYPES.SUCCESS);
    state.catalog = null; await loadCatalog();
  } catch (error) { showToast(error?.message || "Could not save rates.", TOAST_TYPES.ERROR); btn.disabled = false; }
}

function content() {
  if (state.view === "package-master") return packageMaster();
  if (state.view === "packages") return packages();
  if (state.view === "billing") return billingOverview();
  if (state.view === "subscriptions") return billingSubscriptionsPage();
  if (state.view === "payments") return billingPaymentsPage();
  if (state.view === "invoices") return billingInvoicesPage();
  if (state.view === "refunds") return billingRefundsPage();
  if (state.view === "credit-notes") return billingCreditNotesPage();
  if (state.view === "reconciliation") return billingReconciliationPage();
  if (state.view === "razorpay") return razorpaySetup();
  if (state.loading) return '<div class="wa-admin-empty">Loading platform operations…</div>';
  if (state.error) return `<div class="wa-admin-notice"><strong>Management data is not active yet.</strong><br>${escapeHtml(state.error)}<br><br>The internal console is ready; apply the pending WhatsApp Platform database migrations to activate live customer data.</div>${state.view === "meta" ? metaSetup() : state.view === "security" ? security() : overview()}`;
  if (state.view === "customers") return customers();
  if (state.view === "verification") return verification();
  if (state.view === "connections") return connections();
  if (state.view === "meta") return metaSetup();
  if (state.view === "security") return security();
  return overview();
}

function render() {
  document.querySelectorAll("body > [data-document-review-modal],body > [data-document-request-modal],body > [data-verification-case-modal],body > [data-master-modal],body > [data-finance-refund-modal],body > [data-customer-modal]").forEach((modal) => modal.remove());
  if (verificationPreviewUrl) URL.revokeObjectURL(verificationPreviewUrl);
  verificationPreviewUrl = "";
  document.body.classList.remove("wa-document-review-open", "wa-verification-case-open", "wa-master-modal-open", "wa-finance-modal-open", "wa-customer-modal-open");
  const meta = VIEW_META[state.view] || VIEW_META.overview;
  const pageHead = document.querySelector(".page-head");
  if (pageHead) {
    const title = pageHead.querySelector("h1");
    const description = pageHead.querySelector("p");
    const scope = pageHead.querySelector(".meta-pill");
    if (title) title.textContent = meta.title;
    if (description) description.textContent = meta.description;
    if (scope) scope.textContent = `WhatsApp Business Platform · ${meta.section}`;
  }
  document.title = `${meta.title} | WhatsApp Business Platform | Varada Nexus`;
  renderModuleContent(`<div class="wa-admin-shell" data-admin-view="${escapeHtml(state.view)}"><section class="wa-admin-commandbar"><div class="wa-admin-command-context"><span class="wa-admin-command-marker" aria-hidden="true">${escapeHtml(meta.marker)}</span><div><span class="wa-admin-kicker">${escapeHtml(meta.section)}</span><strong>${escapeHtml(meta.title)}</strong></div></div><div class="wa-admin-actions"><a class="wa-admin-button" href="${ROUTES.WHATSAPP_PLATFORM_PORTAL}" target="_blank" rel="noopener">View public portal</a><button class="wa-admin-button primary" id="waRefresh" type="button">Refresh data</button></div></section><main class="wa-admin-view" id="waAdminContent">${content()}</main></div>`);
  bind();
}

function bind() {
  document.querySelectorAll("#waAdminContent [data-customer-modal]").forEach((modal) => document.body.appendChild(modal));
  document.querySelectorAll("#waAdminContent [data-verification-case-modal]").forEach((modal) => document.body.appendChild(modal));
  document.querySelectorAll("#waAdminContent [data-master-modal]").forEach((modal) => document.body.appendChild(modal));
  const reviewModal = document.querySelector("#waAdminContent [data-document-review-modal]");
  if (reviewModal) document.body.appendChild(reviewModal);
  const requestModal = document.querySelector("#waAdminContent [data-document-request-modal]");
  if (requestModal) document.body.appendChild(requestModal);
  const refundModal = document.querySelector("#waAdminContent [data-finance-refund-modal]");
  if (refundModal) document.body.appendChild(refundModal);
  document.querySelector("#waRefresh")?.addEventListener("click", () => BILLING_VIEWS.has(state.view) ? loadBillingSnapshot() : loadSnapshot());
  const closeCustomerModal = (modal) => {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("wa-customer-modal-open");
  };
  document.querySelectorAll("[data-open-customer]").forEach((button) => button.addEventListener("click", () => {
    const modal = [...document.querySelectorAll("[data-customer-modal]")].find((item) => item.dataset.customerModal === button.dataset.openCustomer);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("wa-customer-modal-open");
    modal.querySelector("button, input, select")?.focus();
  }));
  document.querySelectorAll("[data-customer-modal-close]").forEach((button) => button.addEventListener("click", () => closeCustomerModal(button.closest("[data-customer-modal]"))));
  document.querySelectorAll("[data-customer-modal]").forEach((modal) => {
    modal.addEventListener("click", (event) => { if (event.target === modal) closeCustomerModal(modal); });
    modal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCustomerModal(modal); });
  });
  document.querySelectorAll("[data-customer-delete-open]").forEach((button) => button.addEventListener("click", () => {
    const modal = button.closest("[data-customer-modal]");
    const form = modal?.querySelector(`[data-customer-delete-form="${CSS.escape(button.dataset.customerDeleteOpen)}"]`);
    if (!form) return;
    form.hidden = false;
    button.hidden = true;
    form.elements.requestedBy?.focus();
  }));
  document.querySelectorAll("[data-customer-delete-cancel]").forEach((button) => button.addEventListener("click", () => {
    const form = button.closest("[data-customer-delete-form]");
    const modal = button.closest("[data-customer-modal]");
    const opener = modal?.querySelector(`[data-customer-delete-open="${CSS.escape(form?.dataset.customerDeleteForm || "")}"]`);
    if (!form) return;
    form.reset();
    form.hidden = true;
    if (opener) { opener.hidden = false; opener.focus(); }
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
  }));
  document.querySelectorAll("[data-customer-delete-form]").forEach((form) => {
    const input = form.elements.confirmationName;
    const requestedBy = form.elements.requestedBy;
    const internalNote = form.elements.internalNote;
    const check = form.elements.confirmed;
    const photo = form.elements.evidencePhoto;
    const locationStatus = form.querySelector("[data-delete-location-status]");
    const button = form.querySelector('button[type="submit"]');
    const validate = () => { button.disabled = input.value !== form.dataset.customerName || requestedBy.value.trim().length < 2 || internalNote.value.trim().length < 10 || !photo.files?.[0] || !form.elements.latitude.value || !form.elements.longitude.value || !check.checked; };
    input.addEventListener("input", validate);
    requestedBy.addEventListener("input", validate);
    internalNote.addEventListener("input", validate);
    photo.addEventListener("change", validate);
    check.addEventListener("change", validate);
    form.querySelector("[data-capture-delete-location]")?.addEventListener("click", () => {
      if (!navigator.geolocation) { showToast("Location capture is not available on this device.", TOAST_TYPES.ERROR); return; }
      locationStatus.textContent = "Requesting consent and location…";
      navigator.geolocation.getCurrentPosition((position) => {
        form.elements.latitude.value = String(position.coords.latitude);
        form.elements.longitude.value = String(position.coords.longitude);
        form.elements.locationAccuracy.value = String(position.coords.accuracy || "");
        form.elements.locationCapturedAt.value = new Date(position.timestamp || Date.now()).toISOString();
        locationStatus.textContent = `Captured to ±${Math.round(position.coords.accuracy || 0)} m`;
        validate();
      }, (error) => { locationStatus.textContent = "Location permission was not granted"; showToast(error.message || "Location could not be captured.", TOAST_TYPES.ERROR); validate(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); validate(); if (button.disabled) return;
      button.disabled = true; button.textContent = "Archiving evidence…";
      try {
        const evidenceFile = photo.files[0];
        const result = await providerSecretRequest("schedule_tenant_deletion", { tenantId: form.dataset.customerDeleteForm, confirmationName: input.value, requestedBy: requestedBy.value.trim(), internalNote: internalNote.value.trim(), confirmed: true, evidenceConsent: true, photo: { fileName: evidenceFile.name, mimeType: evidenceFile.type, base64: await fileAsBase64(evidenceFile) }, location: { latitude: Number(form.elements.latitude.value), longitude: Number(form.elements.longitude.value), accuracy: Number(form.elements.locationAccuracy.value || 0), capturedAt: form.elements.locationCapturedAt.value } });
        closeCustomerModal(form.closest("[data-customer-modal]"));
        showToast(`Deletion scheduled. It can be reversed until ${formatDate(result.reversibleUntil)}.`, TOAST_TYPES.SUCCESS);
        state.packageMaster = null;
        await loadSnapshot();
      } catch (error) {
        showToast(error?.message || "Customer account could not be deleted.", TOAST_TYPES.ERROR);
        button.textContent = "Schedule deletion"; validate();
      }
    });
  });
  const closeMasterModal = (modal) => {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("wa-master-modal-open");
  };
  document.querySelectorAll("[data-master-open]").forEach((button) => button.addEventListener("click", () => {
    const modal = [...document.querySelectorAll("[data-master-modal]")].find((item) => item.dataset.masterModal === button.dataset.masterOpen);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("wa-master-modal-open");
    modal.querySelector("input:not([type=hidden]), select, textarea, button")?.focus();
  }));
  document.querySelectorAll("[data-master-modal-close]").forEach((button) => button.addEventListener("click", () => closeMasterModal(button.closest("[data-master-modal]"))));
  document.querySelectorAll("[data-master-modal]").forEach((modal) => {
    modal.addEventListener("click", (event) => { if (event.target === modal) closeMasterModal(modal); });
    modal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMasterModal(modal); });
  });
  const closeRefundModal = () => {
    const modal = document.querySelector("[data-finance-refund-modal]");
    if (modal) modal.hidden = true;
    document.body.classList.remove("wa-finance-modal-open");
  };
  document.querySelectorAll("[data-billing-refund-open]").forEach((button) => button.addEventListener("click", () => {
    const modal = document.querySelector("[data-finance-refund-modal]");
    const form = modal?.querySelector("[data-finance-refund-form]");
    if (!modal || !form) return;
    const balance = Number(button.dataset.refundBalance || 0);
    form.reset();
    form.elements.paymentId.value = button.dataset.billingRefundOpen || "";
    form.elements.maxPaise.value = String(balance);
    form.elements.amount.value = (balance / 100).toFixed(2);
    form.elements.amount.max = (balance / 100).toFixed(2);
    modal.querySelector("[data-refund-summary]").textContent = `${button.dataset.refundWorkspace || "Customer"} · ${button.dataset.refundPayment || "Payment"}`;
    modal.querySelector("[data-refund-balance-label]").textContent = adminBillingMoney(balance, button.dataset.refundCurrency || "INR");
    modal.hidden = false;
    document.body.classList.add("wa-finance-modal-open");
    form.elements.amount.focus(); form.elements.amount.select();
  }));
  document.querySelectorAll("[data-finance-refund-close]").forEach((button) => button.addEventListener("click", closeRefundModal));
  document.querySelector("[data-finance-refund-modal]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeRefundModal(); });
  document.querySelector("[data-finance-refund-form]")?.addEventListener("submit", submitBillingRefund);
  document.querySelectorAll("[data-open-verification-case]").forEach((button) => button.addEventListener("click", () => {
    const modal = [...document.querySelectorAll("[data-verification-case-modal]")].find((item) => item.dataset.verificationCaseModal === button.dataset.openVerificationCase);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("wa-verification-case-open");
    modal.querySelector("input, select, textarea, button")?.focus();
  }));
  document.querySelectorAll("[data-verification-case-close]").forEach((button) => button.addEventListener("click", () => {
    button.closest("[data-verification-case-modal]").hidden = true;
    document.body.classList.remove("wa-verification-case-open");
  }));
  document.querySelectorAll("[data-verification-case-modal]").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    modal.hidden = true;
    document.body.classList.remove("wa-verification-case-open");
  }));
  document.querySelectorAll("[data-verification-details]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    button.disabled = true;
    try {
      const { error } = await db.rpc("whatsapp_platform_admin_update_verification", {
        p_tenant_id: form.dataset.verificationDetails,
        p_company_name: String(values.get("companyName") || "").trim(),
        p_entity_type: String(values.get("entityType") || "other"),
        p_registration_number: String(values.get("registrationNumber") || "").trim() || null,
        p_gstin: String(values.get("gstin") || "").trim() || null,
        p_registered_address: String(values.get("registeredAddress") || "").trim() || null,
        p_representative_name: String(values.get("representativeName") || "").trim() || null,
        p_representative_title: String(values.get("representativeTitle") || "").trim() || null,
      });
      if (error) throw error;
      showToast("Customer details updated in the admin console and customer portal.", TOAST_TYPES.SUCCESS);
      await loadSnapshot();
    } catch (error) {
      showToast(error?.message || "Customer details could not be updated.", TOAST_TYPES.ERROR);
      button.disabled = false;
    }
  }));
  document.querySelectorAll("[data-tenant-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await db.rpc("whatsapp_platform_admin_update_tenant", { p_tenant_id: form.dataset.tenantForm, p_status: values.get("status"), p_plan_code: values.get("plan") });
      if (error) throw error;
      const extraSeats = Number(values.get("additionalSeats") || 0);
      const { error: capacityError } = await db.rpc("whatsapp_platform_admin_set_tenant_addon", { p_tenant_id: form.dataset.tenantForm, p_addon_code: "extra_agent_seat", p_quantity: extraSeats, p_status: extraSeats > 0 ? "active" : "cancelled" });
      if (capacityError) throw capacityError;
      showToast("Customer workspace updated.", TOAST_TYPES.SUCCESS);
      state.packageMaster = null;
      await loadPackageMaster();
      await loadSnapshot();
    } catch (error) { showToast(error?.message || "Could not update workspace.", TOAST_TYPES.ERROR); button.disabled = false; }
  }));
  document.querySelectorAll("[data-verification-review]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const decision = event.submitter?.value;
    const notes = String(new FormData(form).get("notes") || "").trim();
    await reviewVerification(form.dataset.verificationReview, decision, notes, event.submitter);
  }));
  document.querySelectorAll("[data-verification-document]").forEach((button) => button.addEventListener("click", () => openVerificationDocument(button.dataset.verificationDocument, button).catch((error) => showToast(error?.message || "Document could not be opened.", TOAST_TYPES.ERROR))));
  document.querySelector("[data-document-review-close]")?.addEventListener("click", closeVerificationDocument);
  document.querySelector("[data-document-review-modal]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeVerificationDocument(); });
  document.querySelectorAll("[data-document-decision]").forEach((button) => button.addEventListener("click", async () => {
    const modal = document.querySelector("[data-document-review-modal]");
    const notes = String(modal?.querySelector("[data-document-review-notes]")?.value || "").trim();
    await reviewDocument(modal?.dataset.documentId || "", button.dataset.documentDecision, notes, button);
  }));
  document.querySelector("[data-document-review-notes]")?.addEventListener("input", (event) => {
    event.currentTarget.removeAttribute("aria-invalid");
    const feedback = document.querySelector("[data-document-review-feedback]");
    if (feedback) feedback.hidden = true;
  });
  document.querySelectorAll("[data-request-document]").forEach((button) => button.addEventListener("click", () => {
    const modal = document.querySelector("[data-document-request-modal]");
    if (!modal) return;
    modal.dataset.tenantId = button.dataset.requestDocument;
    modal.hidden = false;
    document.body.classList.add("wa-document-review-open");
    modal.querySelector('[name="title"]')?.focus();
  }));
  document.querySelectorAll("[data-document-request-close]").forEach((button) => button.addEventListener("click", closeDocumentRequest));
  document.querySelector("[data-document-request-modal]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeDocumentRequest(); });
  document.querySelector("[data-document-request-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget; const modal = form.closest("[data-document-request-modal]"); const submit = form.querySelector('button[type="submit"]'); const values = new FormData(form);
    submit.disabled = true;
    try {
      const due = values.get("dueAt") ? new Date(`${values.get("dueAt")}T23:59:59`).toISOString() : null;
      const { error } = await db.rpc("whatsapp_platform_admin_request_document", { p_tenant_id: modal.dataset.tenantId, p_document_type: values.get("documentType"), p_title: String(values.get("title") || "").trim(), p_instructions: String(values.get("instructions") || "").trim() || null, p_due_at: due });
      if (error) throw error;
      showToast("Additional document requested from the customer.", TOAST_TYPES.SUCCESS);
      closeDocumentRequest(); form.reset(); await loadSnapshot();
    } catch (error) { showToast(error?.message || "Document request could not be sent.", TOAST_TYPES.ERROR); submit.disabled = false; }
  });
  document.querySelectorAll("[data-cancel-document-request]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Cancel this outstanding document request?")) return;
    button.disabled = true;
    const { error } = await db.rpc("whatsapp_platform_admin_cancel_document_request", { p_request_id: button.dataset.cancelDocumentRequest });
    if (error) { showToast(error.message || "Request could not be cancelled.", TOAST_TYPES.ERROR); button.disabled = false; return; }
    showToast("Document request cancelled.", TOAST_TYPES.SUCCESS); await loadSnapshot();
  }));
  document.querySelector("[data-gate-pause]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget; const values = new FormData(form); const button = form.querySelector("button[type=submit]");
    if (!window.confirm("Temporarily allow all customer workspaces to start Meta onboarding without provider pre-check approval?")) return;
    button.disabled = true;
    try {
      const { error } = await db.rpc("whatsapp_platform_admin_set_verification_gate", { p_enabled: false, p_duration_days: Number(values.get("duration")), p_reason: String(values.get("reason") || "").trim() });
      if (error) throw error;
      showToast("Verification gate temporarily paused.", TOAST_TYPES.SUCCESS); await loadSnapshot();
    } catch (error) { showToast(error?.message || "Could not pause the verification gate.", TOAST_TYPES.ERROR); button.disabled = false; }
  });
  document.querySelector("[data-gate-restore]")?.addEventListener("click", async (event) => {
    if (!window.confirm("Restore the provider verification requirement now?")) return;
    event.currentTarget.disabled = true;
    try {
      const { error } = await db.rpc("whatsapp_platform_admin_set_verification_gate", { p_enabled: true, p_duration_days: null, p_reason: "Verification gate manually restored" });
      if (error) throw error;
      showToast("Verification gate restored.", TOAST_TYPES.SUCCESS); await loadSnapshot();
    } catch (error) { showToast(error?.message || "Could not restore the verification gate.", TOAST_TYPES.ERROR); event.currentTarget.disabled = false; }
  });
  document.querySelectorAll("[data-plan-form]").forEach((form) => form.addEventListener("submit", (event) => savePlan(event, form)));
  document.querySelectorAll("[data-plan-delete]").forEach((btn) => btn.addEventListener("click", () => deletePlan(btn.dataset.planDelete)));
  document.querySelectorAll("[data-addon-form]").forEach((form) => form.addEventListener("submit", (event) => saveAddon(event, form)));
  document.querySelectorAll("[data-addon-delete]").forEach((btn) => btn.addEventListener("click", () => deleteAddon(btn.dataset.addonDelete)));
  document.querySelector("[data-rates-form]")?.addEventListener("submit", (event) => saveRates(event));
  document.querySelectorAll("[data-master-package-form]").forEach((form) => form.addEventListener("submit", (event) => saveMasterPackage(event, form)));
  document.querySelectorAll("[data-master-addon-form]").forEach((form) => { bindMasterAddonQuantityControl(form); form.addEventListener("submit", (event) => saveMasterAddon(event, form)); });
  document.querySelectorAll("[data-master-coupon-form]").forEach((form) => form.addEventListener("submit", (event) => saveMasterCoupon(event, form)));
  document.querySelectorAll("[data-master-assignment]").forEach((form) => form.addEventListener("submit", (event) => saveMasterAssignment(event, form)));
  document.querySelector("[data-meta-secret-form]")?.addEventListener("submit", saveProviderSecret);
  document.querySelector("[data-razorpay-secret-form]")?.addEventListener("submit", saveRazorpaySecrets);
  document.querySelectorAll("[data-secret-toggle]").forEach((button) => button.addEventListener("click", () => {
    const input = document.querySelector(`[name="${button.dataset.secretToggle}"]`);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Show" : "Hide";
    button.setAttribute("aria-pressed", String(!showing));
  }));
  document.querySelector("[data-meta-secret-toggle]")?.addEventListener("click", (event) => {
    const input = document.querySelector('[name="meta_app_secret"]');
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    event.currentTarget.textContent = showing ? "Show" : "Hide";
    event.currentTarget.setAttribute("aria-pressed", String(!showing));
  });
  document.querySelector("[data-webhook-generate]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const rotating = state.providerSecretStatus?.webhookConfigured === true;
    if (rotating && !window.confirm("Rotate the webhook verification token? Meta verification will fail until the new token is saved there.")) return;
    try {
      button.disabled = true; button.textContent = "Generating…";
      const result = await providerSecretRequest("generate_webhook_token");
      state.providerSecretStatus = { ...(state.providerSecretStatus || {}), webhookConfigured: true, webhookUpdatedAt: result.webhookUpdatedAt };
      const output = document.querySelector("[data-webhook-token-output]");
      const input = document.querySelector("[data-webhook-token-value]");
      if (output && input) { input.value = result.token || ""; output.hidden = false; input.focus(); input.select(); }
      button.textContent = "Rotate verification token"; button.disabled = false;
      showToast("Webhook token generated. Copy it into Meta now.", TOAST_TYPES.SUCCESS);
    } catch (error) { showToast(error?.message || "Webhook token could not be generated.", TOAST_TYPES.ERROR); button.disabled = false; button.textContent = rotating ? "Rotate verification token" : "Generate verification token"; }
  });
  document.querySelector("[data-webhook-copy]")?.addEventListener("click", async () => {
    const input = document.querySelector("[data-webhook-token-value]");
    if (!input?.value) return;
    try { await navigator.clipboard.writeText(input.value); showToast("Webhook token copied.", TOAST_TYPES.SUCCESS); }
    catch { input.focus(); input.select(); showToast("Token selected. Press Ctrl+C to copy it."); }
  });
}

async function loadSnapshot() {
  state.loading = true; state.error = ""; render();
  const { data, error } = await db.rpc("whatsapp_platform_admin_snapshot");
  if (error) { state.error = error.message || "Database setup is pending."; state.snapshot = null; }
  else {
    state.snapshot = data || {};
    if (state.view === "customers") {
      const { data: directory, error: directoryError } = await db.rpc("whatsapp_platform_admin_customer_directory");
      if (!directoryError && Array.isArray(directory)) state.snapshot.tenants = directory;
    }
    const [{ data: reviews, error: reviewError }, { data: requests, error: requestError }] = await Promise.all([
      db.rpc("whatsapp_platform_admin_document_reviews"),
      db.rpc("whatsapp_platform_admin_document_requests"),
    ]);
    if (!reviewError) {
      const reviewMap = new Map((reviews || []).map((item) => [item.id, item]));
      (state.snapshot.verifications || []).forEach((verification) => (verification.documents || []).forEach((document) => Object.assign(document, reviewMap.get(document.id) || {})));
    }
    if (!requestError) state.snapshot.documentRequests = requests || [];
  }
  state.loading = false; render();
}

async function init() {
  const requested = new URLSearchParams(location.search).get("view") || "overview";
  state.view = VIEWS.has(requested) ? requested : "overview";
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WHATSAPP_PLATFORM,
    pageTitle: "Platform overview",
    pageDescription: "Customer product management and Meta application operations",
    workspace: WORKSPACES.WHATSAPP_PLATFORM,
    sidebarContext: {
      title: "WhatsApp Business Platform",
      subtitle: "Customer product operations",
      showBack: false,
    },
  });
  if (!boot) return;
  state.hasFullAuthority = boot.roleCodes.some((role) => ["chairman_managing_director", "super_admin"].includes(role));
  state.canManage = state.hasFullAuthority || boot.permissions.some((permission) => permission.module_code === MODULES.WHATSAPP_PLATFORM && ["edit", "approve"].includes(permission.action_code));
  state.canApprove = state.hasFullAuthority || boot.permissions.some((permission) => permission.module_code === MODULES.WHATSAPP_PLATFORM && permission.action_code === "approve");
  await loadSnapshot();
  if (["meta", "razorpay"].includes(state.view) && state.hasFullAuthority) await loadProviderSecretStatus();
  if (BILLING_VIEWS.has(state.view) && state.hasFullAuthority) await loadBillingSnapshot();
}

init().catch((error) => { state.loading = false; state.error = error?.message || "The management console could not start."; render(); });
