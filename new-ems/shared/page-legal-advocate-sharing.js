import { MODULES, ROUTES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import {
  getAdvocateAdminContext,
  getAdvocateAdminMarks,
  replyToAdvocate,
  revokeAdvocateShare,
  saveAdvocate,
  shareAdvocateDocument
} from "./legal-advocate-api.js";

const state = { data: { advocates: [], agreements: [], files: [], shares: [], comments: [] }, marks: { annotations: [], bookmarks: [] }, agreementId: "" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function dateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function status(value) {
  const label = String(value || "-").replace(/_/g, " ");
  return `<span class="meta-pill">${esc(label)}</span>`;
}

function agreementOptions() {
  return `<option value="">Select agreement</option>${state.data.agreements.map((row) => `<option value="${esc(row.id)}" ${row.id === state.agreementId ? "selected" : ""}>${esc(row.agreement_no)} - ${esc(row.title)}</option>`).join("")}`;
}

function fileOptions() {
  const rows = state.data.files.filter((row) => !state.agreementId || row.agreement_id === state.agreementId);
  return `<option value="">Select document</option>${rows.map((row) => `<option value="${esc(row.source_kind)}|${esc(row.source_id)}">${esc(row.file_name || row.file_kind)} (${esc(String(row.file_kind || "document").replace(/_/g, " "))})</option>`).join("")}`;
}

function render() {
  const { advocates, shares, comments } = state.data;
  const activeShares = shares.filter((row) => row.is_active);
  const pendingComments = comments.filter((row) => !row.staff_reply);
  renderModuleContent(`
    <style>
      .adv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.adv-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.adv-form .wide{grid-column:1/-1}.adv-form label{display:grid;gap:.35rem;font-weight:700}.adv-form input,.adv-form select,.adv-form textarea{width:100%}.adv-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.85rem}.adv-note{padding:.8rem;border:1px solid rgba(212,178,106,.24);border-radius:12px;background:rgba(212,178,106,.05)}.adv-comment{padding:.9rem;border:1px solid rgba(212,178,106,.16);border-radius:12px;margin-top:.65rem}.adv-comment blockquote{margin:.55rem 0;padding:.65rem;border-left:3px solid #d4b26a;background:#090a0e}.adv-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem}.adv-kpi{padding:.85rem;border:1px solid rgba(212,178,106,.16);border-radius:12px}.adv-kpi strong{display:block;font-size:1.45rem}.adv-collab-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.adv-collab-list{display:grid;gap:.55rem;align-content:start}.adv-collab-item{padding:.75rem;border:1px solid rgba(212,178,106,.16);border-radius:10px;background:rgba(255,255,255,.015)}.adv-collab-item header{display:flex;justify-content:space-between;gap:.75rem}.adv-collab-item p{margin:.45rem 0 0;white-space:pre-wrap}.adv-collab-item blockquote{margin:.5rem 0 0;padding:.5rem;border-left:2px solid #d4b26a;background:#090a0e}@media(max-width:980px){.adv-grid,.adv-form,.adv-kpis,.adv-collab-grid{grid-template-columns:1fr}.adv-form .wide{grid-column:auto}}
    </style>
    <section class="card">
      <h3>Advocate Document Sharing</h3>
      <p class="muted">Create an advocate record, issue its login through Portal Access, and share only the legal files selected below. Removing a share immediately blocks future portal access.</p>
      <div class="adv-kpis"><div class="adv-kpi"><span class="muted">Advocates</span><strong>${advocates.length}</strong></div><div class="adv-kpi"><span class="muted">Active shares</span><strong>${activeShares.length}</strong></div><div class="adv-kpi"><span class="muted">Awaiting reply</span><strong>${pendingComments.length}</strong></div><div class="adv-kpi"><span class="muted">Files available</span><strong>${state.data.files.length}</strong></div></div>
    </section>

    <div class="adv-grid" style="margin-top:1rem;">
      <section class="card">
        <h3>1. Add Advocate</h3><p class="muted">This creates the professional record only. Create the username and temporary password afterward in Portal Access.</p>
        <form id="advocateForm" class="adv-form">
          <label>Full name *<input name="fullName" required maxlength="180" /></label>
          <label>Firm / chambers<input name="firmName" maxlength="180" /></label>
          <label>Bar Council number<input name="barCouncilNumber" maxlength="100" /></label>
          <label>Email<input name="email" type="email" maxlength="180" /></label>
          <label>WhatsApp / mobile<input name="phone" maxlength="30" /></label>
          <label class="wide">Notes<textarea name="notes" rows="2" maxlength="1000"></textarea></label>
          <div class="wide adv-actions"><button class="btn" type="submit">Save Advocate</button><a class="btn btn-ghost" href="${ROUTES.PORTAL_ACCESS}">Create Portal Login</a></div>
        </form>
      </section>

      <section class="card">
        <h3>2. Share Document</h3><p class="muted">Only the selected file is exposed. The advocate cannot browse the full legal archive or Google Drive.</p>
        <form id="shareForm" class="adv-form">
          <label>Advocate *<select name="advocateId" required><option value="">Select advocate</option>${advocates.filter((row) => row.status === "active").map((row) => `<option value="${esc(row.id)}">${esc(row.advocate_code)} - ${esc(row.full_name)}</option>`).join("")}</select></label>
          <label>Agreement *<select id="advocateAgreement" name="agreementId" required>${agreementOptions()}</select></label>
          <label class="wide">Document *<select id="advocateFile" name="document" required>${fileOptions()}</select></label>
          <label>Review access<select name="permissionLevel"><option value="comment">Preview and comment</option><option value="view">Preview only</option><option value="download">Preview, comment and download</option></select></label>
          <label>Access expiry<input name="expiresAt" type="datetime-local" /></label>
          <label class="wide">Portal title<input name="displayTitle" maxlength="180" placeholder="Leave empty to use the file name" /></label>
          <label class="wide">Instructions<textarea name="instructions" rows="3" maxlength="2000" placeholder="Questions to review, deadline, clauses requiring attention..."></textarea></label>
          <div class="wide adv-actions"><button class="btn" type="submit">Share Securely</button></div>
        </form>
      </section>
    </div>

    <section class="card" style="margin-top:1rem;">
      <h3>Shared Documents</h3>
      <div class="table-shell"><table><thead><tr><th>Advocate</th><th>Agreement / File</th><th>Access</th><th>Review</th><th>Activity</th><th>Action</th></tr></thead><tbody>
        ${shares.length ? shares.map((row) => `<tr><td><strong>${esc(row.advocate_name)}</strong></td><td><strong>${esc(row.agreement_no)}</strong><br>${esc(row.display_title || row.file_name || row.agreement_title)}</td><td>${status(row.permission_level)}<br><span class="muted">Expires ${esc(dateTime(row.expires_at))}</span></td><td>${status(row.review_status)}</td><td>${Number(row.access_count || 0)} open(s)<br><span class="muted">${esc(dateTime(row.last_opened_at))}</span></td><td>${row.is_active ? `<button class="btn btn-sm btn-danger" type="button" data-revoke-share="${esc(row.id)}">Revoke</button>` : status("revoked")}</td></tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No documents have been shared.</td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card" style="margin-top:1rem;">
      <h3>Advocate Review Inbox</h3>
      ${comments.length ? comments.map((row) => `<article class="adv-comment"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;"><div><strong>${esc(row.advocate_name)}</strong> ${status(row.comment_type)}</div><span class="muted">${esc(dateTime(row.created_at))}</span></div><blockquote>${esc(row.body)}</blockquote>${row.staff_reply ? `<div class="adv-note"><strong>Staff reply</strong><br>${esc(row.staff_reply)}<br><span class="muted">${esc(dateTime(row.replied_at))}</span></div>` : `<form data-reply-form="${esc(row.id)}" class="adv-actions"><input name="reply" required maxlength="2000" placeholder="Write a reply for the advocate" style="flex:1;min-width:240px;" /><button class="btn btn-sm" type="submit">Send Reply</button></form>`}</article>`).join("") : `<p class="muted">No advocate comments yet.</p>`}
    </section>

    <section class="card" style="margin-top:1rem;">
      <h3>Collaborative Document Marks</h3><p class="muted">Shared annotations and bookmarks from every authorised advocate. These references do not alter the original legal file.</p>
      <div class="adv-collab-grid"><div><h4>Annotations (${state.marks.annotations.length})</h4><div class="adv-collab-list">${state.marks.annotations.length ? state.marks.annotations.map((row) => `<article class="adv-collab-item"><header><strong>${esc(row.agreement_no)} · Page ${esc(row.page_number)} · ${esc(String(row.annotation_type || "note").replace(/_/g," "))}</strong><span class="muted">${esc(row.author_name)}</span></header><small class="muted">${esc(row.document_title)} · ${esc(dateTime(row.updated_at || row.created_at))}</small>${row.quoted_text ? `<blockquote>${esc(row.quoted_text)}</blockquote>` : ""}<p>${esc(row.body)}</p></article>`).join("") : `<p class="muted">No annotations yet.</p>`}</div></div><div><h4>Bookmarks (${state.marks.bookmarks.length})</h4><div class="adv-collab-list">${state.marks.bookmarks.length ? state.marks.bookmarks.map((row) => `<article class="adv-collab-item"><header><strong>${esc(row.agreement_no)} · Page ${esc(row.page_number)} · ${esc(row.label)}</strong><span class="muted">${esc(row.author_name)}</span></header><small class="muted">${esc(row.document_title)} · ${esc(dateTime(row.updated_at || row.created_at))}</small>${row.note ? `<p>${esc(row.note)}</p>` : ""}</article>`).join("") : `<p class="muted">No bookmarks yet.</p>`}</div></div></div>
    </section>
  `);
  bind();
}

function bind() {
  document.getElementById("advocateAgreement")?.addEventListener("change", (event) => {
    state.agreementId = event.target.value;
    const target = document.getElementById("advocateFile");
    if (target) target.innerHTML = fileOptions();
  });
  document.getElementById("advocateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      button.disabled = true;
      await saveAdvocate(values);
      showToast("Advocate saved. Create portal credentials in Portal Access when ready.", TOAST_TYPES.SUCCESS);
      await load();
    } catch (error) { showToast(error.message || "Advocate could not be saved.", TOAST_TYPES.ERROR); }
    finally { if (button?.isConnected) button.disabled = false; }
  });
  document.getElementById("shareForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const [sourceKind, sourceId] = String(values.document || "").split("|");
    try {
      button.disabled = true;
      await shareAdvocateDocument({ ...values, sourceKind, sourceId, expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null });
      showToast("Document shared with the advocate.", TOAST_TYPES.SUCCESS);
      await load();
    } catch (error) { showToast(error.message || "Document could not be shared.", TOAST_TYPES.ERROR); }
    finally { if (button?.isConnected) button.disabled = false; }
  });
  document.querySelectorAll("[data-revoke-share]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Revoke this advocate's access to the document?")) return;
    try { await revokeAdvocateShare(button.dataset.revokeShare); showToast("Document access revoked.", TOAST_TYPES.SUCCESS); await load(); }
    catch (error) { showToast(error.message || "Share could not be revoked.", TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll("[data-reply-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reply = new FormData(form).get("reply");
    try { await replyToAdvocate(form.dataset.replyForm, reply); showToast("Reply sent.", TOAST_TYPES.SUCCESS); await load(); }
    catch (error) { showToast(error.message || "Reply could not be saved.", TOAST_TYPES.ERROR); }
  }));
}

async function load() {
  const [data, marks] = await Promise.all([getAdvocateAdminContext(), getAdvocateAdminMarks()]);
  state.data = data;
  state.marks = marks;
  render();
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.LEGAL_ARCHIVE, pageTitle: "Advocate Sharing", pageDescription: "Securely share selected legal documents for external advocate review", workspace: WORKSPACES.LEGAL });
  if (!boot) return;
  try { await load(); } catch (error) { showToast(error.message || "Advocate sharing could not be loaded.", TOAST_TYPES.ERROR); render(); }
}

init();
