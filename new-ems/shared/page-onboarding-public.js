// Public customer onboarding wizard (no EMS auth). Token in ?t=.
// Flow: OTP verify -> entity details -> documents -> live image -> T&C -> done.

import {
  requestOnboardingOtp, verifyOnboardingOtp, getOnboardingContext,
  saveOnboardingSubmission, uploadOnboardingDocument, acceptOnboardingTerms
} from "./onboarding-api.js";

const token = new URLSearchParams(window.location.search).get("t") || "";
const DIVISION_LABELS = {
  "hospital-projects": "Hospital Projects",
  "interiors": "Interiors",
  "transport": "Transport",
  "digital-services": "Digital Marketing & Services"
};
const ENTITY_TYPES = [
  "Private Limited Company", "Public Limited Company", "Limited Liability Partnership (LLP)",
  "Partnership Firm", "Sole Proprietorship", "One Person Company (OPC)", "Trust", "Society",
  "Hindu Undivided Family (HUF)", "Cooperative Society", "Government / PSU", "Individual", "Other"
];

const state = {
  step: "verify",          // verify | details | documents | photo | terms | done
  context: null,
  session: "",
  otpSent: false,
  masked: "",
  details: {},
  uploaded: {},            // document_key -> { name, link }
  stream: null,
  photoDataUrl: "",
  termsAccepted: false,
  busy: false
};

const $app = () => document.querySelector("#app");
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg, ok = false) {
  const el = document.querySelector("#onbToast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = `onb-toast ${ok ? "ok" : "err"} show`;
  setTimeout(() => el.classList.remove("show"), 4200);
}
function setBusy(b) { state.busy = b; document.querySelectorAll("button").forEach((x) => { x.disabled = b; }); }

function shell(inner) {
  $app().innerHTML = `
    <style>
      body{background:#050609;color:#eee}
      .onb{min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%, #12141b, #050609)}
      .onb-bar{border-bottom:1px solid rgba(226,200,126,.25);padding:14px 18px;display:flex;align-items:center;gap:.7rem}
      .onb-bar strong{font-size:1rem}.onb-bar span{display:block;color:#c39a44;font-size:.62rem;text-transform:uppercase;letter-spacing:.14em}
      .onb-wrap{width:min(760px,calc(100% - 28px));margin:0 auto;padding:1.4rem 0 3rem}
      .onb-steps{display:flex;gap:.4rem;margin:.4rem 0 1.2rem;flex-wrap:wrap}
      .onb-chip{font-size:.68rem;padding:.3rem .55rem;border:1px solid #2a2d36;border-radius:999px;color:#8b8f99}
      .onb-chip.active{border-color:#c39a44;color:#e6c87e}.onb-chip.done{border-color:#2f6b45;color:#7fd6a2}
      .onb-card{border:1px solid rgba(226,200,126,.18);border-radius:12px;background:linear-gradient(160deg,#0d0f14,#090a0d);padding:1.2rem}
      .onb-card h1{margin:.1rem 0 .2rem;font-size:1.35rem}.onb-card h2{font-size:1.05rem;margin:.2rem 0 1rem}
      .onb-muted{color:#9aa0ab;font-size:.85rem}
      label.onb-l{display:block;margin:.7rem 0 .25rem;font-size:.78rem;color:#c9cdd6}
      .onb-in{width:100%;box-sizing:border-box;background:#0a0b0e;border:1px solid #2a2d36;border-radius:8px;color:#eee;padding:.6rem .7rem;font-size:.92rem}
      .onb-in:focus{outline:none;border-color:#c39a44}
      .onb-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
      .onb-btn{background:#c39a44;color:#050609;border:0;border-radius:8px;padding:.7rem 1.1rem;font-weight:800;cursor:pointer;font-size:.92rem}
      .onb-btn.ghost{background:transparent;border:1px solid #3a3d46;color:#e6e6e6}
      .onb-btn:disabled{opacity:.5;cursor:not-allowed}
      .onb-actions{display:flex;gap:.5rem;margin-top:1.1rem;flex-wrap:wrap}
      .onb-doc{display:flex;align-items:center;justify-content:space-between;gap:.6rem;border:1px solid #24272f;border-radius:9px;padding:.6rem .7rem;margin:.5rem 0}
      .onb-doc small{color:#8b8f99;display:block}
      .onb-req{color:#e6c87e;font-size:.66rem}.onb-ok{color:#7fd6a2;font-size:.78rem}
      .onb-terms{max-height:52vh;overflow:auto;border:1px solid #24272f;border-radius:9px;padding:1rem;background:#0a0b0e;line-height:1.6;color:#cfd3db;font-size:.86rem}
      .onb-terms h2,.onb-terms h3{color:#e6c87e}
      video.onb-cam,img.onb-shot{width:100%;border-radius:10px;background:#000;aspect-ratio:4/3;object-fit:cover}
      .onb-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%) translateY(20px);opacity:0;transition:.25s;padding:.7rem 1rem;border-radius:8px;font-size:.86rem;z-index:50}
      .onb-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
      .onb-toast.ok{background:#123524;color:#8ef0b8;border:1px solid #2f6b45}.onb-toast.err{background:#3a1418;color:#f6b5bd;border:1px solid #7a2731}
      .onb-check{display:flex;gap:.5rem;align-items:flex-start;margin-top:.8rem;font-size:.84rem;color:#cfd3db}
      @media(max-width:560px){.onb-grid{grid-template-columns:1fr}}
    </style>
    <main class="onb">
      <div class="onb-bar"><div><strong>Varada Nexus</strong><span>Private Limited</span></div></div>
      <div class="onb-wrap">${inner}</div>
      <div id="onbToast" class="onb-toast"></div>
    </main>`;
}

function steps() {
  const order = ["verify", "details", "documents", "photo", "terms"];
  const labels = { verify: "Verify", details: "Your details", documents: "Documents", photo: "Live photo", terms: "Terms" };
  const idx = order.indexOf(state.step);
  return `<div class="onb-steps">${order.map((s, i) =>
    `<span class="onb-chip ${s === state.step ? "active" : ""} ${i < idx ? "done" : ""}">${i + 1}. ${labels[s]}</span>`).join("")}</div>`;
}

function heading() {
  const c = state.context || {};
  const division = DIVISION_LABELS[c.division_code] || c.division_code || "";
  return `<h1>${esc(c.entity_name || "Onboarding")}</h1><p class="onb-muted">${esc(division)} onboarding with Varada Nexus Private Limited</p>`;
}

// ── Verify ───────────────────────────────────────────────────────────────────
function renderVerify() {
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Verify it's you</h2>
    <p class="onb-muted">We'll send a one-time code to the contact on file. ${state.masked ? `Code sent to <strong>${esc(state.masked)}</strong>.` : ""}</p>
    ${!state.otpSent
      ? `<div class="onb-actions"><button class="onb-btn" id="sendOtp">Send code</button></div>`
      : `<label class="onb-l">Enter the code</label>
         <input class="onb-in" id="otp" inputmode="numeric" maxlength="8" placeholder="6-digit code" />
         <div class="onb-actions"><button class="onb-btn" id="verifyOtp">Verify &amp; continue</button>
         <button class="onb-btn ghost" id="resendOtp">Resend</button></div>`}
  </div>`);
  document.querySelector("#sendOtp")?.addEventListener("click", sendOtp);
  document.querySelector("#resendOtp")?.addEventListener("click", sendOtp);
  document.querySelector("#verifyOtp")?.addEventListener("click", doVerify);
}
async function sendOtp() {
  try {
    setBusy(true);
    const r = await requestOnboardingOtp({ public_token: token });
    state.otpSent = true; state.masked = r.masked_destination || "";
    renderVerify(); toast("Code sent.", true);
  } catch (e) { toast(e.message); } finally { setBusy(false); }
}
async function doVerify() {
  const otp = (document.querySelector("#otp")?.value || "").trim();
  try {
    setBusy(true);
    const r = await verifyOnboardingOtp({ public_token: token, otp });
    state.session = r.session_token;
    state.step = "details"; render();
  } catch (e) { toast(e.message); } finally { setBusy(false); }
}

// ── Details ──────────────────────────────────────────────────────────────────
function renderDetails() {
  const c = state.context || {};
  const d = state.details;
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Your organisation's details</h2>
    <label class="onb-l">Registered / legal name</label>
    <input class="onb-in" id="f_legal" value="${esc(d.legal_name || c.entity_name || "")}" />
    <div class="onb-grid">
      <div><label class="onb-l">Entity type</label>
        <select class="onb-in" id="f_type"><option value="">Select entity type…</option>${ENTITY_TYPES.map((t) => `<option${(d.entity_type || c.entity_type) === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      <div><label class="onb-l">Registration / CIN no.</label>
        <input class="onb-in" id="f_reg" value="${esc(d.registration_no || "")}" /></div>
      <div><label class="onb-l">PAN</label><input class="onb-in" id="f_pan" value="${esc(d.pan || "")}" /></div>
      <div><label class="onb-l">GSTIN (if any)</label><input class="onb-in" id="f_gst" value="${esc(d.gstin || "")}" /></div>
      <div><label class="onb-l">Authorised signatory</label><input class="onb-in" id="f_sig" value="${esc(d.signatory_name || "")}" /></div>
      <div><label class="onb-l">Designation</label><input class="onb-in" id="f_desig" value="${esc(d.signatory_designation || "")}" /></div>
      <div><label class="onb-l">Contact phone</label><input class="onb-in" id="f_phone" value="${esc(d.contact_phone || "")}" /></div>
      <div><label class="onb-l">Contact email</label><input class="onb-in" id="f_email" value="${esc(d.contact_email || "")}" /></div>
    </div>
    <label class="onb-l">Registered address</label>
    <textarea class="onb-in" id="f_addr" rows="3">${esc(d.address || "")}</textarea>
    <div class="onb-actions"><button class="onb-btn" id="saveDetails">Save &amp; continue</button></div>
  </div>`);
  document.querySelector("#saveDetails")?.addEventListener("click", saveDetails);
}
async function saveDetails() {
  const g = (id) => (document.querySelector(id)?.value || "").trim();
  const legal = g("#f_legal");
  if (!legal) return toast("Registered / legal name is required.");
  const details = {
    legal_name: legal, entity_type: g("#f_type"), registration_no: g("#f_reg"),
    pan: g("#f_pan"), gstin: g("#f_gst"), signatory_name: g("#f_sig"),
    signatory_designation: g("#f_desig"), contact_phone: g("#f_phone"),
    contact_email: g("#f_email"), address: g("#f_addr")
  };
  try {
    setBusy(true);
    await saveOnboardingSubmission({ session_token: state.session, details });
    state.details = details; state.step = "documents"; render();
  } catch (e) { toast(e.message); } finally { setBusy(false); }
}

// ── Documents ────────────────────────────────────────────────────────────────
function renderDocuments() {
  const list = (state.context?.checklist) || [];
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Upload documents</h2>
    <p class="onb-muted">Required items are marked. Accepted: PDF or image.</p>
    ${list.map((doc) => {
      const up = state.uploaded[doc.document_key];
      return `<div class="onb-doc">
        <div><strong>${esc(doc.label)}</strong> ${doc.is_required ? '<span class="onb-req">REQUIRED</span>' : ""}
          <small>${esc(doc.description || "")}</small>
          ${up ? `<span class="onb-ok">✓ ${esc(up.name)}</span>` : ""}</div>
        <div><input type="file" id="file_${esc(doc.document_key)}" accept="application/pdf,image/*" style="max-width:150px;font-size:.72rem" /></div>
      </div>`;
    }).join("")}
    <div class="onb-actions"><button class="onb-btn" id="docsNext">Continue</button></div>
  </div>`);
  list.forEach((doc) => {
    document.querySelector(`#file_${CSS.escape(doc.document_key)}`)?.addEventListener("change", (e) => uploadDoc(e, doc));
  });
  document.querySelector("#docsNext")?.addEventListener("click", () => {
    const missing = (state.context?.checklist || []).filter((d) => d.is_required && !state.uploaded[d.document_key]);
    if (missing.length) return toast(`Please upload: ${missing.map((m) => m.label).join(", ")}`);
    state.step = "photo"; render();
  });
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function uploadDoc(e, doc) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return toast("File too large (max 15 MB).");
  try {
    setBusy(true); toast(`Uploading ${doc.label}…`, true);
    const base64 = await fileToBase64(file);
    const r = await uploadOnboardingDocument({
      session_token: state.session, document_key: doc.document_key, document_label: doc.label,
      file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size, base64
    });
    state.uploaded[doc.document_key] = { name: file.name, link: r.web_view_link };
    renderDocuments(); toast(`${doc.label} uploaded.`, true);
  } catch (err) { toast(err.message); } finally { setBusy(false); }
}

// ── Live photo ───────────────────────────────────────────────────────────────
async function renderPhoto() {
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Live photo</h2>
    <p class="onb-muted">Center your face and capture a clear photo for verification.</p>
    ${state.photoDataUrl
      ? `<img class="onb-shot" src="${state.photoDataUrl}" alt="captured" />
         <div class="onb-actions"><button class="onb-btn ghost" id="retake">Retake</button>
         <button class="onb-btn" id="photoNext">Continue</button></div>`
      : `<video class="onb-cam" id="cam" autoplay playsinline muted></video>
         <div class="onb-actions"><button class="onb-btn" id="snap">Capture</button></div>`}
  </div>`);
  if (!state.photoDataUrl) {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const v = document.querySelector("#cam"); if (v) v.srcObject = state.stream;
    } catch { toast("Camera access is required for the live photo."); }
    document.querySelector("#snap")?.addEventListener("click", snap);
  } else {
    document.querySelector("#retake")?.addEventListener("click", () => { state.photoDataUrl = ""; renderPhoto(); });
    document.querySelector("#photoNext")?.addEventListener("click", () => { stopCam(); state.step = "terms"; render(); });
  }
}
function snap() {
  const v = document.querySelector("#cam");
  if (!v) return;
  const canvas = document.createElement("canvas");
  canvas.width = v.videoWidth || 640; canvas.height = v.videoHeight || 480;
  canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
  state.photoDataUrl = canvas.toDataURL("image/jpeg", 0.82);
  stopCam(); renderPhoto();
}
function stopCam() { try { state.stream?.getTracks().forEach((t) => t.stop()); } catch {} state.stream = null; }

// ── Terms ────────────────────────────────────────────────────────────────────
function renderTerms() {
  const t = state.context?.terms;
  if (!t) { shell(`<div class="onb-card">${heading()}<p class="onb-muted">Terms are not configured for this division yet. Please contact Varada Nexus.</p></div>`); return; }
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>${esc(t.title)}</h2>
    <div class="onb-terms">${t.body}</div>
    <label class="onb-check"><input type="checkbox" id="agree" />
      <span>I have read and accept these Terms &amp; Conditions on behalf of the organisation, and I am authorised to do so. I understand a live photo, timestamp and device details are recorded as acceptance evidence.</span></label>
    <div class="onb-actions"><button class="onb-btn" id="submitAll">Accept &amp; submit onboarding</button></div>
  </div>`);
  document.querySelector("#submitAll")?.addEventListener("click", submitAll);
}
async function submitAll() {
  if (!document.querySelector("#agree")?.checked) return toast("Please tick the box to accept the Terms.");
  try {
    setBusy(true); toast("Submitting…", true);
    await acceptOnboardingTerms({
      session_token: state.session,
      terms_version: state.context.terms.version,
      live_image_base64: state.photoDataUrl || null
    });
    state.step = "done"; render();
  } catch (e) { toast(e.message); } finally { setBusy(false); }
}

// ── Done ─────────────────────────────────────────────────────────────────────
function renderDone() {
  shell(`<div class="onb-card" style="text-align:center;padding:2.4rem 1.2rem">
    <div style="font-size:2.4rem">✓</div>
    <h1>Onboarding submitted</h1>
    <p class="onb-muted">Thank you. Your details and documents have been received by Varada Nexus Private Limited.
    Our team will review and contact you if anything further is required. You may close this page.</p>
  </div>`);
}

function render() {
  switch (state.step) {
    case "verify": return renderVerify();
    case "details": return renderDetails();
    case "documents": return renderDocuments();
    case "photo": return renderPhoto();
    case "terms": return renderTerms();
    case "done": return renderDone();
  }
}

async function boot() {
  if (!token) { shell(`<div class="onb-card"><h1>Invalid link</h1><p class="onb-muted">This onboarding link is missing or invalid.</p></div>`); return; }
  shell(`<div class="onb-card"><p class="onb-muted">Loading your onboarding…</p></div>`);
  try {
    const r = await getOnboardingContext({ public_token: token });
    state.context = r.context;
    if (["submitted", "approved"].includes(state.context?.status)) { state.step = "done"; }
    render();
  } catch (e) {
    shell(`<div class="onb-card"><h1>Onboarding unavailable</h1><p class="onb-muted">${esc(e.message)}</p></div>`);
  }
}

boot();
