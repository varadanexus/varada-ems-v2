import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getEmailBranding, listEmailDirectory, listEmailSenders, listEmailTemplates, sendModuleEmail } from "./email-api.js";
import { showToast } from "./utils.js";

const FALLBACK_LOGO = "/new-ems/assets/pdf/vn-logo.png";
const state = { users: [], templates: [], senders: [], branding: {}, attachments: [] };

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      base64: String(reader.result || "").replace(/^data:[^;]+;base64,/, ""),
      size: file.size
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachChips() {
  const el = document.querySelector("#emAttachChips");
  if (!el) return;
  const total = state.attachments.reduce((s, a) => s + a.size, 0);
  el.innerHTML = state.attachments.length
    ? state.attachments.map((a, i) => `<span class="em-chip">${escapeHtml(a.name)} <span class="em-hint">(${fmtSize(a.size)})</span><button type="button" data-ai="${i}">×</button></span>`).join("")
      + `<span class="em-hint" style="align-self:center;">Total ${fmtSize(total)} / 10 MB</span>`
    : "";
  el.querySelectorAll("button[data-ai]").forEach((b) => b.addEventListener("click", () => {
    state.attachments.splice(Number(b.getAttribute("data-ai")), 1);
    renderAttachChips();
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function initials(name = "", email = "") {
  const base = String(name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function brandCompanyName() { const b = state.branding || {}; return b.companyName || "Varada Nexus Private Limited"; }
function brandEyebrow() { const b = state.branding || {}; return b.eyebrow || b.companyName || "Varada Nexus Private Limited"; }
function brandLogoUrl() { const b = state.branding || {}; return b.logoUrl || FALLBACK_LOGO; }
function brandAccent() { const b = state.branding || {}; return b.accent || "#e7c976"; }
function brandHeaderBg() { const b = state.branding || {}; return b.headerBg || "#0f213b"; }

function parseFreeform(raw) {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.includes("@"))
    .map((address) => ({ address }));
}

function currentSender() {
  const key = document.querySelector("#emSender")?.value || "";
  return state.senders.find((s) => s.sender_key === key) || null;
}

function render() {
  const defaultFrom = (state.senders.find((s) => s.sender_key === "admin") || state.senders[0] || {}).from_email || "system default";
  renderModuleContent(`
    <style>
      .em-wrap{--line:rgba(225,189,104,.2);--panel:#0b0c0d;--panel2:#13120f;--ink:#f1ede4;--dim:#9e998e;--gold:#e7c976}
      .em-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}
      .em-hero .em-chipline{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem}
      .em-badge{display:inline-flex;align-items:center;gap:.35rem;font-size:.72rem;letter-spacing:.02em;padding:.28rem .6rem;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--dim)}
      .em-grid{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(340px,1.25fr);gap:1rem;align-items:start;margin-top:1rem}
      .em-field{display:grid;gap:.32rem;margin-bottom:.9rem}
      .em-field>label{font-weight:700;font-size:.82rem;letter-spacing:.02em;text-transform:uppercase;color:var(--dim)}
      .em-field input,.em-field textarea,.em-field select{width:100%;min-width:0;border-radius:9px}
      .em-hint{font-size:.76rem;color:var(--dim)}
      .em-sec-head{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-bottom:.7rem}
      .em-sec-head h3{margin:0}
      .em-count{font-size:.74rem;color:var(--gold);font-weight:700}
      /* Send as */
      .em-sender-preview{display:flex;align-items:center;gap:.6rem;border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem;background:var(--panel);margin-top:.4rem}
      .em-sender-avatar{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:#090a0b;border:1px solid rgba(225,189,104,.24);color:var(--gold);font-weight:800;font-size:.8rem;flex:0 0 auto}
      .em-sender-meta{display:grid;gap:.1rem;min-width:0}
      .em-sender-meta strong{font-size:.9rem;color:var(--ink)}
      .em-sender-meta span{font-size:.76rem;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      /* Recipients */
      .em-search{position:relative}
      .em-search input{padding-left:2rem}
      .em-search::before{content:"⌕";position:absolute;left:.6rem;top:50%;transform:translateY(-50%);color:var(--dim);font-size:1rem}
      .em-toolbar{display:flex;gap:.4rem;flex-wrap:wrap;margin:.5rem 0}
      .em-mini{font-size:.74rem;padding:.28rem .55rem;border-radius:7px;border:1px solid var(--line);background:transparent;color:var(--dim);cursor:pointer}
      .em-mini:hover{border-color:var(--gold);color:var(--ink)}
      .em-users{max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:.35rem;display:grid;gap:.2rem;background:rgba(5,6,6,.48)}
      .em-user-row{display:flex;gap:.55rem;align-items:center;padding:.4rem .5rem;border-radius:8px;cursor:pointer;transition:background .12s}
      .em-user-row:hover{background:rgba(225,189,104,.07)}
      .em-user-row input{width:auto;margin:0}
      .em-user-av{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#1c180f;color:#f1d58d;border:1px solid rgba(225,189,104,.2);font-weight:700;font-size:.68rem;flex:0 0 auto}
      .em-user-txt{display:grid;min-width:0}
      .em-user-txt b{font-size:.84rem;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .em-user-txt small{font-size:.72rem;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .em-empty{font-size:.8rem;color:var(--dim);padding:.6rem}
      .em-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.55rem;min-height:1.2rem}
      .em-chip{display:inline-flex;align-items:center;gap:.35rem;font-size:.74rem;padding:.24rem .3rem .24rem .55rem;border-radius:999px;background:#18150f;border:1px solid var(--line);color:var(--ink)}
      .em-chip button{border:none;background:transparent;color:var(--dim);cursor:pointer;font-size:.9rem;line-height:1;padding:0 .1rem}
      .em-chip button:hover{color:#ff9a9a}
      /* Preview */
      .em-preview-card{margin-top:1rem}
      .em-preview-shell{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#f5f7fb}
      .em-pv-head{background:#0f213b;padding:16px 20px;border-top:4px solid var(--gold)}
      .em-pv-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
      .em-pv-subject{font-size:19px;font-weight:800;color:#fff;margin-top:5px;word-break:break-word}
      .em-pv-body{padding:18px 20px;font-size:14px;line-height:1.65;color:#0f172a;background:#fff;min-height:90px;word-break:break-word}
      .em-pv-from{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;font-size:.75rem;color:var(--dim);padding:.55rem .2rem 0}
      /* Sticky action bar */
      .em-actionbar{position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1rem;padding:.8rem 1rem;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,rgba(20,19,15,.72),rgba(8,9,10,.96));backdrop-filter:blur(6px)}
      .em-summary{font-size:.82rem;color:var(--dim)}
      .em-summary b{color:var(--ink)}
      /* Rich text editor */
      .em-toolbar{display:flex;flex-wrap:wrap;gap:.15rem;align-items:center;border:1px solid var(--line);border-bottom:none;border-radius:9px 9px 0 0;padding:.35rem;background:rgba(7,8,8,.72)}
      .em-tb{min-width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0 .45rem;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--ink);cursor:pointer;font-size:.88rem;position:relative}
      .em-tb:hover{background:rgba(225,189,104,.14)}
      .em-tb-sep{width:1px;height:20px;background:var(--line);margin:0 .25rem}
      .em-tb-select{height:30px;border-radius:6px;background:var(--panel);color:var(--ink);border:1px solid var(--line);font-size:.8rem}
      .em-editor{min-height:210px;border:1px solid var(--line);border-radius:0 0 9px 9px;padding:.75rem .85rem;background:rgba(5,6,6,.58);color:var(--ink);line-height:1.6;overflow:auto}
      .em-editor:focus{outline:none;border-color:var(--gold)}
      .em-editor:empty::before{content:attr(data-placeholder);color:#64748b}
      .em-editor a{color:#e7c976}
      @media(max-width:980px){.em-grid{grid-template-columns:1fr}}
    </style>

    <div class="em-wrap">
      <section class="card">
        <div class="em-hero">
          <div>
            <h3 style="margin:0;">Compose Email</h3>
            <p class="muted" style="margin:.35rem 0 0;">Send through the verified ZeptoMail sender to EMS users, any typed address, or both. Plain text is wrapped in a branded EMS layout automatically.</p>
          </div>
          <div class="em-chipline">
            <span class="em-badge">ZeptoMail · verified domain</span>
            <span class="em-badge" id="emHeroCount">0 recipients</span>
          </div>
        </div>
      </section>

      <form id="emComposeForm" class="em-grid">
        <section class="card">
          <div class="em-field">
            <label>Send As</label>
            <select id="emSender" name="sender_key">
              <option value="">Default (${escapeHtml(defaultFrom)})</option>
              ${state.senders.map((s) => `<option value="${escapeHtml(s.sender_key)}">${escapeHtml(s.label)} — ${escapeHtml(s.from_email)}</option>`).join("")}
            </select>
            <div class="em-sender-preview" id="emSenderPreview"></div>
          </div>

          <div class="em-sec-head">
            <h3 style="font-size:1rem;">Recipients</h3>
            <span class="em-count" id="emSelCount">0 selected</span>
          </div>
          <div class="em-field em-search">
            <input id="emUserSearch" type="text" placeholder="Search EMS users by name or email" autocomplete="off" />
          </div>
          <div class="em-toolbar">
            <button type="button" class="em-mini" id="emSelectAll">Select all shown</button>
            <button type="button" class="em-mini" id="emClearSel">Clear selection</button>
          </div>
          <div class="em-users" id="emUsers">
            ${state.users.length ? state.users.map((u) => `
              <label class="em-user-row" data-search="${escapeHtml((u.name + " " + u.email).toLowerCase())}">
                <input type="checkbox" name="user_ids" value="${escapeHtml(u.id)}" data-name="${escapeHtml(u.name)}" data-email="${escapeHtml(u.email)}" />
                <span class="em-user-av">${escapeHtml(initials(u.name, u.email))}</span>
                <span class="em-user-txt"><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)}</small></span>
              </label>
            `).join("") : '<div class="em-empty">No EMS users with saved email addresses.</div>'}
          </div>

          <div class="em-field" style="margin-top:.9rem;">
            <label>Additional Addresses</label>
            <textarea name="freeform" rows="2" placeholder="name@example.com, another@example.com"></textarea>
            <span class="em-hint">Comma, space, or newline separated.</span>
          </div>

          <div class="em-chips" id="emChips"></div>
        </section>

        <section class="card">
          <div class="em-field">
            <label>Template (optional)</label>
            <select id="emTemplate" name="template_alias">
              <option value="">— None —</option>
              ${state.templates.map((t) => `<option value="${escapeHtml(t.alias)}">${escapeHtml(t.title)} (${escapeHtml(t.alias)})</option>`).join("")}
            </select>
            <span class="em-hint">Selecting a template pre-fills the subject and body below; edit freely before sending.</span>
          </div>
          <div class="em-field">
            <div class="em-sec-head" style="margin-bottom:.32rem;"><label style="margin:0;">Subject</label><span class="em-count" id="emSubjCount">0</span></div>
            <input name="subject" maxlength="200" placeholder="Email subject" />
          </div>
          <div class="em-field">
            <label>Body</label>
            <div class="em-toolbar" id="emToolbar">
              <button type="button" class="em-tb" data-cmd="bold" title="Bold"><b>B</b></button>
              <button type="button" class="em-tb" data-cmd="italic" title="Italic"><i>I</i></button>
              <button type="button" class="em-tb" data-cmd="underline" title="Underline"><u>U</u></button>
              <button type="button" class="em-tb" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
              <span class="em-tb-sep"></span>
              <select class="em-tb-select" data-cmd="fontSize" title="Font size">
                <option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Huge</option>
              </select>
              <label class="em-tb" title="Text color"><span style="border-bottom:2px solid currentColor;">A</span><input type="color" data-cmd="foreColor" style="position:absolute;inset:0;opacity:0;cursor:pointer;" /></label>
              <label class="em-tb" title="Highlight color"><span style="background:#4b3b12;padding:0 2px;border-radius:2px;">H</span><input type="color" data-cmd="hiliteColor" style="position:absolute;inset:0;opacity:0;cursor:pointer;" /></label>
              <span class="em-tb-sep"></span>
              <button type="button" class="em-tb" data-cmd="justifyLeft" title="Align left">⇤</button>
              <button type="button" class="em-tb" data-cmd="justifyCenter" title="Center">⇔</button>
              <button type="button" class="em-tb" data-cmd="justifyRight" title="Align right">⇥</button>
              <button type="button" class="em-tb" data-cmd="justifyFull" title="Justify">☰</button>
              <span class="em-tb-sep"></span>
              <button type="button" class="em-tb" data-cmd="insertUnorderedList" title="Bulleted list">•</button>
              <button type="button" class="em-tb" data-cmd="insertOrderedList" title="Numbered list">1.</button>
              <button type="button" class="em-tb" data-cmd="createLink" title="Insert link">🔗</button>
              <button type="button" class="em-tb" data-cmd="removeFormat" title="Clear formatting">⌫</button>
            </div>
            <div id="emBody" class="em-editor" contenteditable="true" data-placeholder="Write your message here…"></div>
          </div>

          <div class="em-field">
            <label>Attachments</label>
            <input type="file" id="emFiles" multiple accept=".pdf,application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" />
            <span class="em-hint">PDF &amp; images. Attached to the email and archived to the Google Drive Email folder. Max 10 MB total.</span>
            <div class="em-chips" id="emAttachChips"></div>
          </div>

          <div class="em-preview-card">
            <div class="em-sec-head"><label style="margin:0;">Live Preview</label></div>
            <div class="em-preview-shell">
              <div class="em-pv-head" style="background:${escapeHtml(brandHeaderBg())};border-top-color:${escapeHtml(brandAccent())};">
                <div style="display:flex;align-items:center;gap:12px;">
                  ${brandLogoUrl() ? `<img src="${escapeHtml(brandLogoUrl())}" alt="logo" style="height:34px;max-width:130px;display:block;" onerror="this.style.display='none'" />` : ""}
                  <span style="font-size:21px;font-weight:800;color:#fff;line-height:1.1;">${escapeHtml(brandCompanyName())}</span>
                </div>
                <div class="em-pv-subject" id="emPvSubject" style="margin-top:12px;">Email subject</div>
              </div>
              <div class="em-pv-body" id="emPvBody"><span style="color:#94a3b8;">Your message preview appears here…</span></div>
            </div>
            <div class="em-pv-from">
              <span id="emPvFrom">From: ${escapeHtml(defaultFrom)}</span>
              <span id="emPvReply"></span>
            </div>
          </div>
        </section>

        <div class="em-actionbar" style="grid-column:1/-1;">
          <div class="em-summary" id="emSummary">No recipients yet</div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
            <button class="btn btn-ghost" type="reset" id="emClearBtn">Clear</button>
            <button class="btn" type="submit" id="emSendBtn">Send Email</button>
          </div>
        </div>
      </form>
    </div>
  `);

  bind();
  bindEditor();
  syncSenderPreview();
  refreshRecipients();
  updatePreview();
  renderAttachChips();
}

function selectedUsers() {
  return Array.from(document.querySelectorAll('input[name="user_ids"]:checked'))
    .map((el) => ({ id: el.value, name: el.getAttribute("data-name"), email: el.getAttribute("data-email") }));
}

function refreshRecipients() {
  const users = selectedUsers();
  const extra = parseFreeform(document.querySelector('[name="freeform"]')?.value || "");
  const total = users.length + extra.length;

  const chipHtml = [
    ...users.map((u) => `<span class="em-chip" title="${escapeHtml(u.email)}">${escapeHtml(u.name || u.email)}<button type="button" data-uid="${escapeHtml(u.id)}">×</button></span>`),
    ...extra.map((e) => `<span class="em-chip">${escapeHtml(e.address)}</span>`)
  ].join("");
  const chips = document.querySelector("#emChips");
  if (chips) chips.innerHTML = chipHtml || '<span class="em-hint">No recipients selected yet.</span>';

  const selCount = document.querySelector("#emSelCount");
  if (selCount) selCount.textContent = `${users.length} selected`;
  const heroCount = document.querySelector("#emHeroCount");
  if (heroCount) heroCount.textContent = `${total} recipient${total === 1 ? "" : "s"}`;
  const summary = document.querySelector("#emSummary");
  if (summary) {
    const sender = currentSender();
    const as = sender ? ` as <b>${escapeHtml(sender.from_email)}</b>` : "";
    summary.innerHTML = total ? `Sending to <b>${total}</b> recipient${total === 1 ? "" : "s"}${as}` : "No recipients yet";
  }

  document.querySelectorAll("#emChips .em-chip button[data-uid]").forEach((btn) => btn.addEventListener("click", () => {
    const box = document.querySelector(`input[name="user_ids"][value="${CSS.escape(btn.getAttribute("data-uid"))}"]`);
    if (box) { box.checked = false; refreshRecipients(); }
  }));
}

function syncSenderPreview() {
  const sender = currentSender();
  const box = document.querySelector("#emSenderPreview");
  const defaultFrom = (state.senders.find((s) => s.sender_key === "admin") || state.senders[0] || {}).from_email || "system default";
  const fromEmail = sender ? sender.from_email : defaultFrom;
  const fromName = sender ? sender.from_name : "Varada Nexus";
  const reply = sender ? (sender.reply_to_email || "no reply-to") : fromEmail;
  if (box) {
    box.innerHTML = `
      <span class="em-sender-avatar">${escapeHtml(initials(fromName, fromEmail))}</span>
      <span class="em-sender-meta">
        <strong>${escapeHtml(fromName)}</strong>
        <span>${escapeHtml(fromEmail)} · reply-to ${escapeHtml(reply)}</span>
      </span>`;
  }
  const pvFrom = document.querySelector("#emPvFrom");
  if (pvFrom) pvFrom.textContent = `From: ${fromName} <${fromEmail}>`;
  const pvReply = document.querySelector("#emPvReply");
  if (pvReply) pvReply.textContent = sender && sender.reply_to_email ? `Reply-to: ${sender.reply_to_email}` : "";
}

function updatePreview() {
  const subject = document.querySelector('[name="subject"]')?.value || "";
  const editor = document.querySelector("#emBody");
  const pvSubj = document.querySelector("#emPvSubject");
  if (pvSubj) pvSubj.textContent = subject.trim() || "Email subject";
  const pvBody = document.querySelector("#emPvBody");
  if (pvBody) {
    pvBody.innerHTML = (editor && editor.innerText.trim())
      ? editor.innerHTML
      : '<span style="color:#94a3b8;">Your message preview appears here…</span>';
  }
  const subjCount = document.querySelector("#emSubjCount");
  if (subjCount) subjCount.textContent = String(subject.length);
}

let savedRange = null;
function saveRange() {
  const editor = document.querySelector("#emBody");
  const sel = window.getSelection();
  if (editor && sel && sel.rangeCount && editor.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0);
}
function restoreRange() {
  const editor = document.querySelector("#emBody");
  if (editor && savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); }
  editor?.focus();
}
function exec(cmd, value = null) {
  document.execCommand(cmd, false, value);
  saveRange();
  updatePreview();
}
function bindEditor() {
  const editor = document.querySelector("#emBody");
  if (!editor) return;
  editor.addEventListener("keyup", saveRange);
  editor.addEventListener("mouseup", saveRange);
  editor.addEventListener("input", () => { saveRange(); updatePreview(); });
  // Buttons: preventDefault on mousedown keeps the current selection.
  document.querySelectorAll('#emToolbar .em-tb[data-cmd]').forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-cmd");
      if (cmd === "createLink") { const url = prompt("Link URL:", "https://"); if (url) exec("createLink", url); return; }
      exec(cmd);
    });
  });
  document.querySelector('#emToolbar select[data-cmd="fontSize"]')?.addEventListener("change", (e) => {
    restoreRange(); if (e.target.value) exec("fontSize", e.target.value); e.target.selectedIndex = 0;
  });
  document.querySelectorAll('#emToolbar input[data-cmd]').forEach((inp) => {
    inp.addEventListener("input", (e) => { restoreRange(); exec(inp.getAttribute("data-cmd"), e.target.value); });
  });
}

function bind() {
  document.querySelector("#emSender")?.addEventListener("change", () => { syncSenderPreview(); refreshRecipients(); });

  document.querySelector("#emUserSearch")?.addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase();
    document.querySelectorAll("#emUsers .em-user-row").forEach((row) => {
      row.style.display = !q || row.getAttribute("data-search").includes(q) ? "" : "none";
    });
  });

  document.querySelector("#emSelectAll")?.addEventListener("click", () => {
    document.querySelectorAll("#emUsers .em-user-row").forEach((row) => {
      if (row.style.display !== "none") { const box = row.querySelector("input"); if (box) box.checked = true; }
    });
    refreshRecipients();
  });

  document.querySelector("#emClearSel")?.addEventListener("click", () => {
    document.querySelectorAll('input[name="user_ids"]').forEach((box) => { box.checked = false; });
    refreshRecipients();
  });

  document.querySelector("#emUsers")?.addEventListener("change", refreshRecipients);
  document.querySelector('[name="freeform"]')?.addEventListener("input", refreshRecipients);
  document.querySelector('[name="subject"]')?.addEventListener("input", updatePreview);
  document.querySelector('[name="body"]')?.addEventListener("input", updatePreview);

  document.querySelector("#emFiles")?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      if (state.attachments.length >= 10) { showToast("Maximum 10 attachments.", TOAST_TYPES.WARNING); break; }
      try { state.attachments.push(await readFileAsAttachment(file)); } catch { showToast(`Could not read ${file.name}.`, TOAST_TYPES.ERROR); }
    }
    event.target.value = "";
    const total = state.attachments.reduce((s, a) => s + a.size, 0);
    if (total > 10 * 1024 * 1024) showToast("Attachments exceed 10 MB — remove some before sending.", TOAST_TYPES.ERROR);
    renderAttachChips();
  });

  document.querySelector("#emTemplate")?.addEventListener("change", (event) => {
    const tpl = state.templates.find((t) => t.alias === event.target.value);
    if (!tpl) return;
    const form = document.querySelector("#emComposeForm");
    form.elements.subject.value = tpl.subject || "";
    const editor = document.querySelector("#emBody");
    if (editor) editor.innerHTML = tpl.html_body || (tpl.text_body ? escapeHtml(tpl.text_body).replace(/\n/g, "<br />") : "");
    updatePreview();
  });

  document.querySelector("#emClearBtn")?.addEventListener("click", () => {
    const editor = document.querySelector("#emBody");
    if (editor) editor.innerHTML = "";
    state.attachments = [];
    setTimeout(() => { refreshRecipients(); updatePreview(); syncSenderPreview(); renderAttachChips(); }, 0);
  });

  document.querySelector("#emComposeForm")?.addEventListener("submit", onSubmit);
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const userIds = selectedUsers().map((u) => u.id);
  const to = parseFreeform(form.elements.freeform.value);
  const subject = form.elements.subject.value.trim();
  const editor = document.querySelector("#emBody");
  const bodyHtml = editor ? editor.innerHTML : "";
  const bodyText = editor ? editor.innerText.trim() : "";
  const templateAlias = form.elements.template_alias.value || null;
  const senderKey = form.elements.sender_key.value || null;
  if (!userIds.length && !to.length) return showToast("Add at least one recipient.", TOAST_TYPES.ERROR);
  if (!subject) return showToast("Subject is required.", TOAST_TYPES.ERROR);
  if (!bodyText) return showToast("Message body is required.", TOAST_TYPES.ERROR);
  const totalAttach = state.attachments.reduce((s, a) => s + a.size, 0);
  if (totalAttach > 10 * 1024 * 1024) return showToast("Attachments exceed 10 MB — remove some.", TOAST_TYPES.ERROR);
  const button = document.querySelector("#emSendBtn");
  button.disabled = true;
  button.textContent = state.attachments.length ? "Uploading & sending..." : "Sending...";
  try {
    const result = await sendModuleEmail({ userIds, to, subject, bodyHtml, textBody: bodyText, templateAlias, senderKey, attachments: state.attachments, sourceModule: "email-compose" });
    let msg = `Email sent: ${result.sent}/${result.total}${result.failed ? `, ${result.failed} failed` : ""}.`;
    if (result.attachments) msg += result.driveArchived ? ` ${result.attachments} attachment(s) archived to Drive.` : ` ${result.attachments} attachment(s) sent (Drive archive skipped).`;
    showToast(msg, result.failed ? TOAST_TYPES.WARNING : TOAST_TYPES.SUCCESS);
    if (!result.failed) { form.reset(); if (editor) editor.innerHTML = ""; state.attachments = []; renderAttachChips(); refreshRecipients(); updatePreview(); syncSenderPreview(); }
  } catch (error) {
    showToast(error?.message || "Send failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = "Send Email";
  }
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.EMAIL_COMPOSE,
    pageTitle: "Compose Email",
    pageDescription: "Send email to EMS users or any address through ZeptoMail",
    workspace: WORKSPACES.EMAIL
  });
  if (!boot) return;
  const [dir, tpl, snd, brand] = await Promise.all([
    listEmailDirectory().catch(() => ({ users: [] })),
    listEmailTemplates().catch(() => ({ templates: [] })),
    listEmailSenders().catch(() => ({ senders: [] })),
    getEmailBranding().catch(() => ({ branding: {} }))
  ]);
  state.users = dir.users || [];
  state.templates = (tpl.templates || []).filter((t) => t.is_active);
  state.senders = (snd.senders || []).filter((s) => s.is_active);
  state.branding = brand.branding || {};
  render();
}

init();
