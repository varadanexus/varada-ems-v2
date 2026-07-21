import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { showToast } from "./utils.js";
import { advocatePortalLogout, requireAdvocatePortalSession } from "./legal-advocate-portal-auth.js";
import { addAdvocateComment, fetchAdvocateSharedFile, getAdvocatePortalContext } from "./legal-advocate-api.js";

const state = { session: null, context: { profile: {}, shares: [] }, selectedShareId: "", previewUrl: "", preview: null, query: "", status: "all" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function dateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function badge(value) {
  return `<span class="lap-badge">${esc(String(value || "-").replace(/_/g, " "))}</span>`;
}

function filteredShares() {
  const query = state.query.trim().toLowerCase();
  return (state.context.shares || []).filter((row) => {
    if (state.status !== "all" && row.review_status !== state.status) return false;
    if (!query) return true;
    return `${row.agreement_no} ${row.agreement_title} ${row.display_title} ${row.party_name} ${row.file_name}`.toLowerCase().includes(query);
  });
}

function renderDocumentList() {
  const rows = filteredShares();
  if (!rows.length) return `<div class="lap-empty"><strong>No shared documents found</strong><p>Documents explicitly shared by Varada Nexus will appear here.</p></div>`;
  return rows.map((row) => `<button class="lap-doc ${row.id === state.selectedShareId ? "active" : ""}" type="button" data-share-id="${esc(row.id)}"><span class="lap-doc-icon">${String(row.mime_type || "").includes("pdf") ? "PDF" : "DOC"}</span><span><strong>${esc(row.display_title || row.file_name)}</strong><small>${esc(row.agreement_no)} - ${esc(row.agreement_title)}</small><small>${esc(row.party_name)} · Shared ${esc(dateTime(row.shared_at))}</small></span><span>${badge(row.review_status)}</span></button>`).join("");
}

function previewContent(share) {
  if (!share) return `<div class="lap-preview-empty"><div>VN</div><h2>Select a document</h2><p>Choose a shared legal document to preview it securely.</p></div>`;
  if (!state.previewUrl) return `<div class="lap-preview-empty"><div>LOCK</div><h2>${esc(share.display_title || share.file_name)}</h2><p>Open the secure preview when you are ready to review this file.</p><button class="lap-primary" id="openPreviewBtn" type="button">Open Secure Preview</button></div>`;
  const type = state.preview?.contentType || share.mime_type || "";
  if (type.includes("pdf")) return `<iframe class="lap-frame" src="${esc(state.previewUrl)}#toolbar=1&navpanes=0" title="${esc(share.display_title || share.file_name)}"></iframe>`;
  if (type.includes("html") || type.startsWith("text/")) return `<iframe class="lap-frame" sandbox="" src="${esc(state.previewUrl)}" title="${esc(share.display_title || share.file_name)}"></iframe>`;
  if (type.startsWith("image/")) return `<div class="lap-image-wrap"><img src="${esc(state.previewUrl)}" alt="${esc(share.display_title || share.file_name)}" /></div>`;
  return `<div class="lap-preview-empty"><div>DOC</div><h2>Preview is not available for this file type</h2><p>Use Download if the document owner enabled it.</p></div>`;
}

function renderReview(share) {
  if (!share) return "";
  const canComment = share.permission_level !== "view";
  return `<aside class="lap-review"><div class="lap-review-head"><span>REVIEW PANEL</span><h3>${esc(share.agreement_no)}</h3>${badge(share.permission_level)}</div>${share.instructions ? `<div class="lap-instructions"><strong>Instructions from Varada Nexus</strong><p>${esc(share.instructions)}</p></div>` : ""}<div class="lap-thread">${(share.comments || []).length ? share.comments.map((comment) => `<article><div><strong>${esc(String(comment.comment_type).replace(/_/g, " "))}</strong><time>${esc(dateTime(comment.created_at))}</time></div><p>${esc(comment.body)}</p>${comment.staff_reply ? `<blockquote><strong>Varada Nexus reply</strong><br>${esc(comment.staff_reply)}<br><small>${esc(dateTime(comment.replied_at))}</small></blockquote>` : `<small>Awaiting staff reply</small>`}</article>`).join("") : `<p class="lap-muted">No review comments yet.</p>`}</div>${canComment ? `<form id="advocateCommentForm" class="lap-comment-form"><label>Review action<select name="commentType"><option value="comment">Comment</option><option value="question">Question</option><option value="revision_required">Request revision</option><option value="reviewed">Mark reviewed</option></select></label><label>Your note<textarea name="body" rows="4" required maxlength="3000" placeholder="Write a clear clause, page or document reference..."></textarea></label><button class="lap-primary" type="submit">Submit Review Note</button></form>` : `<div class="lap-instructions"><strong>Preview-only access</strong><p>Comments are disabled for this document. Contact Varada Nexus if review access is required.</p></div>`}</aside>`;
}

function render() {
  const profile = state.context.profile || {};
  const share = (state.context.shares || []).find((row) => row.id === state.selectedShareId) || null;
  document.getElementById("app").innerHTML = `
    <style>
      :root{--lap-gold:#d4b26a;--lap-ink:#05070b;--lap-panel:#0c0f15;--lap-line:rgba(212,178,106,.22);--lap-muted:#999586}.lap-shell{min-height:100vh;background:radial-gradient(circle at 85% 0,rgba(212,178,106,.09),transparent 30%),#05070b;color:#f7f4ec;display:grid;grid-template-columns:270px 1fr}.lap-side{border-right:1px solid var(--lap-line);padding:1.35rem;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}.lap-brand{display:flex;gap:.75rem;align-items:center}.lap-brand img{width:42px}.lap-brand strong,.lap-brand small{display:block;letter-spacing:.15em}.lap-brand small{font-size:.62rem;color:var(--lap-gold)}.lap-profile{margin-top:2rem;padding:1rem;border:1px solid var(--lap-line);border-radius:16px;background:rgba(255,255,255,.02)}.lap-profile span{font-size:.7rem;color:var(--lap-gold);letter-spacing:.12em}.lap-profile strong,.lap-profile small{display:block;margin-top:.4rem}.lap-profile small{color:var(--lap-muted);line-height:1.5}.lap-security{margin-top:1rem;color:var(--lap-muted);font-size:.75rem;line-height:1.55}.lap-side footer{margin-top:auto}.lap-side button{width:100%;padding:.75rem;border:1px solid var(--lap-line);border-radius:999px;background:transparent;color:#fff}.lap-main{min-width:0}.lap-top{padding:1.15rem 1.5rem;border-bottom:1px solid var(--lap-line);display:flex;justify-content:space-between;align-items:center}.lap-top h1{font-family:Georgia,serif;margin:0;font-size:1.35rem}.lap-secure{color:var(--lap-gold);font-size:.76rem}.lap-content{padding:1.25rem}.lap-controls{display:flex;gap:.65rem;margin-bottom:1rem}.lap-controls input,.lap-controls select,.lap-comment-form select,.lap-comment-form textarea{background:#07090d;border:1px solid var(--lap-line);color:#fff;border-radius:10px;padding:.75rem}.lap-controls input{flex:1}.lap-workspace{display:grid;grid-template-columns:minmax(280px,360px) minmax(420px,1fr) minmax(280px,350px);min-height:680px;border:1px solid var(--lap-line);border-radius:18px;overflow:hidden;background:var(--lap-panel)}.lap-list{padding:.75rem;border-right:1px solid var(--lap-line);overflow:auto;max-height:75vh}.lap-doc{width:100%;display:grid;grid-template-columns:42px 1fr auto;gap:.7rem;text-align:left;padding:.85rem;border:1px solid transparent;border-radius:12px;background:transparent;color:#fff;margin-bottom:.5rem}.lap-doc:hover,.lap-doc.active{border-color:var(--lap-gold);background:rgba(212,178,106,.07)}.lap-doc-icon{display:grid;place-items:center;height:42px;border-radius:9px;background:#17140d;color:var(--lap-gold);font-size:.65rem;font-weight:900}.lap-doc strong,.lap-doc small{display:block}.lap-doc small{color:var(--lap-muted);margin-top:.25rem;font-size:.72rem}.lap-badge{display:inline-flex;padding:.25rem .48rem;border:1px solid var(--lap-line);border-radius:999px;color:var(--lap-gold);font-size:.65rem;text-transform:capitalize;white-space:nowrap}.lap-preview{background:#11141b;min-width:0;display:flex}.lap-frame{width:100%;min-height:680px;border:0;background:#fff}.lap-image-wrap{display:grid;place-items:center;width:100%;padding:1rem}.lap-image-wrap img{max-width:100%;max-height:650px}.lap-preview-empty,.lap-empty{margin:auto;text-align:center;color:var(--lap-muted);padding:2rem}.lap-preview-empty>div{width:64px;height:64px;border:1px solid var(--lap-line);border-radius:18px;display:grid;place-items:center;margin:0 auto 1rem;color:var(--lap-gold);font-weight:900}.lap-review{border-left:1px solid var(--lap-line);padding:1rem;overflow:auto;max-height:75vh}.lap-review-head span{font-size:.65rem;color:var(--lap-gold);letter-spacing:.14em}.lap-review-head h3{margin:.35rem 0}.lap-instructions,.lap-thread article{border:1px solid var(--lap-line);border-radius:12px;padding:.8rem;margin-top:.75rem;background:rgba(255,255,255,.02)}.lap-instructions p,.lap-thread p{line-height:1.55;color:#d7d3c9}.lap-thread article>div{display:flex;justify-content:space-between;gap:.5rem}.lap-thread time,.lap-thread small,.lap-muted{color:var(--lap-muted);font-size:.72rem}.lap-thread blockquote{margin:.65rem 0 0;padding:.65rem;border-left:3px solid var(--lap-gold);background:#07090d}.lap-comment-form{display:grid;gap:.7rem;margin-top:1rem}.lap-comment-form label{display:grid;gap:.35rem;font-size:.78rem}.lap-primary{border:0;border-radius:999px;padding:.75rem 1rem;background:linear-gradient(135deg,#f4dfa3,#c89a38);color:#151005;font-weight:900;cursor:pointer}.lap-toolbar{position:absolute;right:1rem;top:1rem;display:flex;gap:.5rem}.lap-preview-wrap{position:relative;display:flex;width:100%}@media(max-width:1180px){.lap-workspace{grid-template-columns:320px 1fr}.lap-review{grid-column:1/-1;border-left:0;border-top:1px solid var(--lap-line);max-height:none}}@media(max-width:760px){.lap-shell{grid-template-columns:1fr}.lap-side{position:relative;height:auto}.lap-workspace{grid-template-columns:1fr}.lap-list{max-height:320px}.lap-review{grid-column:auto}.lap-top{align-items:flex-start}.lap-controls{flex-direction:column}}
    </style>
    <div class="lap-shell"><aside class="lap-side"><div class="lap-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><small>ADVOCATE PORTAL</small></div></div><div class="lap-profile"><span>SECURE LEGAL REVIEW</span><strong>${esc(profile.name || "Advocate")}</strong><small>${esc(profile.firm || profile.bar_council_number || "External legal counsel")}</small><small>${esc(profile.email || "")}</small></div><p class="lap-security">Only documents explicitly shared with this account are visible. All access and review activity is logged.</p><footer><button id="switchPortalBtn" type="button" style="margin-bottom:.55rem">Switch Portal</button><button id="advocateLogout" type="button">Sign out</button></footer></aside><main class="lap-main"><header class="lap-top"><h1>Legal Document Review</h1><span class="lap-secure">● Encrypted session</span></header><div class="lap-content"><div class="lap-controls"><input id="advocateSearch" value="${esc(state.query)}" placeholder="Search agreements, parties or files"/><select id="advocateStatus"><option value="all">All review states</option>${["shared","opened","under_review","revision_required","reviewed"].map((value) => `<option value="${value}" ${state.status === value ? "selected" : ""}>${esc(value.replace(/_/g," "))}</option>`).join("")}</select></div><div class="lap-workspace"><section class="lap-list">${renderDocumentList()}</section><section class="lap-preview"><div class="lap-preview-wrap">${previewContent(share)}${share && state.previewUrl && share.permission_level === "download" ? `<div class="lap-toolbar"><button class="lap-primary" id="downloadSharedFile" type="button">Download</button></div>` : ""}</div></section>${renderReview(share)}</div></div></main></div><div id="toastHost" class="toast-host" aria-live="polite"></div>`;
  bind();
}

function clearPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = "";
  state.preview = null;
}

async function openPreview() {
  const share = state.context.shares.find((row) => row.id === state.selectedShareId);
  if (!share) return;
  try {
    const file = await fetchAdvocateSharedFile(state.session.sessionToken, share.id);
    clearPreview();
    state.preview = file;
    state.previewUrl = URL.createObjectURL(file.blob);
    share.review_status = share.review_status === "shared" ? "opened" : share.review_status;
    render();
  } catch (error) { showToast(error.message || "Document could not be opened.", TOAST_TYPES.ERROR); }
}

function bind() {
  document.getElementById("advocateLogout")?.addEventListener("click", advocatePortalLogout);
  document.getElementById("switchPortalBtn")?.addEventListener("click", () => window.location.assign(ROUTES.EXTERNAL_PORTAL_SELECTOR));
  document.getElementById("advocateSearch")?.addEventListener("input", (event) => { state.query = event.target.value; render(); document.getElementById("advocateSearch")?.focus(); });
  document.getElementById("advocateStatus")?.addEventListener("change", (event) => { state.status = event.target.value; render(); });
  document.querySelectorAll("[data-share-id]").forEach((button) => button.addEventListener("click", () => { clearPreview(); state.selectedShareId = button.dataset.shareId; render(); }));
  document.getElementById("openPreviewBtn")?.addEventListener("click", openPreview);
  document.getElementById("downloadSharedFile")?.addEventListener("click", () => {
    const share = state.context.shares.find((row) => row.id === state.selectedShareId);
    if (!state.previewUrl || !share) return;
    const link = document.createElement("a"); link.href = state.previewUrl; link.download = state.preview?.fileName || share.file_name || "legal-document"; link.click();
  });
  document.getElementById("advocateCommentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      button.disabled = true;
      await addAdvocateComment(state.session.sessionToken, state.selectedShareId, values.commentType, values.body);
      showToast("Review note submitted to Varada Nexus.", TOAST_TYPES.SUCCESS);
      await load();
    } catch (error) { showToast(error.message || "Review note could not be submitted.", TOAST_TYPES.ERROR); }
    finally { if (button?.isConnected) button.disabled = false; }
  });
}

async function load() {
  state.context = await getAdvocatePortalContext(state.session.sessionToken);
  if (!state.selectedShareId && state.context.shares?.[0]?.id) state.selectedShareId = state.context.shares[0].id;
  if (state.selectedShareId && !state.context.shares.some((row) => row.id === state.selectedShareId)) { clearPreview(); state.selectedShareId = state.context.shares?.[0]?.id || ""; }
  render();
}

async function init() {
  state.session = await requireAdvocatePortalSession();
  if (!state.session) return;
  try { await load(); } catch (error) { document.getElementById("app").innerHTML = `<div class="card" style="margin:2rem"><h2>Advocate Portal Error</h2><p>${esc(error.message || "The portal could not be loaded.")}</p><button class="btn" id="advocateLogout">Return to Login</button></div>`; document.getElementById("advocateLogout")?.addEventListener("click", advocatePortalLogout); }
}

window.addEventListener("beforeunload", clearPreview);
init();
