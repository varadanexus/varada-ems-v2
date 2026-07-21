import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { showToast } from "./utils.js";
import { advocatePortalLogout, requireAdvocatePortalSession } from "./legal-advocate-portal-auth.js";
import { addAdvocateComment, fetchAdvocateSharedFile, getAdvocatePortalContext } from "./legal-advocate-api.js";

const state = { session: null, context: { profile: {}, shares: [] }, selectedShareId: "", previewUrl: "", preview: null, query: "", status: "all", updatedAt: null };

// This is a standalone external portal, so the authenticated EMS layout does
// not run here to clear the global page-transition hiding state.
document.getElementById("app")?.classList.add("page-enter-active");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function dateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function badge(value) {
  const slug = String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<span class="lap-badge lap-badge--${esc(slug)}">${esc(String(value || "-").replace(/_/g, " "))}</span>`;
}

function statusLabel(value) {
  return String(value || "shared").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function portalMetrics() {
  const shares = state.context.shares || [];
  const reviewed = shares.filter((row) => row.review_status === "reviewed").length;
  const revisions = shares.filter((row) => row.review_status === "revision_required").length;
  const open = shares.filter((row) => ["shared", "opened", "under_review"].includes(row.review_status)).length;
  const replies = shares.reduce((total, row) => total + (row.comments || []).filter((comment) => comment.staff_reply).length, 0);
  return { total: shares.length, reviewed, revisions, open, replies };
}

function reviewProgress(status) {
  const current = String(status || "shared");
  const order = ["shared", "opened", "under_review", "reviewed"];
  const activeIndex = current === "revision_required" ? 2 : Math.max(0, order.indexOf(current));
  return `<div class="lap-progress" aria-label="Document review progress">${order.map((step, index) => `<span class="${index <= activeIndex ? "complete" : ""} ${step === current || (current === "revision_required" && step === "under_review") ? "current" : ""}"><i>${index < activeIndex ? "✓" : index + 1}</i><small>${esc(statusLabel(step))}</small></span>`).join("")}</div>`;
}

function filteredShares() {
  const query = state.query.trim().toLowerCase();
  return (state.context.shares || []).filter((row) => {
    if (state.status === "pending" && !["shared", "opened", "under_review"].includes(row.review_status)) return false;
    if (!["all", "pending"].includes(state.status) && row.review_status !== state.status) return false;
    if (!query) return true;
    return `${row.agreement_no} ${row.agreement_title} ${row.display_title} ${row.party_name} ${row.file_name}`.toLowerCase().includes(query);
  });
}

function clearSelectionIfHidden() {
  if (!state.selectedShareId) return;
  if (filteredShares().some((row) => row.id === state.selectedShareId)) return;
  clearPreview();
  state.selectedShareId = "";
}

function renderDocumentList() {
  const rows = filteredShares();
  if (!rows.length) return `<div class="lap-empty"><span>⌕</span><strong>No documents match this view</strong><p>Clear the filters or wait for Varada Nexus to share a document with this account.</p><button class="lap-secondary" id="clearFiltersEmpty" type="button">Clear filters</button></div>`;
  return rows.map((row) => `<button class="lap-doc ${row.id === state.selectedShareId ? "active" : ""}" type="button" data-share-id="${esc(row.id)}"><span class="lap-doc-icon">${String(row.mime_type || "").includes("pdf") ? "PDF" : "DOC"}</span><span class="lap-doc-copy"><strong>${esc(row.display_title || row.file_name)}</strong><small class="lap-doc-number">${esc(row.agreement_no)}</small><small>${esc(row.party_name || row.agreement_title || "Legal document")}</small><small>Shared ${esc(dateTime(row.shared_at))}</small></span>${badge(row.review_status)}</button>`).join("");
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
  const comments = share.comments || [];
  return `<aside class="lap-review"><div class="lap-review-head"><span>REVIEW &amp; COLLABORATION</span><h3>${esc(share.agreement_no)}</h3><div>${badge(share.permission_level)}${badge(share.review_status)}</div></div>${share.instructions ? `<div class="lap-instructions"><span>VN</span><div><strong>Instructions from Varada Nexus</strong><p>${esc(share.instructions)}</p></div></div>` : ""}<div class="lap-section-title"><span>Activity</span><small>${comments.length} ${comments.length === 1 ? "entry" : "entries"}</small></div><div class="lap-thread">${comments.length ? comments.map((comment) => `<article><div><strong>${esc(statusLabel(comment.comment_type))}</strong><time>${esc(dateTime(comment.created_at))}</time></div><p>${esc(comment.body)}</p>${comment.staff_reply ? `<blockquote><strong>Varada Nexus reply</strong><p>${esc(comment.staff_reply)}</p><small>${esc(dateTime(comment.replied_at))}</small></blockquote>` : `<small class="lap-awaiting">Awaiting Varada Nexus response</small>`}</article>`).join("") : `<div class="lap-thread-empty"><span>✦</span><p>No review activity yet. Add a structured note below when you are ready.</p></div>`}</div>${canComment ? `<form id="advocateCommentForm" class="lap-comment-form"><div class="lap-section-title"><span>Add review note</span><small>Sent securely</small></div><label>Action<select name="commentType"><option value="comment">General comment</option><option value="question">Ask a question</option><option value="revision_required">Request revision</option><option value="reviewed">Mark as reviewed</option></select></label><label>Reference and note<textarea name="body" rows="5" required maxlength="3000" placeholder="Mention the clause, page or document section, then write your note..."></textarea><small class="lap-field-help">Be specific so the Varada Nexus team can respond quickly.</small></label><button class="lap-primary" type="submit"><span>Submit review note</span><b>→</b></button></form>` : `<div class="lap-instructions"><span>⌁</span><div><strong>Preview-only access</strong><p>Comments are disabled for this document. Contact Varada Nexus if review access is required.</p></div></div>`}</aside>`;
}

function renderLegacy() {
  const profile = state.context.profile || {};
  const share = (state.context.shares || []).find((row) => row.id === state.selectedShareId) || null;
  document.getElementById("app").innerHTML = `
    <style>
      :root{--lap-gold:#d4b26a;--lap-ink:#05070b;--lap-panel:#0c0f15;--lap-line:rgba(212,178,106,.22);--lap-muted:#999586}.lap-shell{min-height:100vh;background:radial-gradient(circle at 85% 0,rgba(212,178,106,.09),transparent 30%),#05070b;color:#f7f4ec;display:grid;grid-template-columns:270px 1fr}.lap-side{border-right:1px solid var(--lap-line);padding:1.35rem;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}.lap-brand{display:flex;gap:.75rem;align-items:center}.lap-brand img{width:42px}.lap-brand strong,.lap-brand small{display:block;letter-spacing:.15em}.lap-brand small{font-size:.62rem;color:var(--lap-gold)}.lap-profile{margin-top:2rem;padding:1rem;border:1px solid var(--lap-line);border-radius:16px;background:rgba(255,255,255,.02)}.lap-profile span{font-size:.7rem;color:var(--lap-gold);letter-spacing:.12em}.lap-profile strong,.lap-profile small{display:block;margin-top:.4rem}.lap-profile small{color:var(--lap-muted);line-height:1.5}.lap-security{margin-top:1rem;color:var(--lap-muted);font-size:.75rem;line-height:1.55}.lap-side footer{margin-top:auto}.lap-side button{width:100%;padding:.75rem;border:1px solid var(--lap-line);border-radius:999px;background:transparent;color:#fff}.lap-main{min-width:0}.lap-top{padding:1.15rem 1.5rem;border-bottom:1px solid var(--lap-line);display:flex;justify-content:space-between;align-items:center}.lap-top h1{font-family:Georgia,serif;margin:0;font-size:1.35rem}.lap-secure{color:var(--lap-gold);font-size:.76rem}.lap-content{padding:1.25rem}.lap-controls{display:flex;gap:.65rem;margin-bottom:1rem}.lap-controls input,.lap-controls select,.lap-comment-form select,.lap-comment-form textarea{background:#07090d;border:1px solid var(--lap-line);color:#fff;border-radius:10px;padding:.75rem}.lap-controls input{flex:1}.lap-workspace{display:grid;grid-template-columns:minmax(280px,360px) minmax(420px,1fr) minmax(280px,350px);min-height:680px;border:1px solid var(--lap-line);border-radius:18px;overflow:hidden;background:var(--lap-panel)}.lap-list{padding:.75rem;border-right:1px solid var(--lap-line);overflow:auto;max-height:75vh}.lap-doc{width:100%;display:grid;grid-template-columns:42px 1fr auto;gap:.7rem;text-align:left;padding:.85rem;border:1px solid transparent;border-radius:12px;background:transparent;color:#fff;margin-bottom:.5rem}.lap-doc:hover,.lap-doc.active{border-color:var(--lap-gold);background:rgba(212,178,106,.07)}.lap-doc-icon{display:grid;place-items:center;height:42px;border-radius:9px;background:#17140d;color:var(--lap-gold);font-size:.65rem;font-weight:900}.lap-doc strong,.lap-doc small{display:block}.lap-doc small{color:var(--lap-muted);margin-top:.25rem;font-size:.72rem}.lap-badge{display:inline-flex;padding:.25rem .48rem;border:1px solid var(--lap-line);border-radius:999px;color:var(--lap-gold);font-size:.65rem;text-transform:capitalize;white-space:nowrap}.lap-preview{background:#11141b;min-width:0;display:flex}.lap-frame{width:100%;min-height:680px;border:0;background:#fff}.lap-image-wrap{display:grid;place-items:center;width:100%;padding:1rem}.lap-image-wrap img{max-width:100%;max-height:650px}.lap-preview-empty,.lap-empty{margin:auto;text-align:center;color:var(--lap-muted);padding:2rem}.lap-preview-empty>div{width:64px;height:64px;border:1px solid var(--lap-line);border-radius:18px;display:grid;place-items:center;margin:0 auto 1rem;color:var(--lap-gold);font-weight:900}.lap-review{border-left:1px solid var(--lap-line);padding:1rem;overflow:auto;max-height:75vh}.lap-review-head span{font-size:.65rem;color:var(--lap-gold);letter-spacing:.14em}.lap-review-head h3{margin:.35rem 0}.lap-instructions,.lap-thread article{border:1px solid var(--lap-line);border-radius:12px;padding:.8rem;margin-top:.75rem;background:rgba(255,255,255,.02)}.lap-instructions p,.lap-thread p{line-height:1.55;color:#d7d3c9}.lap-thread article>div{display:flex;justify-content:space-between;gap:.5rem}.lap-thread time,.lap-thread small,.lap-muted{color:var(--lap-muted);font-size:.72rem}.lap-thread blockquote{margin:.65rem 0 0;padding:.65rem;border-left:3px solid var(--lap-gold);background:#07090d}.lap-comment-form{display:grid;gap:.7rem;margin-top:1rem}.lap-comment-form label{display:grid;gap:.35rem;font-size:.78rem}.lap-primary{border:0;border-radius:999px;padding:.75rem 1rem;background:linear-gradient(135deg,#f4dfa3,#c89a38);color:#151005;font-weight:900;cursor:pointer}.lap-toolbar{position:absolute;right:1rem;top:1rem;display:flex;gap:.5rem}.lap-preview-wrap{position:relative;display:flex;width:100%}@media(max-width:1180px){.lap-workspace{grid-template-columns:320px 1fr}.lap-review{grid-column:1/-1;border-left:0;border-top:1px solid var(--lap-line);max-height:none}}@media(max-width:760px){.lap-shell{grid-template-columns:1fr}.lap-side{position:relative;height:auto}.lap-workspace{grid-template-columns:1fr}.lap-list{max-height:320px}.lap-review{grid-column:auto}.lap-top{align-items:flex-start}.lap-controls{flex-direction:column}}
    </style>
    <div class="lap-shell"><aside class="lap-side"><div class="lap-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><small>ADVOCATE PORTAL</small></div></div><div class="lap-profile"><span>SECURE LEGAL REVIEW</span><strong>${esc(profile.name || "Advocate")}</strong><small>${esc(profile.firm || profile.bar_council_number || "External legal counsel")}</small><small>${esc(profile.email || "")}</small></div><p class="lap-security">Only documents explicitly shared with this account are visible. All access and review activity is logged.</p><footer><button id="switchPortalBtn" type="button" style="margin-bottom:.55rem">Switch Portal</button><button id="advocateLogout" type="button">Sign out</button></footer></aside><main class="lap-main"><header class="lap-top"><h1>Legal Document Review</h1><span class="lap-secure">● Encrypted session</span></header><div class="lap-content"><div class="lap-controls"><input id="advocateSearch" value="${esc(state.query)}" placeholder="Search agreements, parties or files"/><select id="advocateStatus"><option value="all">All review states</option>${["shared","opened","under_review","revision_required","reviewed"].map((value) => `<option value="${value}" ${state.status === value ? "selected" : ""}>${esc(value.replace(/_/g," "))}</option>`).join("")}</select></div><div class="lap-workspace"><section class="lap-list">${renderDocumentList()}</section><section class="lap-preview"><div class="lap-preview-wrap">${previewContent(share)}${share && state.previewUrl && share.permission_level === "download" ? `<div class="lap-toolbar"><button class="lap-primary" id="downloadSharedFile" type="button">Download</button></div>` : ""}</div></section>${renderReview(share)}</div></div></main></div><div id="toastHost" class="toast-host" aria-live="polite"></div>`;
  bind();
}

function render() {
  const profile = state.context.profile || {};
  const shares = state.context.shares || [];
  const share = filteredShares().find((row) => row.id === state.selectedShareId) || null;
  const metrics = portalMetrics();
  const updated = state.updatedAt ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(state.updatedAt) : "Now";
  const watermarkText = `${profile.name || profile.email || "Authorized reviewer"} • ${dateTime(new Date())}`;
  const previewWatermark = state.previewUrl ? `<div class="lap-watermark" aria-hidden="true">${Array.from({ length: 10 }, () => `<span>${esc(watermarkText)}</span>`).join("")}</div>` : "";
  document.getElementById("app").innerHTML = `
    <style>
      :root{--lap-gold:#ddb85a;--lap-gold-soft:#f0d58a;--lap-bg:#050609;--lap-panel:#0b0d12;--lap-panel-2:#10131a;--lap-line:rgba(221,184,90,.2);--lap-line-soft:rgba(255,255,255,.07);--lap-text:#f4f1e8;--lap-muted:#979b9f;--lap-success:#6ed7a5;--lap-danger:#f09a92}
      body{background:var(--lap-bg)}button,input,select,textarea{font:inherit}.lap-shell{min-height:100vh;background:radial-gradient(900px 560px at 95% -12%,rgba(221,184,90,.09),transparent 65%),var(--lap-bg);color:var(--lap-text);display:grid;grid-template-columns:248px minmax(0,1fr)}
      .lap-side{position:sticky;top:0;height:100vh;padding:1.3rem 1.1rem;border-right:1px solid var(--lap-line);background:linear-gradient(180deg,rgba(255,255,255,.018),transparent 45%);display:flex;flex-direction:column;gap:1.2rem}.lap-brand{display:flex;align-items:center;gap:.7rem;padding:.15rem .2rem}.lap-brand img{width:40px;height:40px;object-fit:contain}.lap-brand strong,.lap-brand small{display:block;letter-spacing:.14em}.lap-brand strong{font-size:.82rem}.lap-brand small{font-size:.56rem;color:var(--lap-gold);margin-top:.14rem}.lap-side-label{color:#696d74;font-size:.58rem;font-weight:800;letter-spacing:.17em;text-transform:uppercase;margin:0 .25rem .45rem}
      .lap-profile{padding:1rem;border:1px solid var(--lap-line);border-radius:16px;background:linear-gradient(145deg,rgba(221,184,90,.055),rgba(255,255,255,.015))}.lap-profile-top{display:flex;align-items:center;gap:.7rem}.lap-avatar{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,#efd687,#b9892e);color:#161106;font-weight:900}.lap-profile strong,.lap-profile small{display:block}.lap-profile strong{font-size:.8rem}.lap-profile small{color:var(--lap-muted);font-size:.67rem;margin-top:.18rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lap-profile-meta{display:flex;justify-content:space-between;margin-top:.8rem;padding-top:.7rem;border-top:1px solid var(--lap-line-soft);font-size:.6rem;color:var(--lap-muted)}
      .lap-side-nav{display:grid;gap:.38rem}.lap-side-nav button{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:.55rem;width:100%;padding:.58rem .62rem;border:1px solid transparent;border-radius:10px;background:transparent;color:#b7b8b5;text-align:left;cursor:pointer}.lap-side-nav button:hover,.lap-side-nav button.active{border-color:var(--lap-line);background:rgba(221,184,90,.06);color:#fff}.lap-side-nav i{width:28px;height:28px;border:1px solid var(--lap-line);border-radius:8px;display:grid;place-items:center;color:var(--lap-gold);font-size:.62rem;font-style:normal;font-weight:900}.lap-side-nav b{font-size:.72rem}.lap-side-nav em{font-size:.62rem;font-style:normal;color:var(--lap-muted)}
      .lap-security{margin:0;padding:.82rem;border-left:2px solid var(--lap-gold);background:rgba(221,184,90,.04);color:var(--lap-muted);font-size:.66rem;line-height:1.55}.lap-side footer{margin-top:auto;display:grid;gap:.45rem}.lap-side footer button{width:100%;padding:.67rem;border:1px solid var(--lap-line);border-radius:10px;background:rgba(255,255,255,.015);color:#d9d7d0;cursor:pointer;font-size:.7rem;font-weight:700}.lap-side footer button:hover{border-color:var(--lap-gold);color:var(--lap-gold-soft)}
      .lap-main{min-width:0}.lap-top{min-height:76px;padding:1rem 1.4rem;border-bottom:1px solid var(--lap-line);display:flex;justify-content:space-between;align-items:center;gap:1rem}.lap-title span{display:block;color:var(--lap-gold);font-size:.57rem;font-weight:800;letter-spacing:.17em;text-transform:uppercase}.lap-title h1{font:700 1.45rem Georgia,serif;margin:.18rem 0 0}.lap-top-actions{display:flex;align-items:center;gap:.55rem}.lap-secure,.lap-updated{display:inline-flex;align-items:center;gap:.35rem;padding:.43rem .62rem;border:1px solid var(--lap-line);border-radius:999px;font-size:.61rem;color:var(--lap-muted)}.lap-secure{color:var(--lap-gold-soft)}.lap-secure i{width:6px;height:6px;border-radius:50%;background:var(--lap-success);box-shadow:0 0 10px var(--lap-success)}.lap-icon-button{width:34px;height:34px;border:1px solid var(--lap-line);border-radius:9px;background:transparent;color:var(--lap-gold-soft);cursor:pointer}
      .lap-content{padding:1.15rem 1.35rem 1.5rem}.lap-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem;margin-bottom:.8rem}.lap-metric{min-height:78px;padding:.85rem 1rem;border:1px solid var(--lap-line-soft);border-radius:13px;background:linear-gradient(145deg,rgba(255,255,255,.025),rgba(255,255,255,.01));display:grid;grid-template-columns:1fr auto;align-items:center}.lap-metric small,.lap-metric strong{display:block}.lap-metric small{color:var(--lap-muted);font-size:.62rem}.lap-metric strong{font:700 1.35rem Georgia,serif;margin-top:.15rem}.lap-metric i{width:34px;height:34px;border-radius:10px;background:rgba(221,184,90,.08);color:var(--lap-gold);display:grid;place-items:center;font-style:normal;font-size:.7rem;font-weight:900}.lap-metric.attention strong{color:var(--lap-danger)}.lap-metric.success strong{color:var(--lap-success)}
      .lap-controls{display:grid;grid-template-columns:minmax(260px,1fr) 220px auto;gap:.55rem;margin-bottom:.8rem}.lap-search{position:relative}.lap-search span{position:absolute;left:.8rem;top:50%;transform:translateY(-50%);color:var(--lap-muted)}.lap-controls input,.lap-controls select,.lap-comment-form select,.lap-comment-form textarea{width:100%;background:#07090d;border:1px solid var(--lap-line-soft);color:#fff;border-radius:10px;padding:.67rem .75rem;outline:none}.lap-controls input{padding-left:2.2rem}.lap-controls input:focus,.lap-controls select:focus,.lap-comment-form select:focus,.lap-comment-form textarea:focus{border-color:rgba(221,184,90,.58);box-shadow:0 0 0 3px rgba(221,184,90,.07)}.lap-secondary{border:1px solid var(--lap-line);border-radius:10px;padding:.65rem .85rem;background:transparent;color:#c9c6bd;cursor:pointer;font-size:.68rem;font-weight:700}.lap-secondary:hover{border-color:var(--lap-gold);color:var(--lap-gold-soft)}
      .lap-workspace{height:calc(100vh - 276px);min-height:620px;display:grid;grid-template-columns:minmax(250px,300px) minmax(390px,1fr) minmax(290px,330px);border:1px solid var(--lap-line);border-radius:16px;overflow:hidden;background:var(--lap-panel);box-shadow:0 24px 70px rgba(0,0,0,.24)}.lap-list-panel{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;border-right:1px solid var(--lap-line)}.lap-pane-head{padding:.82rem .9rem;border-bottom:1px solid var(--lap-line-soft);display:flex;align-items:center;justify-content:space-between}.lap-pane-head strong{font-size:.75rem}.lap-pane-head small{color:var(--lap-muted);font-size:.61rem}.lap-list{padding:.62rem;overflow:auto}.lap-doc{width:100%;display:grid;grid-template-columns:38px minmax(0,1fr);gap:.65rem;position:relative;text-align:left;padding:.78rem;border:1px solid transparent;border-radius:11px;background:transparent;color:#fff;margin-bottom:.42rem;cursor:pointer}.lap-doc:hover,.lap-doc.active{border-color:rgba(221,184,90,.48);background:linear-gradient(145deg,rgba(221,184,90,.075),rgba(255,255,255,.012))}.lap-doc.active:before{content:"";position:absolute;left:-1px;top:17%;height:66%;width:2px;background:var(--lap-gold)}.lap-doc-icon{display:grid;place-items:center;width:38px;height:42px;border-radius:9px;background:#17140d;color:var(--lap-gold);font-size:.55rem;font-weight:900}.lap-doc-copy{min-width:0}.lap-doc strong,.lap-doc small{display:block}.lap-doc strong{font-size:.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lap-doc small{color:var(--lap-muted);margin-top:.17rem;font-size:.59rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lap-doc .lap-doc-number{color:#cfc9ba}.lap-doc>.lap-badge{grid-column:2;justify-self:start;margin-top:.15rem}
      .lap-badge{display:inline-flex;padding:.2rem .43rem;border:1px solid var(--lap-line);border-radius:999px;color:var(--lap-gold);font-size:.56rem;text-transform:capitalize;white-space:nowrap}.lap-badge--reviewed{border-color:rgba(110,215,165,.28);color:var(--lap-success);background:rgba(110,215,165,.055)}.lap-badge--revision-required{border-color:rgba(240,154,146,.3);color:var(--lap-danger);background:rgba(240,154,146,.055)}
      .lap-preview-panel{display:grid;grid-template-rows:auto auto minmax(0,1fr);min-width:0;background:#11141b}.lap-document-head{padding:.8rem .9rem;border-bottom:1px solid var(--lap-line-soft);display:flex;align-items:center;justify-content:space-between;gap:.75rem}.lap-document-head>div{min-width:0}.lap-document-head span{display:block;color:var(--lap-gold);font-size:.52rem;font-weight:800;letter-spacing:.12em}.lap-document-head strong{display:block;font-size:.78rem;margin-top:.18rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lap-document-tools{display:flex;gap:.35rem;flex-shrink:0}.lap-tool{min-height:30px;padding:.38rem .55rem;border:1px solid var(--lap-line);border-radius:8px;background:#090b10;color:#d7d3c8;cursor:pointer;font-size:.6rem;font-weight:700}.lap-tool:hover{border-color:var(--lap-gold);color:var(--lap-gold-soft)}.lap-progress{padding:.75rem 1rem;border-bottom:1px solid var(--lap-line-soft);display:grid;grid-template-columns:repeat(4,1fr)}.lap-progress span{position:relative;display:grid;justify-items:center;gap:.3rem;color:#666b73}.lap-progress span:not(:last-child):after{content:"";position:absolute;top:10px;left:58%;width:84%;height:1px;background:#30343b}.lap-progress span.complete:not(:last-child):after{background:rgba(221,184,90,.55)}.lap-progress i{position:relative;z-index:1;width:21px;height:21px;border:1px solid #343840;border-radius:50%;background:#11141b;display:grid;place-items:center;font-size:.52rem;font-style:normal}.lap-progress small{font-size:.52rem}.lap-progress .complete{color:var(--lap-gold-soft)}.lap-progress .complete i{border-color:var(--lap-gold);background:rgba(221,184,90,.08)}.lap-progress .current i{box-shadow:0 0 0 4px rgba(221,184,90,.08)}
      .lap-preview{min-width:0;min-height:0;display:flex;overflow:hidden}.lap-preview-wrap{position:relative;display:flex;width:100%;min-height:0;background:#141820}.lap-frame{width:100%;height:100%;min-height:0;border:0;background:#fff}.lap-image-wrap{display:grid;place-items:center;width:100%;padding:1rem;overflow:auto}.lap-image-wrap img{max-width:100%;max-height:100%}.lap-watermark{position:absolute;inset:-12%;z-index:8;pointer-events:none;display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));grid-template-rows:repeat(5,1fr);align-items:center;justify-items:center;overflow:hidden;user-select:none}.lap-watermark span{max-width:330px;transform:rotate(-24deg);color:rgba(87,63,16,.32);font-size:clamp(.62rem,.85vw,.88rem);font-weight:900;letter-spacing:.08em;text-align:center;text-transform:uppercase;white-space:nowrap;text-shadow:0 1px rgba(255,255,255,.16);mix-blend-mode:multiply}.lap-exit-fullscreen{display:none;position:absolute;top:18px;right:18px;z-index:20;align-items:center;gap:.45rem;padding:.7rem .9rem;border:1px solid rgba(240,213,138,.55);border-radius:10px;background:rgba(7,9,13,.92);color:#f0d58a;box-shadow:0 12px 34px rgba(0,0,0,.34);backdrop-filter:blur(10px);cursor:pointer;font-size:.72rem;font-weight:900}.lap-exit-fullscreen:hover{background:#15120b;border-color:#f0d58a}.lap-preview-empty,.lap-empty{margin:auto;text-align:center;color:var(--lap-muted);padding:2rem}.lap-preview-empty>div,.lap-empty>span{width:58px;height:58px;border:1px solid var(--lap-line);border-radius:17px;display:grid;place-items:center;margin:0 auto 1rem;color:var(--lap-gold);font-weight:900}.lap-preview-empty h2{color:#ece8df;font:700 1.25rem Georgia,serif;margin:.4rem 0}.lap-preview-empty p,.lap-empty p{max-width:360px;line-height:1.6;font-size:.72rem}.lap-primary{border:0;border-radius:10px;padding:.72rem 1rem;background:linear-gradient(135deg,#f2d88d,#c99532);color:#151005;font-weight:900;cursor:pointer;font-size:.68rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}.lap-primary:hover{filter:brightness(1.04);box-shadow:0 10px 28px rgba(201,149,50,.16)}.lap-preview-wrap:fullscreen{background:#11141b}.lap-preview-wrap:fullscreen .lap-frame{height:100vh}.lap-preview-wrap:fullscreen .lap-exit-fullscreen{display:flex}
      .lap-review{min-width:0;border-left:1px solid var(--lap-line);padding:.9rem;overflow:auto;background:#0b0e14}.lap-review-head{padding-bottom:.75rem;border-bottom:1px solid var(--lap-line-soft)}.lap-review-head>span{font-size:.55rem;color:var(--lap-gold);letter-spacing:.14em}.lap-review-head h3{margin:.3rem 0 .55rem;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lap-review-head>div{display:flex;gap:.35rem;flex-wrap:wrap}.lap-instructions{display:grid;grid-template-columns:30px 1fr;gap:.65rem;border:1px solid var(--lap-line);border-radius:11px;padding:.7rem;margin-top:.7rem;background:rgba(221,184,90,.045)}.lap-instructions>span{width:28px;height:28px;border-radius:8px;background:rgba(221,184,90,.1);display:grid;place-items:center;color:var(--lap-gold);font-size:.58rem;font-weight:900}.lap-instructions strong{font-size:.66rem}.lap-instructions p{line-height:1.5;color:#b7b3aa;font-size:.64rem;margin:.25rem 0 0}.lap-section-title{display:flex;justify-content:space-between;align-items:center;margin:.9rem 0 .4rem}.lap-section-title span{font-size:.66rem;font-weight:800}.lap-section-title small{font-size:.56rem;color:var(--lap-muted)}.lap-thread{display:grid;gap:.5rem}.lap-thread article{border:1px solid var(--lap-line-soft);border-radius:11px;padding:.72rem;background:rgba(255,255,255,.016)}.lap-thread article>div{display:flex;justify-content:space-between;gap:.5rem}.lap-thread article>div strong{font-size:.63rem;color:#e5e1d7}.lap-thread time,.lap-thread small,.lap-muted{color:var(--lap-muted);font-size:.55rem}.lap-thread article>p{line-height:1.55;color:#cbc7bd;font-size:.66rem;margin:.45rem 0}.lap-thread blockquote{margin:.55rem 0 0;padding:.62rem;border-left:2px solid var(--lap-gold);background:#07090d}.lap-thread blockquote strong{font-size:.6rem;color:var(--lap-gold-soft)}.lap-thread blockquote p{font-size:.62rem;margin:.25rem 0}.lap-awaiting{display:inline-flex;margin-top:.2rem;color:#c8a95b!important}.lap-thread-empty{padding:1rem;border:1px dashed var(--lap-line);border-radius:11px;text-align:center;color:var(--lap-muted)}.lap-thread-empty span{color:var(--lap-gold)}.lap-thread-empty p{font-size:.62rem;line-height:1.5;margin:.35rem 0 0}.lap-comment-form{display:grid;gap:.6rem;margin-top:.8rem;padding-top:.1rem}.lap-comment-form label{display:grid;gap:.32rem;font-size:.64rem;color:#c7c4bc}.lap-comment-form select,.lap-comment-form textarea{padding:.62rem;font-size:.65rem;resize:vertical}.lap-field-help{color:var(--lap-muted);font-size:.55rem;line-height:1.4}
      @media(max-width:1320px){.lap-shell{grid-template-columns:220px minmax(0,1fr)}.lap-workspace{grid-template-columns:250px minmax(390px,1fr)}.lap-review{grid-column:1/-1;border-left:0;border-top:1px solid var(--lap-line);max-height:430px}.lap-workspace{height:auto;min-height:650px}.lap-preview-panel{min-height:650px}.lap-summary{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:900px){.lap-shell{grid-template-columns:1fr}.lap-side{position:relative;height:auto;display:grid;grid-template-columns:1fr 1fr}.lap-brand,.lap-side footer{grid-column:1/-1}.lap-side footer{display:flex}.lap-side-label,.lap-side-nav{display:none}.lap-content{padding:1rem}.lap-summary{grid-template-columns:repeat(2,1fr)}.lap-workspace{grid-template-columns:1fr}.lap-list-panel{border-right:0;border-bottom:1px solid var(--lap-line)}.lap-list{max-height:300px}.lap-preview-panel{min-height:650px}.lap-review{grid-column:auto}.lap-controls{grid-template-columns:1fr 180px}.lap-controls>.lap-secondary{grid-column:1/-1}.lap-top{align-items:flex-start}.lap-updated{display:none}}
      @media(max-width:600px){.lap-side{grid-template-columns:1fr}.lap-profile,.lap-security{grid-column:1}.lap-top{padding:1rem}.lap-secure{display:none}.lap-content{padding:.7rem}.lap-controls{grid-template-columns:1fr}.lap-controls>.lap-secondary{grid-column:auto}.lap-summary{grid-template-columns:1fr 1fr}.lap-metric{padding:.7rem}.lap-workspace{border-radius:12px}.lap-document-head{align-items:flex-start}.lap-document-tools{flex-wrap:wrap;justify-content:flex-end}.lap-progress small{display:none}}
    </style>
    <div class="lap-shell">
      <aside class="lap-side">
        <div class="lap-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><small>ADVOCATE PORTAL</small></div></div>
        <div class="lap-profile"><div class="lap-profile-top"><span class="lap-avatar">${esc(String(profile.name || "A").charAt(0).toUpperCase())}</span><div><strong>${esc(profile.name || "Advocate")}</strong><small>${esc(profile.firm || profile.bar_council_number || "External legal counsel")}</small></div></div><div class="lap-profile-meta"><span>Verified access</span><span>Encrypted</span></div><small>${esc(profile.email || "")}</small></div>
        <div><p class="lap-side-label">Workspace</p><nav class="lap-side-nav"><button class="${state.status === "all" ? "active" : ""}" type="button" data-status-shortcut="all"><i>LD</i><b>All documents</b><em>${metrics.total}</em></button><button class="${state.status === "pending" ? "active" : ""}" type="button" data-status-shortcut="pending"><i>AR</i><b>Awaiting review</b><em>${metrics.open}</em></button><button class="${state.status === "revision_required" ? "active" : ""}" type="button" data-status-shortcut="revision_required"><i>RV</i><b>Revisions</b><em>${metrics.revisions}</em></button><button class="${state.status === "reviewed" ? "active" : ""}" type="button" data-status-shortcut="reviewed"><i>OK</i><b>Reviewed</b><em>${metrics.reviewed}</em></button></nav></div>
        <p class="lap-security">Only documents explicitly shared with this account are visible. Preview, download and review activity is securely logged.</p>
        <footer><button id="switchPortalBtn" type="button">⇄ Switch portal</button><button id="advocateLogout" type="button">Sign out</button></footer>
      </aside>
      <main class="lap-main">
        <header class="lap-top"><div class="lap-title"><span>External counsel workspace</span><h1>Legal Review Centre</h1></div><div class="lap-top-actions"><span class="lap-updated">Updated ${esc(updated)}</span><span class="lap-secure"><i></i> Secure session</span><button class="lap-icon-button" id="refreshPortal" type="button" title="Refresh portal">↻</button></div></header>
        <div class="lap-content">
          <section class="lap-summary" aria-label="Review summary"><article class="lap-metric"><div><small>Shared documents</small><strong>${metrics.total}</strong></div><i>DOC</i></article><article class="lap-metric"><div><small>Awaiting action</small><strong>${metrics.open}</strong></div><i>ACT</i></article><article class="lap-metric ${metrics.revisions ? "attention" : ""}"><div><small>Revision requests</small><strong>${metrics.revisions}</strong></div><i>REV</i></article><article class="lap-metric success"><div><small>Completed reviews</small><strong>${metrics.reviewed}</strong></div><i>✓</i></article></section>
          <div class="lap-controls"><label class="lap-search"><span>⌕</span><input id="advocateSearch" value="${esc(state.query)}" placeholder="Search agreement, party or file" aria-label="Search shared legal documents"/></label><select id="advocateStatus" aria-label="Filter by review status"><option value="all">All review states</option><option value="pending" ${state.status === "pending" ? "selected" : ""}>Awaiting action</option>${["shared","opened","under_review","revision_required","reviewed"].map((value) => `<option value="${value}" ${state.status === value ? "selected" : ""}>${esc(statusLabel(value))}</option>`).join("")}</select><button class="lap-secondary" id="clearAdvocateFilters" type="button">Clear filters</button></div>
          <section class="lap-workspace">
            <div class="lap-list-panel"><header class="lap-pane-head"><strong>Document library</strong><small>${filteredShares().length} visible</small></header><div class="lap-list">${renderDocumentList()}</div></div>
            <section class="lap-preview-panel"><header class="lap-document-head"><div><span>${share ? esc(share.agreement_no) : "SECURE DOCUMENT PREVIEW"}</span><strong>${share ? esc(share.display_title || share.file_name) : "Select a document"}</strong></div><div class="lap-document-tools">${share ? `<button class="lap-tool" id="openPreviewToolbar" type="button">${state.previewUrl ? "Reload" : "Open"}</button>` : ""}${state.previewUrl ? `<button class="lap-tool" id="fullscreenPreview" type="button">Full screen</button>` : ""}${share && state.previewUrl && share.permission_level === "download" ? `<button class="lap-tool" id="downloadSharedFile" type="button">Download</button>` : ""}</div></header>${share ? reviewProgress(share.review_status) : `<div></div>`}<div class="lap-preview"><div class="lap-preview-wrap">${previewContent(share)}${previewWatermark}${state.previewUrl ? `<button class="lap-exit-fullscreen" id="exitFullscreenPreview" type="button"><span>✕</span> Exit full screen</button>` : ""}</div></div></section>
            ${renderReview(share)}
          </section>
        </div>
      </main>
    </div><div id="toastHost" class="toast-host" aria-live="polite"></div>`;
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
  document.getElementById("advocateSearch")?.addEventListener("input", (event) => { state.query = event.target.value; clearSelectionIfHidden(); render(); document.getElementById("advocateSearch")?.focus(); });
  document.getElementById("advocateStatus")?.addEventListener("change", (event) => { state.status = event.target.value; clearSelectionIfHidden(); render(); });
  document.querySelectorAll("[data-status-shortcut]").forEach((button) => button.addEventListener("click", () => { state.status = button.dataset.statusShortcut; clearSelectionIfHidden(); render(); }));
  const clearFilters = () => { state.query = ""; state.status = "all"; render(); };
  document.getElementById("clearAdvocateFilters")?.addEventListener("click", clearFilters);
  document.getElementById("clearFiltersEmpty")?.addEventListener("click", clearFilters);
  document.querySelectorAll("[data-share-id]").forEach((button) => button.addEventListener("click", () => { clearPreview(); state.selectedShareId = button.dataset.shareId; render(); }));
  document.getElementById("openPreviewBtn")?.addEventListener("click", openPreview);
  document.getElementById("openPreviewToolbar")?.addEventListener("click", openPreview);
  document.getElementById("fullscreenPreview")?.addEventListener("click", () => document.querySelector(".lap-preview-wrap")?.requestFullscreen?.());
  document.getElementById("exitFullscreenPreview")?.addEventListener("click", () => document.fullscreenElement && document.exitFullscreen?.());
  document.getElementById("refreshPortal")?.addEventListener("click", async () => {
    try { await load(); showToast("Legal workspace refreshed.", TOAST_TYPES.SUCCESS); }
    catch (error) { showToast(error.message || "The portal could not be refreshed.", TOAST_TYPES.ERROR); }
  });
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
  state.updatedAt = new Date();
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
