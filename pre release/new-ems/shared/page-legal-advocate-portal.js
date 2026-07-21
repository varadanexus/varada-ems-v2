import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { showToast } from "./utils.js";
import { advocatePortalLogout, requireAdvocatePortalSession } from "./legal-advocate-portal-auth.js";
import { addAdvocateComment, deleteAdvocateAnnotation, deleteAdvocateBookmark, fetchAdvocateSharedFile, getAdvocateDocumentMarks, getAdvocatePortalContext, getAdvocatePreviewOtpStatus, requestAdvocatePreviewOtp, saveAdvocateAnnotation, saveAdvocateBookmark, verifyAdvocatePreviewOtp } from "./legal-advocate-api.js";
import { mountSelectablePdf } from "./legal-pdf-selection.js?v=advocate-portal-12";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const ACTIVITY_WRITE_INTERVAL_MS = 10 * 1000;
const state = { session: null, context: { profile: {}, shares: [] }, selectedShareId: "", previewUrl: "", preview: null, query: "", status: "all", updatedAt: null, previewUnlocked: false, otpPrompt: null, otpBusy: false, activityTimer: null, inactivityCountdownTimer: null, inactivityPrompt: null, lastActivityWrite: 0, activePage: 1, pdfPageCount: 0, pdfZoom: 1, selectedText: null, inlineComposer: null, marksPanel: "", marks: { annotations: [], bookmarks: [] }, marksShareId: "", markDrawer: "", editingAnnotationId: "", editingBookmarkId: "", markBusy: false };

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

function documentHighlights() {
  return (state.marks.annotations || []).filter((row) => row.annotation_type === "highlight");
}

function documentAnnotations() {
  return (state.marks.annotations || []).filter((row) => row.annotation_type !== "highlight");
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
  if (!state.previewUrl) return `<div class="lap-preview-empty"><div>${state.previewUnlocked ? "OPEN" : "OTP"}</div><h2>${esc(share.display_title || share.file_name)}</h2><p>${state.previewUnlocked ? "Your secure preview session is unlocked." : "Verify once with the OTP sent to your registered WhatsApp number. Access remains unlocked until you sign out."}</p><button class="lap-primary" id="openPreviewBtn" type="button">${state.previewUnlocked ? "Open Secure Preview" : "Send OTP & Unlock"}</button></div>`;
  const type = state.preview?.contentType || share.mime_type || "";
  if (type.includes("pdf")) return `<section class="lap-pdf-viewer" id="legalPdfViewer" aria-label="Selectable PDF preview"><nav class="lap-pdf-toolbar" aria-label="PDF viewing controls"><div class="lap-pdf-toolbar-group"><span>Page <strong id="pdfCurrentPage">${esc(state.activePage)}</strong> of <strong id="pdfPageCount">${esc(state.pdfPageCount || "—")}</strong></span><span class="lap-pdf-scroll-hint">Scroll continuously to review every page</span></div><div class="lap-pdf-toolbar-group"><span>Select text to highlight, annotate or bookmark</span><button id="pdfZoomOut" type="button" aria-label="Zoom out">−</button><button id="pdfZoomReset" type="button" aria-label="Fit page width">Fit</button><button id="pdfZoomIn" type="button" aria-label="Zoom in">+</button></div></nav><div class="lap-pdf-scroll" id="legalPdfScroll"><div class="lap-pdf-pages" id="legalPdfPages"><div class="lap-pdf-loading" id="legalPdfLoading"><strong>Preparing continuous document</strong><span>Pages will load securely as you scroll…</span></div></div></div>${inlineMarkComposer()}${inlineMarksPanel()}</section>`;
  if (type.includes("html") || type.startsWith("text/")) return `<iframe class="lap-frame" sandbox="" src="${esc(state.previewUrl)}" title="${esc(share.display_title || share.file_name)}"></iframe>`;
  if (type.startsWith("image/")) return `<div class="lap-image-wrap"><img src="${esc(state.previewUrl)}" alt="${esc(share.display_title || share.file_name)}" /></div>`;
  return `<div class="lap-preview-empty"><div>DOC</div><h2>Preview is not available for this file type</h2><p>Use Download if the document owner enabled it.</p></div>`;
}

function inlineMarkComposer() {
  const composer = state.inlineComposer;
  if (!composer) return "";
  const quote = String(composer.quotedText || "");
  if (composer.kind === "annotation") return `<section class="lap-inline-composer" aria-label="Add annotation"><header><div><span>SELECTED TEXT · PAGE ${esc(composer.pageNumber)}</span><strong>${composer.id ? "Edit annotation" : "Annotate selection"}</strong></div><button id="closeInlineComposer" type="button" aria-label="Close">✕</button></header>${quote ? `<blockquote class="lap-selection-quote">${esc(quote)}</blockquote>` : ""}<form id="annotationForm" class="lap-mark-form"><input type="hidden" name="id" value="${esc(composer.id || "")}"/><input type="hidden" name="pageNumber" value="${esc(composer.pageNumber)}"/><input type="hidden" name="quotedText" value="${esc(quote)}"/><div class="lap-mark-grid"><label>Type<select name="annotationType"><option value="note">Note</option><option value="question">Question</option><option value="important">Important</option></select></label><label>Colour<input name="color" type="color" value="${esc(composer.color || "#ddb85a")}" /></label></div><label>Annotation<textarea name="body" rows="3" maxlength="4000" required autofocus placeholder="Write your note about the selected text…">${esc(composer.body || "")}</textarea></label><div class="lap-mark-form-actions"><button class="lap-primary" type="submit" ${state.markBusy ? "disabled" : ""}>${state.markBusy ? "Saving…" : "Save annotation"}</button><button class="lap-secondary" id="cancelInlineComposer" type="button">Cancel</button></div></form></section>`;
  const suggestedLabel = String(composer.label || quote || `Page ${composer.pageNumber}`).slice(0, 160);
  return `<section class="lap-inline-composer" aria-label="Add bookmark"><header><div><span>SELECTED TEXT · PAGE ${esc(composer.pageNumber)}</span><strong>${composer.id ? "Edit bookmark" : "Bookmark selection"}</strong></div><button id="closeInlineComposer" type="button" aria-label="Close">✕</button></header>${quote ? `<blockquote class="lap-selection-quote">${esc(quote)}</blockquote>` : ""}<form id="bookmarkForm" class="lap-mark-form"><input type="hidden" name="id" value="${esc(composer.id || "")}"/><input type="hidden" name="pageNumber" value="${esc(composer.pageNumber)}"/><label>Bookmark label<input name="label" maxlength="160" value="${esc(suggestedLabel)}" required /></label><label>Optional note<textarea name="note" rows="2" maxlength="1000" placeholder="Add context for other authorised reviewers…">${esc(composer.note || "")}</textarea></label><div class="lap-mark-form-actions"><button class="lap-primary" type="submit" ${state.markBusy ? "disabled" : ""}>${state.markBusy ? "Saving…" : "Save bookmark"}</button><button class="lap-secondary" id="cancelInlineComposer" type="button">Cancel</button></div></form></section>`;
}

function inlineMarksPanel() {
  if (!state.marksPanel) return "";
  const annotations = documentAnnotations();
  const highlights = documentHighlights();
  const bookmarks = state.marks.bookmarks || [];
  const isAnnotations = state.marksPanel === "annotations";
  const isHighlights = state.marksPanel === "highlights";
  const rows = isAnnotations ? annotations : isHighlights ? highlights : bookmarks;
  const label = isAnnotations ? "annotations" : isHighlights ? "highlights" : "bookmarks";
  const hint = isAnnotations ? "Select text in the PDF, then choose Annotate to add a comment." : isHighlights ? "Highlights appear directly over the selected PDF text. No annotation note is required." : "Select text in the PDF, then choose Bookmark.";
  return `<aside class="lap-inline-marks" aria-label="Shared ${label}"><header><div><span>VISIBLE TO ALL AUTHORISED REVIEWERS</span><strong>Document ${label} (${rows.length})</strong></div><button id="closeInlineMarks" type="button" aria-label="Close">✕</button></header><div class="lap-inline-marks-body"><p class="lap-inline-marks-hint">${hint}</p><div class="lap-mark-list">${rows.length ? rows.map((row) => isAnnotations ? `<article class="lap-mark-card" style="--mark-color:${esc(row.color || "#ddb85a")}"><div class="lap-mark-card-head"><span>${esc(statusLabel(row.annotation_type))} · Page ${esc(row.page_number)}</span><small>${esc(row.author_name || "Reviewer")} · ${esc(dateTime(row.updated_at || row.created_at))}</small></div>${row.quoted_text ? `<blockquote>${esc(row.quoted_text)}</blockquote>` : ""}<p>${esc(row.body)}</p><div class="lap-mark-card-actions"><button type="button" data-mark-page="${esc(row.page_number)}">Go to page</button>${row.can_edit ? `<button type="button" data-edit-annotation="${esc(row.id)}">Edit</button><button class="danger" type="button" data-delete-annotation="${esc(row.id)}">Delete</button>` : ""}</div></article>` : isHighlights ? `<article class="lap-mark-card lap-highlight-card" style="--mark-color:${esc(row.color || "#ffe45c")}"><div class="lap-mark-card-head"><span>Highlight · Page ${esc(row.page_number)}</span><small>${esc(row.author_name || "Reviewer")} · ${esc(dateTime(row.updated_at || row.created_at))}</small></div>${row.quoted_text ? `<blockquote>${esc(row.quoted_text)}</blockquote>` : ""}<div class="lap-mark-card-actions"><button type="button" data-mark-page="${esc(row.page_number)}">Go to page</button>${row.can_edit ? `<button class="danger" type="button" data-delete-annotation="${esc(row.id)}">Remove highlight</button>` : ""}</div></article>` : `<article class="lap-mark-card lap-bookmark-card"><div class="lap-mark-card-head"><span>Page ${esc(row.page_number)} · ${esc(row.label)}</span><small>${esc(row.author_name || "Reviewer")} · ${esc(dateTime(row.updated_at || row.created_at))}</small></div>${row.note ? `<p>${esc(row.note)}</p>` : ""}<div class="lap-mark-card-actions"><button type="button" data-mark-page="${esc(row.page_number)}">Go to page</button>${row.can_edit ? `<button type="button" data-edit-bookmark="${esc(row.id)}">Edit</button><button class="danger" type="button" data-delete-bookmark="${esc(row.id)}">Delete</button>` : ""}</div></article>`).join("") : `<div class="lap-mark-empty">No ${label} yet. Select text in the PDF to add the first one.</div>`}</div></div></aside>`;
}

function annotationDrawer(share) {
  if (state.markDrawer !== "annotations" || !share) return "";
  const rows = state.marks.annotations || [];
  const editing = rows.find((row) => row.id === state.editingAnnotationId) || null;
  return `<div class="lap-mark-backdrop" id="closeMarkBackdrop"><aside class="lap-mark-drawer" role="dialog" aria-modal="true" aria-labelledby="markDrawerTitle"><header><div><span>COLLABORATIVE REVIEW</span><h2 id="markDrawerTitle">Document annotations</h2></div><button id="closeMarkDrawer" type="button" aria-label="Close annotations">✕</button></header><p class="lap-mark-visibility">Visible to everyone authorised to access this document. The original file is never changed.</p><form id="annotationForm" class="lap-mark-form"><input type="hidden" name="id" value="${esc(editing?.id || "")}"/><div class="lap-mark-grid"><label>Page<input name="pageNumber" type="number" min="1" max="100000" value="${esc(editing?.page_number || state.activePage || 1)}" required /></label><label>Type<select name="annotationType"><option value="note" ${editing?.annotation_type === "note" ? "selected" : ""}>Note</option><option value="question" ${editing?.annotation_type === "question" ? "selected" : ""}>Question</option><option value="important" ${editing?.annotation_type === "important" ? "selected" : ""}>Important</option><option value="highlight" ${editing?.annotation_type === "highlight" ? "selected" : ""}>Highlight reference</option></select></label><label>Colour<input name="color" type="color" value="${esc(editing?.color || "#ddb85a")}" /></label></div><label>Quoted text or clause reference<input name="quotedText" maxlength="1000" value="${esc(editing?.quoted_text || "")}" placeholder="Optional clause, paragraph or selected text" /></label><label>Annotation<textarea name="body" rows="4" maxlength="4000" required placeholder="Write a clear collaborative annotation...">${esc(editing?.body || "")}</textarea></label><div class="lap-mark-form-actions"><button class="lap-primary" type="submit" ${state.markBusy ? "disabled" : ""}>${state.markBusy ? "Saving..." : editing ? "Update annotation" : "Add annotation"}</button>${editing ? `<button class="lap-secondary" id="cancelEditAnnotation" type="button">Cancel edit</button>` : ""}</div></form><div class="lap-mark-list-head"><strong>${rows.length} annotation${rows.length === 1 ? "" : "s"}</strong><small>All authorised reviewers</small></div><div class="lap-mark-list">${rows.length ? rows.map((row) => `<article class="lap-mark-card" style="--mark-color:${esc(row.color || "#ddb85a")}"><div class="lap-mark-card-head"><span>${esc(statusLabel(row.annotation_type))} · Page ${esc(row.page_number)}</span><small>${esc(row.author_name || "Reviewer")} · ${esc(dateTime(row.updated_at || row.created_at))}</small></div>${row.quoted_text ? `<blockquote>${esc(row.quoted_text)}</blockquote>` : ""}<p>${esc(row.body)}</p><div class="lap-mark-card-actions"><button type="button" data-mark-page="${esc(row.page_number)}">Go to page</button>${row.can_edit ? `<button type="button" data-edit-annotation="${esc(row.id)}">Edit</button><button class="danger" type="button" data-delete-annotation="${esc(row.id)}">Delete</button>` : ""}</div></article>`).join("") : `<div class="lap-mark-empty">No annotations yet. Add the first page-aware note above.</div>`}</div></aside></div>`;
}

function bookmarkDrawer(share) {
  if (state.markDrawer !== "bookmarks" || !share) return "";
  const rows = state.marks.bookmarks || [];
  const editing = rows.find((row) => row.id === state.editingBookmarkId) || null;
  return `<div class="lap-mark-backdrop" id="closeMarkBackdrop"><aside class="lap-mark-drawer" role="dialog" aria-modal="true" aria-labelledby="markDrawerTitle"><header><div><span>SHARED NAVIGATION</span><h2 id="markDrawerTitle">Document bookmarks</h2></div><button id="closeMarkDrawer" type="button" aria-label="Close bookmarks">✕</button></header><p class="lap-mark-visibility">Add as many bookmarks as needed. Everyone authorised for this document can see and use them.</p><form id="bookmarkForm" class="lap-mark-form"><input type="hidden" name="id" value="${esc(editing?.id || "")}"/><div class="lap-mark-grid lap-bookmark-grid"><label>Page<input name="pageNumber" type="number" min="1" max="100000" value="${esc(editing?.page_number || state.activePage || 1)}" required /></label><label>Bookmark label<input name="label" maxlength="160" value="${esc(editing?.label || "")}" required placeholder="e.g. Payment terms" /></label></div><label>Optional note<textarea name="note" rows="3" maxlength="1000" placeholder="Why this page is important...">${esc(editing?.note || "")}</textarea></label><div class="lap-mark-form-actions"><button class="lap-primary" type="submit" ${state.markBusy ? "disabled" : ""}>${state.markBusy ? "Saving..." : editing ? "Update bookmark" : "Add bookmark"}</button>${editing ? `<button class="lap-secondary" id="cancelEditBookmark" type="button">Cancel edit</button>` : ""}</div></form><div class="lap-mark-list-head"><strong>${rows.length} bookmark${rows.length === 1 ? "" : "s"}</strong><small>Multiple bookmarks supported</small></div><div class="lap-mark-list">${rows.length ? rows.map((row) => `<article class="lap-mark-card lap-bookmark-card"><div class="lap-mark-card-head"><span>Page ${esc(row.page_number)} · ${esc(row.label)}</span><small>${esc(row.author_name || "Reviewer")} · ${esc(dateTime(row.updated_at || row.created_at))}</small></div>${row.note ? `<p>${esc(row.note)}</p>` : ""}<div class="lap-mark-card-actions"><button type="button" data-mark-page="${esc(row.page_number)}">Go to page</button>${row.can_edit ? `<button type="button" data-edit-bookmark="${esc(row.id)}">Edit</button><button class="danger" type="button" data-delete-bookmark="${esc(row.id)}">Delete</button>` : ""}</div></article>`).join("") : `<div class="lap-mark-empty">No bookmarks yet. You can add multiple bookmarks for this document.</div>`}</div></aside></div>`;
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
    <div class="lap-shell"><aside class="lap-side"><div class="lap-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><small>ADVOCATE PORTAL</small></div></div><div class="lap-profile"><span>SECURE LEGAL REVIEW</span><strong>${esc(profile.name || "Advocate")}</strong><small>ADVOCATE</small><small>${esc(profile.email || "")}</small></div><p class="lap-security">Only documents explicitly shared with this account are visible. All access and review activity is logged.</p><footer><button id="switchPortalBtn" type="button" style="margin-bottom:.55rem">Switch Portal</button><button id="advocateLogout" type="button">Sign out</button></footer></aside><main class="lap-main"><header class="lap-top"><h1>Legal Document Review</h1><span class="lap-secure">● Encrypted session</span></header><div class="lap-content"><div class="lap-controls"><input id="advocateSearch" value="${esc(state.query)}" placeholder="Search agreements, parties or files"/><select id="advocateStatus"><option value="all">All review states</option>${["shared","opened","under_review","revision_required","reviewed"].map((value) => `<option value="${value}" ${state.status === value ? "selected" : ""}>${esc(value.replace(/_/g," "))}</option>`).join("")}</select></div><div class="lap-workspace"><section class="lap-list">${renderDocumentList()}</section><section class="lap-preview"><div class="lap-preview-wrap">${previewContent(share)}${share && state.previewUrl && share.permission_level === "download" ? `<div class="lap-toolbar"><button class="lap-primary" id="downloadSharedFile" type="button">Download</button></div>` : ""}</div></section>${renderReview(share)}</div></div></main></div><div id="toastHost" class="toast-host" aria-live="polite"></div>`;
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
  const annotations = documentAnnotations();
  const highlights = documentHighlights();
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
      .lap-preview{min-width:0;min-height:0;display:flex;overflow:hidden}.lap-preview-wrap{position:relative;display:flex;width:100%;min-height:0;background:#141820}.lap-frame{width:100%;height:100%;min-height:0;border:0;background:#fff}.lap-image-wrap{display:grid;place-items:center;width:100%;padding:1rem;overflow:auto}.lap-image-wrap img{max-width:100%;max-height:100%}.lap-watermark{position:absolute;inset:-12%;z-index:8;pointer-events:none;display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));grid-template-rows:repeat(5,1fr);align-items:center;justify-items:center;overflow:hidden;user-select:none}.lap-watermark span{max-width:330px;transform:rotate(-24deg);color:rgba(87,63,16,.32);font-size:clamp(.62rem,.85vw,.88rem);font-weight:900;letter-spacing:.08em;text-align:center;text-transform:uppercase;white-space:nowrap;text-shadow:0 1px rgba(255,255,255,.16);mix-blend-mode:multiply}.lap-exit-fullscreen{display:none;position:absolute;top:18px;right:18px;z-index:20;align-items:center;gap:.45rem;padding:.7rem .9rem;border:1px solid rgba(240,213,138,.55);border-radius:10px;background:rgba(7,9,13,.92);color:#f0d58a;box-shadow:0 12px 34px rgba(0,0,0,.34);backdrop-filter:blur(10px);cursor:pointer;font-size:.72rem;font-weight:900}.lap-exit-fullscreen:hover{background:#15120b;border-color:#f0d58a}.lap-preview-empty,.lap-empty{margin:auto;text-align:center;color:var(--lap-muted);padding:2rem}.lap-preview-empty{width:min(440px,100%);min-height:100%;display:grid;justify-items:center;align-content:center}.lap-preview-empty>div,.lap-empty>span{width:58px;height:58px;border:1px solid var(--lap-line);border-radius:17px;display:grid;place-items:center;margin:0 auto 1rem;color:var(--lap-gold);font-weight:900}.lap-preview-empty h2{color:#ece8df;font:700 1.25rem Georgia,serif;margin:.4rem 0}.lap-preview-empty p,.lap-empty p{max-width:360px;line-height:1.6;font-size:.72rem}.lap-preview-empty p{margin:.35rem auto 1rem}.lap-primary{border:0;border-radius:10px;padding:.72rem 1rem;background:linear-gradient(135deg,#f2d88d,#c99532);color:#151005;font-weight:900;cursor:pointer;font-size:.68rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}.lap-primary:hover{filter:brightness(1.04);box-shadow:0 10px 28px rgba(201,149,50,.16)}.lap-primary:disabled{opacity:.58;cursor:wait}.lap-preview-wrap:fullscreen{background:#11141b}.lap-preview-wrap:fullscreen .lap-frame{height:100vh}.lap-preview-wrap:fullscreen .lap-exit-fullscreen{display:flex}
      .lap-modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:1rem;background:rgba(1,2,4,.82);backdrop-filter:blur(12px)}.lap-otp-modal{width:min(430px,100%);border:1px solid rgba(221,184,90,.42);border-radius:18px;padding:1.35rem;background:linear-gradient(145deg,#11141a,#080a0e);box-shadow:0 30px 100px rgba(0,0,0,.65);color:var(--lap-text)}.lap-otp-mark{width:48px;height:48px;border:1px solid var(--lap-line);border-radius:14px;display:grid;place-items:center;color:var(--lap-gold);font-weight:900}.lap-otp-modal h2{font:700 1.35rem Georgia,serif;margin:.9rem 0 .35rem}.lap-otp-modal>p{color:var(--lap-muted);font-size:.72rem;line-height:1.55;margin:.25rem 0}.lap-otp-phone{display:block;color:var(--lap-gold-soft);font-weight:800;margin-top:.35rem}.lap-otp-form{display:grid;gap:.75rem;margin-top:1rem}.lap-otp-form label{display:grid;gap:.35rem;color:#cbc7bd;font-size:.66rem}.lap-otp-form input{width:100%;padding:.85rem;border:1px solid var(--lap-line);border-radius:10px;background:#05070a;color:#fff;text-align:center;font-size:1.3rem;font-weight:900;letter-spacing:.55em;outline:none}.lap-otp-form input:focus{border-color:var(--lap-gold);box-shadow:0 0 0 4px rgba(221,184,90,.08)}.lap-otp-actions{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}.lap-otp-actions .lap-primary{grid-column:1/-1}.lap-otp-note{padding-top:.8rem!important;margin-top:.8rem!important;border-top:1px solid var(--lap-line-soft)}
      .lap-timeout-modal{text-align:center}.lap-timeout-modal .lap-otp-mark{margin:0 auto}.lap-timeout-count{width:82px;height:82px;margin:1rem auto;border:2px solid var(--lap-gold);border-radius:50%;display:grid;place-items:center;color:var(--lap-gold-soft);font:700 1.65rem Georgia,serif;box-shadow:0 0 0 7px rgba(221,184,90,.06)}.lap-timeout-modal .lap-primary{width:100%;margin-top:1rem;justify-content:center}
      .lap-page-marks{position:absolute;left:12px;bottom:12px;z-index:12;display:flex;gap:.4rem;pointer-events:none}.lap-page-marks span{padding:.38rem .55rem;border:1px solid rgba(221,184,90,.45);border-radius:999px;background:rgba(7,9,13,.88);color:var(--lap-gold-soft);font-size:.58rem;font-weight:800;backdrop-filter:blur(8px)}.lap-mark-backdrop{position:fixed;inset:0;z-index:950;background:rgba(0,0,0,.58);backdrop-filter:blur(5px)}.lap-mark-drawer{position:absolute;top:0;right:0;width:min(480px,100%);height:100%;display:flex;flex-direction:column;padding:1.15rem;background:linear-gradient(180deg,#11141a,#080a0e);border-left:1px solid rgba(221,184,90,.35);box-shadow:-25px 0 70px rgba(0,0,0,.5);color:var(--lap-text);overflow:hidden}.lap-mark-drawer>header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding-bottom:.9rem;border-bottom:1px solid var(--lap-line)}.lap-mark-drawer>header span{color:var(--lap-gold);font-size:.55rem;font-weight:900;letter-spacing:.14em}.lap-mark-drawer h2{font:700 1.35rem Georgia,serif;margin:.2rem 0 0}.lap-mark-drawer>header button{width:34px;height:34px;border:1px solid var(--lap-line);border-radius:9px;background:transparent;color:#fff;cursor:pointer}.lap-mark-visibility{margin:.8rem 0;padding:.7rem;border-left:2px solid var(--lap-gold);background:rgba(221,184,90,.045);color:var(--lap-muted);font-size:.65rem;line-height:1.5}.lap-mark-form{display:grid;gap:.65rem;padding-bottom:.9rem;border-bottom:1px solid var(--lap-line)}.lap-mark-form label{display:grid;gap:.3rem;color:#c9c5bb;font-size:.62rem}.lap-mark-form input,.lap-mark-form select,.lap-mark-form textarea{width:100%;padding:.62rem;border:1px solid var(--lap-line-soft);border-radius:9px;background:#06080c;color:#fff;outline:none;resize:vertical}.lap-mark-form input:focus,.lap-mark-form select:focus,.lap-mark-form textarea:focus{border-color:var(--lap-gold);box-shadow:0 0 0 3px rgba(221,184,90,.07)}.lap-mark-form input[type="color"]{height:39px;padding:.2rem}.lap-mark-grid{display:grid;grid-template-columns:80px 1fr 72px;gap:.5rem}.lap-bookmark-grid{grid-template-columns:90px 1fr}.lap-mark-form-actions{display:flex;gap:.5rem}.lap-mark-form-actions .lap-primary{flex:1;justify-content:center}.lap-mark-list-head{display:flex;justify-content:space-between;align-items:center;padding:.85rem 0 .55rem}.lap-mark-list-head strong{font-size:.72rem}.lap-mark-list-head small{font-size:.58rem;color:var(--lap-muted)}.lap-mark-list{min-height:0;overflow:auto;display:grid;align-content:start;gap:.55rem;padding-right:.15rem}.lap-mark-card{position:relative;border:1px solid var(--lap-line-soft);border-left:3px solid var(--mark-color,#ddb85a);border-radius:10px;padding:.75rem;background:rgba(255,255,255,.018)}.lap-bookmark-card{border-left-color:var(--lap-gold)}.lap-mark-card-head{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start}.lap-mark-card-head span{color:#eee9dd;font-size:.66rem;font-weight:800}.lap-mark-card-head small{color:var(--lap-muted);font-size:.52rem;text-align:right}.lap-mark-card blockquote{margin:.55rem 0 0;padding:.55rem;border-left:2px solid var(--mark-color,#ddb85a);background:#07090d;color:#aaa69c;font-size:.6rem;line-height:1.45}.lap-mark-card p{margin:.55rem 0;color:#d3cfc5;font-size:.65rem;line-height:1.55;white-space:pre-wrap}.lap-mark-card-actions{display:flex;gap:.35rem;margin-top:.55rem}.lap-mark-card-actions button{padding:.38rem .55rem;border:1px solid var(--lap-line);border-radius:7px;background:transparent;color:#d8d4ca;cursor:pointer;font-size:.56rem}.lap-mark-card-actions button:hover{border-color:var(--lap-gold);color:var(--lap-gold-soft)}.lap-mark-card-actions button.danger{color:var(--lap-danger)}.lap-mark-empty{padding:1.2rem;border:1px dashed var(--lap-line);border-radius:10px;color:var(--lap-muted);font-size:.65rem;line-height:1.5;text-align:center}
      .lap-review{min-width:0;border-left:1px solid var(--lap-line);padding:.9rem;overflow:auto;background:#0b0e14}.lap-review-head{padding-bottom:.75rem;border-bottom:1px solid var(--lap-line-soft)}.lap-review-head>span{font-size:.55rem;color:var(--lap-gold);letter-spacing:.14em}.lap-review-head h3{margin:.3rem 0 .55rem;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lap-review-head>div{display:flex;gap:.35rem;flex-wrap:wrap}.lap-instructions{display:grid;grid-template-columns:30px 1fr;gap:.65rem;border:1px solid var(--lap-line);border-radius:11px;padding:.7rem;margin-top:.7rem;background:rgba(221,184,90,.045)}.lap-instructions>span{width:28px;height:28px;border-radius:8px;background:rgba(221,184,90,.1);display:grid;place-items:center;color:var(--lap-gold);font-size:.58rem;font-weight:900}.lap-instructions strong{font-size:.66rem}.lap-instructions p{line-height:1.5;color:#b7b3aa;font-size:.64rem;margin:.25rem 0 0}.lap-section-title{display:flex;justify-content:space-between;align-items:center;margin:.9rem 0 .4rem}.lap-section-title span{font-size:.66rem;font-weight:800}.lap-section-title small{font-size:.56rem;color:var(--lap-muted)}.lap-thread{display:grid;gap:.5rem}.lap-thread article{border:1px solid var(--lap-line-soft);border-radius:11px;padding:.72rem;background:rgba(255,255,255,.016)}.lap-thread article>div{display:flex;justify-content:space-between;gap:.5rem}.lap-thread article>div strong{font-size:.63rem;color:#e5e1d7}.lap-thread time,.lap-thread small,.lap-muted{color:var(--lap-muted);font-size:.55rem}.lap-thread article>p{line-height:1.55;color:#cbc7bd;font-size:.66rem;margin:.45rem 0}.lap-thread blockquote{margin:.55rem 0 0;padding:.62rem;border-left:2px solid var(--lap-gold);background:#07090d}.lap-thread blockquote strong{font-size:.6rem;color:var(--lap-gold-soft)}.lap-thread blockquote p{font-size:.62rem;margin:.25rem 0}.lap-awaiting{display:inline-flex;margin-top:.2rem;color:#c8a95b!important}.lap-thread-empty{padding:1rem;border:1px dashed var(--lap-line);border-radius:11px;text-align:center;color:var(--lap-muted)}.lap-thread-empty span{color:var(--lap-gold)}.lap-thread-empty p{font-size:.62rem;line-height:1.5;margin:.35rem 0 0}.lap-comment-form{display:grid;gap:.6rem;margin-top:.8rem;padding-top:.1rem}.lap-comment-form label{display:grid;gap:.32rem;font-size:.64rem;color:#c7c4bc}.lap-comment-form select,.lap-comment-form textarea{padding:.62rem;font-size:.65rem;resize:vertical}.lap-field-help{color:var(--lap-muted);font-size:.55rem;line-height:1.4}
      @media(max-width:1320px){.lap-shell{grid-template-columns:220px minmax(0,1fr)}.lap-workspace{grid-template-columns:250px minmax(390px,1fr)}.lap-review{grid-column:1/-1;border-left:0;border-top:1px solid var(--lap-line);max-height:430px}.lap-workspace{height:auto;min-height:650px}.lap-preview-panel{min-height:650px}.lap-summary{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:900px){.lap-shell{grid-template-columns:1fr}.lap-side{position:relative;height:auto;display:grid;grid-template-columns:1fr 1fr}.lap-brand,.lap-side footer{grid-column:1/-1}.lap-side footer{display:flex}.lap-side-label,.lap-side-nav{display:none}.lap-content{padding:1rem}.lap-summary{grid-template-columns:repeat(2,1fr)}.lap-workspace{grid-template-columns:1fr}.lap-list-panel{border-right:0;border-bottom:1px solid var(--lap-line)}.lap-list{max-height:300px}.lap-preview-panel{min-height:650px}.lap-review{grid-column:auto}.lap-controls{grid-template-columns:1fr 180px}.lap-controls>.lap-secondary{grid-column:1/-1}.lap-top{align-items:flex-start}.lap-updated{display:none}}
      @media(max-width:600px){.lap-side{grid-template-columns:1fr}.lap-profile,.lap-security{grid-column:1}.lap-top{padding:1rem}.lap-secure{display:none}.lap-content{padding:.7rem}.lap-controls{grid-template-columns:1fr}.lap-controls>.lap-secondary{grid-column:auto}.lap-summary{grid-template-columns:1fr 1fr}.lap-metric{padding:.7rem}.lap-workspace{border-radius:12px}.lap-document-head{align-items:flex-start}.lap-document-tools{flex-wrap:wrap;justify-content:flex-end}.lap-progress small{display:none}}
    </style>
    <div class="lap-shell">
      <aside class="lap-side">
        <div class="lap-brand"><img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus"/><div><strong>VARADA NEXUS</strong><small>ADVOCATE PORTAL</small></div></div>
        <div class="lap-profile"><div class="lap-profile-top"><span class="lap-avatar">${esc(String(profile.name || "A").charAt(0).toUpperCase())}</span><div><strong>${esc(profile.name || "Advocate")}</strong><small>ADVOCATE</small></div></div><div class="lap-profile-meta"><span>Verified access</span><span>Encrypted</span></div><small>${esc(profile.email || "")}</small></div>
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
            <section class="lap-preview-panel"><header class="lap-document-head"><div><span>${share ? esc(share.agreement_no) : "SECURE DOCUMENT PREVIEW"}</span><strong>${share ? esc(share.display_title || share.file_name) : "Select a document"}</strong></div><div class="lap-document-tools">${share ? `<button class="lap-tool" id="openPreviewToolbar" type="button">${state.previewUrl ? "Reload" : "Open"}</button>` : ""}${share && state.previewUnlocked ? `<button class="lap-tool" id="openHighlights" type="button">Highlights ${highlights.length ? `(${highlights.length})` : ""}</button><button class="lap-tool" id="openAnnotations" type="button">Annotations ${annotations.length ? `(${annotations.length})` : ""}</button><button class="lap-tool" id="openBookmarks" type="button">Bookmarks ${state.marks.bookmarks.length ? `(${state.marks.bookmarks.length})` : ""}</button>` : ""}${state.previewUrl ? `<button class="lap-tool" id="fullscreenPreview" type="button">Full screen</button>` : ""}${share && state.previewUrl && share.permission_level === "download" ? `<button class="lap-tool" id="downloadSharedFile" type="button">Download</button>` : ""}</div></header>${share ? reviewProgress(share.review_status) : `<div></div>`}<div class="lap-preview"><div class="lap-preview-wrap">${previewContent(share)}${previewWatermark}${state.previewUrl ? `<div class="lap-page-marks"><span>Page ${esc(state.activePage)}</span>${highlights.filter((row) => Number(row.page_number) === Number(state.activePage)).length ? `<span>${highlights.filter((row) => Number(row.page_number) === Number(state.activePage)).length} highlight(s)</span>` : ""}${annotations.filter((row) => Number(row.page_number) === Number(state.activePage)).length ? `<span>${annotations.filter((row) => Number(row.page_number) === Number(state.activePage)).length} annotation(s)</span>` : ""}${state.marks.bookmarks.filter((row) => Number(row.page_number) === Number(state.activePage)).length ? `<span>${state.marks.bookmarks.filter((row) => Number(row.page_number) === Number(state.activePage)).length} bookmark(s)</span>` : ""}</div><button class="lap-exit-fullscreen" id="exitFullscreenPreview" type="button"><span>✕</span> Exit full screen</button>` : ""}</div></div></section>
            ${renderReview(share)}
          </section>
        </div>
      </main>
    </div>${state.inactivityPrompt ? `<div class="lap-modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="inactivityTitle"><section class="lap-otp-modal lap-timeout-modal"><div class="lap-otp-mark">IDLE</div><h2 id="inactivityTitle">Are you still active?</h2><p>No activity was detected for 30 minutes. Confirm below to keep this secure portal session open.</p><div class="lap-timeout-count" aria-label="${state.inactivityPrompt.seconds} seconds remaining">${state.inactivityPrompt.seconds}</div><button class="lap-primary" id="stayActiveBtn" type="button">I’m Active — Keep Me Signed In</button><p class="lap-otp-note">For your security, you will be signed out automatically when the countdown reaches zero.</p></section></div>` : state.otpPrompt ? `<div class="lap-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="previewOtpTitle"><section class="lap-otp-modal"><div class="lap-otp-mark">OTP</div><h2 id="previewOtpTitle">Unlock legal document preview</h2><p>A six-digit verification code was sent to the registered WhatsApp number.</p><span class="lap-otp-phone">${esc(state.otpPrompt.maskedPhone || "Registered mobile")}</span><form class="lap-otp-form" id="previewOtpForm"><label>Verification code<input id="previewOtpInput" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="••••••" required /></label><div class="lap-otp-actions"><button class="lap-primary" type="submit" ${state.otpBusy ? "disabled" : ""}>${state.otpBusy ? "Verifying..." : "Verify & Open"}</button><button class="lap-secondary" id="resendPreviewOtp" type="button" ${state.otpBusy ? "disabled" : ""}>Resend OTP</button><button class="lap-secondary" id="cancelPreviewOtp" type="button">Cancel</button></div></form><p class="lap-otp-note">After verification, document previews remain unlocked until you sign out or the portal logs you out after 30 minutes of inactivity.</p></section></div>` : ""}<div id="toastHost" class="toast-host" aria-live="polite"></div>`;
  bind();
  mountPdfIfNeeded();
}

function clearPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = "";
  state.preview = null;
  state.pdfPageCount = 0;
  state.pdfZoom = 1;
  state.selectedText = null;
  state.inlineComposer = null;
  state.marksPanel = "";
}

async function savePdfHighlight(selection) {
  if (state.markBusy || !selection?.rects?.length) return;
  try {
    state.markBusy = true;
    document.querySelector(".lap-selection-actions")?.remove();
    await saveAdvocateAnnotation(state.session.sessionToken, state.selectedShareId, {
      pageNumber: selection.pageNumber,
      annotationType: "highlight",
      quotedText: selection.text,
      color: "#ffe45c",
      body: JSON.stringify({ version: 1, rects: selection.rects })
    });
    state.markBusy = false;
    state.selectedText = null;
    window.getSelection()?.removeAllRanges();
    await loadDocumentMarks();
    render();
    showToast("Text highlighted for all authorised reviewers.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    state.markBusy = false;
    showToast(error.message || "The text could not be highlighted.", TOAST_TYPES.ERROR);
  }
}

function showPdfSelectionActions(selection) {
  const root = document.getElementById("legalPdfViewer");
  if (!root) return;
  root.querySelector(".lap-selection-actions")?.remove();
  state.selectedText = selection;
  const actions = document.createElement("div");
  actions.className = "lap-selection-actions";
  actions.style.left = `${selection.left}px`;
  actions.style.top = `${selection.top}px`;
  actions.innerHTML = `<button type="button" data-selection-kind="highlight">Highlight</button><button type="button" data-selection-kind="annotation">Annotate</button><button type="button" data-selection-kind="bookmark">Bookmark</button>`;
  actions.querySelectorAll("[data-selection-kind]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.selectionKind === "highlight") {
      savePdfHighlight(selection);
      return;
    }
    state.inlineComposer = { kind: button.dataset.selectionKind, pageNumber: selection.pageNumber, quotedText: selection.text };
    state.marksPanel = "";
    render();
  }));
  root.append(actions);
}

function mountPdfIfNeeded() {
  const type = state.preview?.contentType || "";
  if (!state.preview?.blob || !type.includes("pdf") || !document.getElementById("legalPdfViewer")) return;
  mountSelectablePdf({
    blob: state.preview.blob,
    pageNumber: state.activePage,
    zoom: state.pdfZoom,
    highlights: documentHighlights(),
    onPageReady: ({ pageNumber, pageCount }) => {
      state.activePage = pageNumber;
      state.pdfPageCount = pageCount;
      const current = document.getElementById("pdfCurrentPage");
      const total = document.getElementById("pdfPageCount");
      if (current) current.textContent = String(pageNumber);
      if (total) total.textContent = String(pageCount);
    },
    onTextSelected: showPdfSelectionActions
  }).catch((error) => showToast(error.message || "Selectable PDF preview could not be loaded.", TOAST_TYPES.ERROR));
}

async function loadDocumentMarks(shareId = state.selectedShareId) {
  if (!shareId || !state.previewUnlocked) {
    state.marks = { annotations: [], bookmarks: [] };
    state.marksShareId = "";
    return;
  }
  const marks = await getAdvocateDocumentMarks(state.session.sessionToken, shareId);
  state.marks = { annotations: marks?.annotations || [], bookmarks: marks?.bookmarks || [] };
  state.marksShareId = shareId;
}

function goToDocumentPage(pageNumber) {
  state.activePage = Math.min(state.pdfPageCount || Number.MAX_SAFE_INTEGER, Math.max(1, Number(pageNumber || 1)));
  state.markDrawer = "";
  state.inlineComposer = null;
  state.selectedText = null;
  state.editingAnnotationId = "";
  state.editingBookmarkId = "";
  render();
}

async function openPreview() {
  const share = state.context.shares.find((row) => row.id === state.selectedShareId);
  if (!share) return;
  if (!state.previewUnlocked) {
    await requestPreviewUnlock();
    return;
  }
  try {
    const file = await fetchAdvocateSharedFile(state.session.sessionToken, share.id);
    clearPreview();
    state.preview = file;
    state.previewUrl = URL.createObjectURL(file.blob);
    share.review_status = share.review_status === "shared" ? "opened" : share.review_status;
    await loadDocumentMarks(share.id);
    render();
  } catch (error) { showToast(error.message || "Document could not be opened.", TOAST_TYPES.ERROR); }
}

async function requestPreviewUnlock() {
  if (state.otpBusy) return;
  try {
    state.otpBusy = true;
    const result = await requestAdvocatePreviewOtp(state.session.sessionToken);
    state.otpBusy = false;
    if (result.unlocked) {
      state.previewUnlocked = true;
      state.otpPrompt = null;
      render();
      await openPreview();
      return;
    }
    state.otpPrompt = { maskedPhone: result.maskedPhone, expiresAt: result.otpExpiresAt };
    render();
    setTimeout(() => document.getElementById("previewOtpInput")?.focus(), 0);
    showToast("OTP sent to the registered WhatsApp number.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    state.otpBusy = false;
    render();
    showToast(error.message || "OTP could not be sent.", TOAST_TYPES.ERROR);
  }
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
  document.querySelectorAll("[data-share-id]").forEach((button) => button.addEventListener("click", async () => { clearPreview(); state.selectedShareId = button.dataset.shareId; state.activePage = 1; state.markDrawer = ""; state.marks = { annotations: [], bookmarks: [] }; render(); try { await loadDocumentMarks(); render(); } catch (error) { showToast(error.message || "Document collaboration details could not be loaded.", TOAST_TYPES.ERROR); } }));
  document.getElementById("openPreviewBtn")?.addEventListener("click", openPreview);
  document.getElementById("openPreviewToolbar")?.addEventListener("click", openPreview);
  document.getElementById("fullscreenPreview")?.addEventListener("click", () => document.querySelector(".lap-preview-wrap")?.requestFullscreen?.());
  document.getElementById("exitFullscreenPreview")?.addEventListener("click", () => document.fullscreenElement && document.exitFullscreen?.());
  document.getElementById("openHighlights")?.addEventListener("click", async () => { try { await loadDocumentMarks(); state.marksPanel = state.marksPanel === "highlights" ? "" : "highlights"; state.inlineComposer = null; render(); } catch (error) { showToast(error.message || "Highlights could not be loaded.", TOAST_TYPES.ERROR); } });
  document.getElementById("openAnnotations")?.addEventListener("click", async () => { try { await loadDocumentMarks(); state.marksPanel = state.marksPanel === "annotations" ? "" : "annotations"; state.inlineComposer = null; render(); } catch (error) { showToast(error.message || "Annotations could not be loaded.", TOAST_TYPES.ERROR); } });
  document.getElementById("openBookmarks")?.addEventListener("click", async () => { try { await loadDocumentMarks(); state.marksPanel = state.marksPanel === "bookmarks" ? "" : "bookmarks"; state.inlineComposer = null; render(); } catch (error) { showToast(error.message || "Bookmarks could not be loaded.", TOAST_TYPES.ERROR); } });
  document.getElementById("closeInlineMarks")?.addEventListener("click", () => { state.marksPanel = ""; render(); });
  const closeInlineComposer = () => { state.inlineComposer = null; state.selectedText = null; render(); };
  document.getElementById("closeInlineComposer")?.addEventListener("click", closeInlineComposer);
  document.getElementById("cancelInlineComposer")?.addEventListener("click", closeInlineComposer);
  document.getElementById("pdfZoomOut")?.addEventListener("click", () => { state.pdfZoom = Math.max(.65, state.pdfZoom - .15); render(); });
  document.getElementById("pdfZoomReset")?.addEventListener("click", () => { state.pdfZoom = 1; render(); });
  document.getElementById("pdfZoomIn")?.addEventListener("click", () => { state.pdfZoom = Math.min(2.5, state.pdfZoom + .15); render(); });
  document.getElementById("closeMarkDrawer")?.addEventListener("click", () => { state.markDrawer = ""; state.editingAnnotationId = ""; state.editingBookmarkId = ""; render(); });
  document.getElementById("closeMarkBackdrop")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) { state.markDrawer = ""; state.editingAnnotationId = ""; state.editingBookmarkId = ""; render(); } });
  document.getElementById("cancelEditAnnotation")?.addEventListener("click", () => { state.editingAnnotationId = ""; render(); });
  document.getElementById("cancelEditBookmark")?.addEventListener("click", () => { state.editingBookmarkId = ""; render(); });
  document.querySelectorAll("[data-mark-page]").forEach((button) => button.addEventListener("click", () => goToDocumentPage(button.dataset.markPage)));
  document.querySelectorAll("[data-edit-annotation]").forEach((button) => button.addEventListener("click", () => { const row = state.marks.annotations.find((item) => item.id === button.dataset.editAnnotation); if (!row) return; state.inlineComposer = { kind: "annotation", id: row.id, pageNumber: row.page_number, quotedText: row.quoted_text || "", body: row.body, color: row.color }; state.marksPanel = ""; render(); }));
  document.querySelectorAll("[data-edit-bookmark]").forEach((button) => button.addEventListener("click", () => { const row = state.marks.bookmarks.find((item) => item.id === button.dataset.editBookmark); if (!row) return; state.inlineComposer = { kind: "bookmark", id: row.id, pageNumber: row.page_number, label: row.label, note: row.note || "", quotedText: row.label }; state.marksPanel = ""; render(); }));
  document.querySelectorAll("[data-delete-annotation]").forEach((button) => button.addEventListener("click", async () => {
    const target = state.marks.annotations.find((row) => row.id === button.dataset.deleteAnnotation);
    const isHighlight = target?.annotation_type === "highlight";
    if (!window.confirm(isHighlight ? "Remove this highlight for all authorised reviewers?" : "Delete this annotation for all authorised reviewers?")) return;
    try { await deleteAdvocateAnnotation(state.session.sessionToken, state.selectedShareId, button.dataset.deleteAnnotation); await loadDocumentMarks(); render(); showToast(isHighlight ? "Highlight removed." : "Annotation deleted.", TOAST_TYPES.SUCCESS); }
    catch (error) { showToast(error.message || (isHighlight ? "Highlight could not be removed." : "Annotation could not be deleted."), TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll("[data-delete-bookmark]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this shared bookmark?")) return;
    try { await deleteAdvocateBookmark(state.session.sessionToken, state.selectedShareId, button.dataset.deleteBookmark); await loadDocumentMarks(); render(); showToast("Bookmark deleted.", TOAST_TYPES.SUCCESS); }
    catch (error) { showToast(error.message || "Bookmark could not be deleted.", TOAST_TYPES.ERROR); }
  }));
  document.getElementById("annotationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      state.markBusy = true; render();
      await saveAdvocateAnnotation(state.session.sessionToken, state.selectedShareId, values);
      state.markBusy = false; state.editingAnnotationId = ""; state.inlineComposer = null; state.selectedText = null; await loadDocumentMarks(); render();
      showToast("Collaborative annotation saved.", TOAST_TYPES.SUCCESS);
    } catch (error) { state.markBusy = false; render(); showToast(error.message || "Annotation could not be saved.", TOAST_TYPES.ERROR); }
  });
  document.getElementById("bookmarkForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      state.markBusy = true; render();
      await saveAdvocateBookmark(state.session.sessionToken, state.selectedShareId, values);
      state.markBusy = false; state.editingBookmarkId = ""; state.inlineComposer = null; state.selectedText = null; await loadDocumentMarks(); render();
      showToast("Shared bookmark saved.", TOAST_TYPES.SUCCESS);
    } catch (error) { state.markBusy = false; render(); showToast(error.message || "Bookmark could not be saved.", TOAST_TYPES.ERROR); }
  });
  document.getElementById("stayActiveBtn")?.addEventListener("click", keepSessionActive);
  document.getElementById("cancelPreviewOtp")?.addEventListener("click", () => { state.otpPrompt = null; state.otpBusy = false; render(); });
  document.getElementById("resendPreviewOtp")?.addEventListener("click", requestPreviewUnlock);
  document.getElementById("previewOtpForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const otp = String(new FormData(event.currentTarget).get("otp") || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(otp)) { showToast("Enter the six-digit OTP.", TOAST_TYPES.ERROR); return; }
    try {
      state.otpBusy = true;
      render();
      const result = await verifyAdvocatePreviewOtp(state.session.sessionToken, otp);
      state.previewUnlocked = Boolean(result.unlocked);
      state.otpPrompt = null;
      state.otpBusy = false;
      render();
      showToast("Secure document previews are unlocked for this session.", TOAST_TYPES.SUCCESS);
      await openPreview();
    } catch (error) {
      state.otpBusy = false;
      render();
      setTimeout(() => document.getElementById("previewOtpInput")?.focus(), 0);
      showToast(error.message || "OTP verification failed.", TOAST_TYPES.ERROR);
    }
  });
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
  const [context, security] = await Promise.all([
    getAdvocatePortalContext(state.session.sessionToken),
    getAdvocatePreviewOtpStatus(state.session.sessionToken)
  ]);
  state.context = context;
  state.previewUnlocked = Boolean(security?.unlocked);
  state.updatedAt = new Date();
  if (!state.selectedShareId && state.context.shares?.[0]?.id) state.selectedShareId = state.context.shares[0].id;
  if (state.selectedShareId && !state.context.shares.some((row) => row.id === state.selectedShareId)) { clearPreview(); state.selectedShareId = state.context.shares?.[0]?.id || ""; }
  if (state.previewUnlocked && state.selectedShareId) await loadDocumentMarks(state.selectedShareId);
  else state.marks = { annotations: [], bookmarks: [] };
  render();
}

function activityStorageKey() {
  return `ems_legal_advocate_last_activity_${String(state.session?.sessionToken || "").slice(-16)}`;
}

function recordActivity(force = false) {
  if (state.inactivityPrompt && !force) return;
  const now = Date.now();
  if (!force && now - state.lastActivityWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
  state.lastActivityWrite = now;
  sessionStorage.setItem(activityStorageKey(), String(now));
}

async function enforceInactivityTimeout() {
  if (state.inactivityPrompt) return;
  const last = Number(sessionStorage.getItem(activityStorageKey()) || state.lastActivityWrite || Date.now());
  if (Date.now() - last < INACTIVITY_LIMIT_MS) return;
  state.inactivityPrompt = { seconds: 30 };
  render();
  state.inactivityCountdownTimer = setInterval(async () => {
    if (!state.inactivityPrompt) return;
    state.inactivityPrompt.seconds -= 1;
    if (state.inactivityPrompt.seconds <= 0) {
      clearInterval(state.inactivityCountdownTimer);
      state.inactivityCountdownTimer = null;
      clearInterval(state.activityTimer);
      state.activityTimer = null;
      clearPreview();
      await advocatePortalLogout();
      return;
    }
    render();
  }, 1000);
}

async function keepSessionActive() {
  clearInterval(state.inactivityCountdownTimer);
  state.inactivityCountdownTimer = null;
  state.inactivityPrompt = null;
  recordActivity(true);
  try {
    const security = await getAdvocatePreviewOtpStatus(state.session.sessionToken);
    state.previewUnlocked = Boolean(security?.unlocked);
    render();
    showToast("Secure session extended.", TOAST_TYPES.SUCCESS);
  } catch {
    clearPreview();
    await advocatePortalLogout();
  }
}

function startInactivityGuard() {
  recordActivity(true);
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((name) => window.addEventListener(name, () => recordActivity(), { passive: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) enforceInactivityTimeout(); });
  state.activityTimer = setInterval(enforceInactivityTimeout, 1000);
}

async function init() {
  state.session = await requireAdvocatePortalSession();
  if (!state.session) return;
  startInactivityGuard();
  try { await load(); } catch (error) { document.getElementById("app").innerHTML = `<div class="card" style="margin:2rem"><h2>Advocate Portal Error</h2><p>${esc(error.message || "The portal could not be loaded.")}</p><button class="btn" id="advocateLogout">Return to Login</button></div>`; document.getElementById("advocateLogout")?.addEventListener("click", advocatePortalLogout); }
}

window.addEventListener("beforeunload", () => { clearPreview(); if (state.activityTimer) clearInterval(state.activityTimer); if (state.inactivityCountdownTimer) clearInterval(state.inactivityCountdownTimer); });
init();
