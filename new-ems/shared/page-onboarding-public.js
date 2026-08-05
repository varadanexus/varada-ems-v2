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
const SERVICE_OPTIONS = {
  "hospital-projects": ["Hospital / Building Construction", "Medical Equipment Procurement", "Project Management / Consultancy", "Licensing & Compliance", "Interiors / MEP", "Renovation / Expansion"],
  "interiors": ["Interior Design", "Turnkey Fit-out", "Modular & Furniture", "3D Design / Visualisation", "Renovation", "MEP & Civil Works"],
  "transport": ["Full Truck Load (FTL)", "Part Load (PTL)", "Bulk / Mineral Logistics", "Warehousing", "Fleet on Contract", "Last-mile Delivery"],
  "digital-services": ["Digital Marketing / SEO", "Social Media Management", "Paid Ads / Performance", "Website / App Development", "Branding & Creative", "Content Production"]
};
const COMPANY = {
  name: "Varada Nexus Private Limited",
  office: "80-17-28, K B Nagar, A V A Road, Rajahmundry, Andhra Pradesh 533101",
  cin: "U43121AP2025PTC117741",
  gst: "37AAKCV7495B1ZV",
  grievanceEmail: "grievance@varadanexus.com"
};
// Only these two are shown (and required) by default; every other checklist
// item is optional and revealed on demand via "Add a document".
const PINNED_DOCS = ["signed_application", "letter_of_authorization"];
// Live-photo face gating: a face must be well-placed in the circle with a match
// score at/above this percentage before the shot is (auto-)captured.
const FACE_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const FACE_MATCH_MIN = 75;

const state = {
  step: "verify",          // verify | details | documents | photo | terms | done
  context: null,
  session: "",
  otpSent: false,
  masked: "",
  details: {},
  uploaded: {},            // document_key -> { name, link, mime }
  uploadedData: {},        // document_key -> data URL (in-memory only, for preview)
  extraDocs: [],           // optional checklist keys the user chose to add
  stream: null,
  photoDataUrl: "",
  geo: null,               // { lat, lng, acc } captured via geolocation
  photoMeta: null,         // { captured_at, geo } evidence for the live photo
  faceMatch: 0,            // live face-match % against the circle guide
  termsAccepted: false,
  maxStepIdx: 0,
  busy: false
};

const STEP_ORDER = ["verify", "details", "documents", "photo", "terms"];

// ── Progress persistence (resume the link anytime) ───────────────────────────
function persist() {
  const full = {
    session: state.session, step: state.step, maxStepIdx: state.maxStepIdx,
    details: state.details, uploaded: state.uploaded, extraDocs: state.extraDocs, photoDataUrl: state.photoDataUrl, photoMeta: state.photoMeta, ts: Date.now()
  };
  try { localStorage.setItem("onb_" + token, JSON.stringify(full)); return; } catch {}
  // Fallback without the (large) photo if storage is full.
  try {
    const slim = { session: state.session, step: state.step, maxStepIdx: state.maxStepIdx, details: state.details, uploaded: state.uploaded, extraDocs: state.extraDocs };
    localStorage.setItem("onb_" + token, JSON.stringify(slim));
  } catch {}
}
function loadPersisted() {
  try { const raw = localStorage.getItem("onb_" + token); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function clearPersisted() { try { localStorage.removeItem("onb_" + token); } catch {} }
// A small, non-sensitive receipt snapshot so the confirmation summary survives a
// page reload after submission (no bank/PAN/GST and no image bytes are stored).
function saveDoneSnapshot() {
  try {
    const d = state.details || {};
    const snap = {
      details: {
        legal_name: d.legal_name, entity_type: d.entity_type,
        signatory_name: d.signatory_name, signatory_designation: d.signatory_designation,
        contact_phone: d.contact_phone, contact_email: d.contact_email,
        services_required: d.services_required || [], services_other: d.services_other || ""
      },
      uploaded: state.uploaded || {},
      photoMeta: state.photoMeta || null
    };
    localStorage.setItem("onbdone_" + token, JSON.stringify(snap));
  } catch {}
}
function loadDoneSnapshot() { try { const raw = localStorage.getItem("onbdone_" + token); return raw ? JSON.parse(raw) : null; } catch { return null; } }

function goTo(step) {
  state.step = step;
  const idx = STEP_ORDER.indexOf(step);
  if (idx > state.maxStepIdx) state.maxStepIdx = idx;
  persist();
  render();
}

// If a call fails because the OTP session expired, send the user back to verify
// but keep everything they entered (persisted). Returns true if it handled it.
function handleErr(e) {
  const m = String(e?.message || e);
  if (/session|expired|verify again/i.test(m)) {
    state.session = ""; state.otpSent = false; state.step = "verify";
    persist();
    toast("Your session expired — please verify again. Your entries are saved.");
    renderVerify();
    return true;
  }
  return false;
}

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
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box}
      body{margin:0;background:#050609;color:#eae7df;font-family:'Inter',system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased}
      .onb{position:relative;min-height:100vh;background:
        radial-gradient(1100px 520px at 50% -10%, rgba(226,200,126,.12), transparent 62%),
        radial-gradient(760px 520px at 50% 118%, rgba(195,154,68,.07), transparent 60%),
        #050609}
      .onb::after{content:"";position:fixed;inset:0;background:url('/new-ems/assets/pdf/vn-logo.png') center 44%/min(430px,58vw) no-repeat;opacity:.045;pointer-events:none;z-index:0}
      @keyframes onbUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      .onb-top{position:relative;z-index:2;height:3px;background:linear-gradient(90deg,#8a6d2a,#e6c87e,#c39a44,#8a6d2a)}
      .onb-bar{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:16px 22px;
        border-bottom:1px solid rgba(226,200,126,.16);background:linear-gradient(180deg,rgba(12,13,17,.85),rgba(5,6,9,.35));backdrop-filter:blur(8px)}
      .onb-brand{display:flex;align-items:center;gap:.75rem}
      .onb-brand img{width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 10px rgba(226,200,126,.3))}
      .onb-brand .wm strong{display:block;font-size:.95rem;letter-spacing:.32em;color:#f4efe2;font-weight:700}
      .onb-brand .wm span{display:block;font-size:.55rem;letter-spacing:.36em;color:#c39a44;text-transform:uppercase;margin-top:2px}
      .onb-secure{display:flex;align-items:center;gap:.5rem;font-size:.68rem;color:#8f95a1;letter-spacing:.06em}
      .onb-secure .lock{display:grid;place-items:center;width:26px;height:26px;border:1px solid rgba(226,200,126,.35);border-radius:50%;color:#e6c87e;font-size:.8rem}
      .onb-wrap{position:relative;z-index:1;width:min(980px,calc(100% - 40px));margin:0 auto;padding:2.2rem 0 4rem}
      .onb-steps{display:flex;gap:.4rem;margin:0 0 1.5rem;flex-wrap:wrap;justify-content:center}
      .onb-chip{font-size:.66rem;letter-spacing:.03em;padding:.34rem .6rem;border:1px solid rgba(255,255,255,.09);border-radius:999px;color:#8b8f99;background:rgba(255,255,255,.02)}
      .onb-chip.active{border-color:rgba(226,200,126,.6);color:#e6c87e;background:rgba(226,200,126,.08);box-shadow:0 0 0 1px rgba(226,200,126,.12)}
      .onb-chip.done{border-color:rgba(90,180,130,.4);color:#8fd6ac}
      .onb-chip[data-goto]{cursor:pointer}.onb-chip[data-goto]:hover{border-color:rgba(226,200,126,.55);color:#e6c87e}
      .onb-savenote{text-align:center;color:#7a7f8a;font-size:.68rem;margin:-.4rem 0 1.4rem;letter-spacing:.03em}
      .onb-stepper{display:flex;align-items:flex-start;justify-content:space-between;max-width:640px;margin:.4rem auto 1.6rem}
      .onb-step{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;gap:.45rem}
      .onb-step:not(:last-child)::after{content:"";position:absolute;top:15px;left:50%;width:100%;height:2px;background:rgba(255,255,255,.1)}
      .onb-step.done:not(:last-child)::after{background:linear-gradient(90deg,#c39a44,#e6c87e)}
      .onb-step-dot{position:relative;z-index:1;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:.8rem;font-weight:700;border:1px solid rgba(255,255,255,.14);background:#0c0d11;color:#8b8f99;transition:.2s}
      .onb-step.active .onb-step-dot{border-color:#e6c87e;color:#1b1508;background:linear-gradient(180deg,#e8cf86,#c39a44);box-shadow:0 0 0 5px rgba(226,200,126,.13)}
      .onb-step.done .onb-step-dot{border-color:rgba(226,200,126,.5);color:#e6c87e;background:rgba(226,200,126,.1)}
      .onb-step-label{font-size:.63rem;letter-spacing:.04em;color:#8b8f99;text-align:center;white-space:nowrap}
      .onb-step.active .onb-step-label{color:#e6c87e;font-weight:600}.onb-step.done .onb-step-label{color:#b9bec8}
      .onb-step[data-goto]{cursor:pointer}.onb-step[data-goto]:hover .onb-step-dot{border-color:#e6c87e;color:#e6c87e}
      .onb-rule{height:1px;background:linear-gradient(90deg,rgba(226,200,126,.55),rgba(226,200,126,0));margin:1rem 0 .2rem}
      .onb-sub{font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:#c39a44;margin:1.3rem 0 .5rem;font-weight:700;border-top:1px solid rgba(255,255,255,.06);padding-top:.9rem}
      .onb-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin:1.3rem 0 .2rem}
      .onb-trust-item{display:flex;gap:.6rem;align-items:flex-start;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:.7rem .8rem;background:rgba(255,255,255,.015)}
      .onb-trust-item .ico{display:grid;place-items:center;width:30px;height:30px;flex:0 0 30px;border-radius:8px;border:1px solid rgba(226,200,126,.28);color:#e6c87e;font-size:.85rem}
      .onb-trust-item strong{display:block;font-size:.76rem;color:#e7e3d9}.onb-trust-item small{color:#8b8f99;font-size:.68rem;line-height:1.35}
      @media(max-width:560px){.onb-trust{grid-template-columns:1fr}.onb-step-label{font-size:.55rem}}
      .onb-card{animation:onbUp .38s cubic-bezier(.2,.7,.3,1) both;position:relative;border-radius:18px;background:linear-gradient(162deg,rgba(22,24,30,.92),rgba(9,10,13,.96));
        padding:1.8rem 1.6rem;box-shadow:0 40px 90px -34px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.04)}
      .onb-card::before{content:"";position:absolute;inset:0;border-radius:18px;padding:1px;
        background:linear-gradient(140deg,rgba(226,200,126,.55),rgba(226,200,126,.05) 38%,rgba(226,200,126,.05) 62%,rgba(195,154,68,.4));
        -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
      .onb-eyebrow{margin:0 0 .5rem;font-size:.64rem;letter-spacing:.28em;text-transform:uppercase;color:#c39a44;font-weight:700}
      .onb-card h1{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:2rem;line-height:1.1;margin:.05rem 0 .3rem;color:#f7f2e7}
      .onb-card h2{font-family:'Playfair Display',serif;font-weight:600;font-size:1.2rem;margin:.3rem 0 1rem;color:#e6c87e}
      .onb-muted{color:#9aa0ab;font-size:.88rem;line-height:1.55}
      label.onb-l{display:block;margin:.8rem 0 .3rem;font-size:.74rem;letter-spacing:.04em;color:#c4c8d1;text-transform:uppercase}
      .onb-in{width:100%;background:rgba(8,9,12,.85);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#eee;padding:.7rem .8rem;font-size:.95rem;font-family:inherit;transition:.18s}
      .onb-in:focus{outline:none;border-color:#c39a44;box-shadow:0 0 0 3px rgba(226,200,126,.14);background:#0a0b0e}
      .onb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.6rem .8rem}
      .onb-btn{background:linear-gradient(180deg,#e8cf86,#c39a44);color:#1b1508;border:0;border-radius:10px;padding:.78rem 1.3rem;font-weight:700;font-size:.95rem;font-family:inherit;cursor:pointer;letter-spacing:.02em;box-shadow:0 10px 24px -10px rgba(226,200,126,.55);transition:.18s}
      .onb-btn:hover{filter:brightness(1.06);transform:translateY(-1px)}
      .onb-btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.16);color:#e8e4da;box-shadow:none}
      .onb-btn.ghost:hover{border-color:rgba(226,200,126,.5);color:#f2ecdd;transform:none;filter:none}
      .onb-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none}
      .onb-actions{display:flex;gap:.6rem;margin-top:1.3rem;flex-wrap:wrap}
      .onb-doc{display:flex;align-items:center;justify-content:space-between;gap:.6rem;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:.7rem .8rem;margin:.55rem 0;background:rgba(255,255,255,.015)}
      .onb-doc small{color:#8b8f99;display:block;margin-top:2px;font-size:.76rem}
      .onb-docrm{background:none;border:0;color:#c9a26a;cursor:pointer;font-size:1rem;line-height:1;padding:0 .25rem;margin-left:.15rem;vertical-align:middle}
      .onb-docrm:hover{color:#f6b5bd}
      .onb-adddoc{margin:.7rem 0 .2rem}
      .onb-adddoc select{max-width:360px;border-style:dashed;border-color:rgba(226,200,126,.4)}
      .onb-adddoc select:hover{border-color:rgba(226,200,126,.7)}
      .onb-req{color:#e6c87e;font-size:.62rem;letter-spacing:.1em;border:1px solid rgba(226,200,126,.3);padding:.1rem .35rem;border-radius:4px;margin-left:.4rem}
      .onb-ok{color:#8fd6ac;font-size:.78rem;display:block;margin-top:3px}
      .onb-terms{max-height:52vh;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:1.1rem 1.2rem;background:rgba(8,9,12,.6);line-height:1.7;color:#cfd3db;font-size:.87rem}
      .onb-terms h2{font-family:'Playfair Display',serif;color:#e6c87e;font-size:1.15rem}
      .onb-terms h3{color:#e6c87e;font-size:.95rem;margin-top:1.1rem}
      .onb-scrollhint{font-size:.74rem;color:#c39a44;text-align:center;margin:.65rem 0 .1rem;letter-spacing:.02em}
      .onb-scrollhint.done{color:#8fd6ac}
      .onb-check.disabled{opacity:.55}
      video.onb-cam{width:100%;max-width:520px;display:block;margin:0 auto;border-radius:14px;background:#000;aspect-ratio:4/3;object-fit:cover;border:1px solid rgba(226,200,126,.2)}
      img.onb-shot{width:100%;max-width:520px;display:block;margin:0 auto;border-radius:14px;background:#000;object-fit:contain;border:1px solid rgba(226,200,126,.2)}
      .onb-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(20px);opacity:0;transition:.25s;padding:.75rem 1.1rem;border-radius:10px;font-size:.86rem;z-index:50;backdrop-filter:blur(6px)}
      .onb-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
      .onb-toast.ok{background:rgba(18,53,36,.92);color:#8ef0b8;border:1px solid #2f6b45}
      .onb-toast.err{background:rgba(58,20,24,.92);color:#f6b5bd;border:1px solid #7a2731}
      .onb-check{display:grid;grid-template-columns:20px 1fr;gap:.6rem;align-items:start;margin-top:.7rem;font-size:.83rem;color:#cfd3db;line-height:1.5;cursor:pointer}
      .onb-check input{width:18px;height:18px;margin:2px 0 0;accent-color:#c39a44;cursor:pointer}
      .onb-servicelist{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.35rem .9rem;margin:.25rem 0 .4rem}
      .onb-servicelist .onb-check{margin-top:.15rem;font-size:.82rem}
      @media(max-width:560px){.onb-servicelist{grid-template-columns:1fr}}
      .onb-note{border:1px solid rgba(226,200,126,.28);background:rgba(226,200,126,.06);border-radius:12px;padding:.85rem .95rem;margin:.7rem 0 .4rem;font-size:.8rem;line-height:1.55;color:#d7d2c4}
      .onb-note strong{color:#e6c87e}
      .onb-geo{font-size:.72rem;color:#8f95a1;margin:.55rem 0 .1rem;letter-spacing:.02em;text-align:center}
      .onb-facewrap{position:relative;width:100%;max-width:520px;margin:0 auto;border-radius:14px;overflow:hidden}
      .onb-facewrap video{display:block;width:100%}
      .onb-facering{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;aspect-ratio:1/1;border-radius:50%;border:3px solid rgba(226,200,126,.85);box-shadow:0 0 0 1000px rgba(0,0,0,.42);pointer-events:none;transition:border-color .2s,box-shadow .2s}
      .onb-facering.ok{border-color:#46d17f;box-shadow:0 0 0 1000px rgba(0,0,0,.42),0 0 20px 5px rgba(70,209,127,.55)}
      .onb-facehint{position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:.8rem;font-weight:600;color:#f2ecdd;text-shadow:0 1px 5px #000,0 0 2px #000;pointer-events:none;z-index:2;padding:0 10px}
      .onb-facehint.ok{color:#8ef0b8}
      .onb-facecount{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:'Playfair Display',Georgia,serif;font-weight:800;font-size:5.2rem;line-height:1;color:#8ef0b8;text-shadow:0 3px 22px rgba(0,0,0,.75);pointer-events:none;z-index:3}
      .onb-doneicon{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:rgba(90,180,130,.14);border:1px solid rgba(90,180,130,.5);color:#8fd6ac;font-size:2rem;margin:0 auto}
      .onb-summary{border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;margin:.3rem 0 .5rem;background:rgba(255,255,255,.015)}
      .onb-sumrow{display:flex;justify-content:space-between;gap:1rem;padding:.6rem .85rem;border-bottom:1px solid rgba(255,255,255,.05);font-size:.85rem}
      .onb-sumrow:last-child{border-bottom:0}
      .onb-sumrow span{color:#8b8f99;flex:0 0 auto}
      .onb-sumrow strong{color:#e7e3d9;text-align:right;font-weight:600}
      .onb-docview{cursor:pointer;transition:background .15s}
      .onb-docview:hover{background:rgba(226,200,126,.07)}
      .onb-docview strong{color:#e6c87e}
      .onb-thumb{width:34px;height:34px;border-radius:6px;object-fit:cover;vertical-align:middle;margin:0 .1rem 0 .5rem;border:1px solid rgba(226,200,126,.35)}
      .onb-modal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,4,6,.74);backdrop-filter:blur(4px)}
      .onb-modal-box{width:min(880px,100%);max-height:92vh;display:flex;flex-direction:column;background:#0c0d11;border:1px solid rgba(226,200,126,.25);border-radius:14px;overflow:hidden;box-shadow:0 40px 90px -30px #000}
      .onb-modal-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1rem;border-bottom:1px solid rgba(255,255,255,.08);color:#e7e3d9;font-size:.9rem}
      .onb-modal-x{background:none;border:0;color:#c9a26a;font-size:1.6rem;line-height:1;cursor:pointer;padding:0 .2rem}
      .onb-modal-x:hover{color:#f6b5bd}
      .onb-modal-body{overflow:auto;background:#050609;display:flex;align-items:center;justify-content:center;min-height:220px}
      .onb-modal-img{max-width:100%;max-height:82vh;display:block}
      .onb-modal-frame{width:100%;height:78vh;border:0;background:#fff}
      .onb-modal-msg{padding:2rem 1.4rem;text-align:center;color:#cfd3db;font-size:.9rem}
      .onb-modal-msg a{margin-top:1rem;display:inline-block;text-decoration:none}
      .onb-modal-foot{padding:.55rem 1rem;border-top:1px solid rgba(255,255,255,.06);color:#8b8f99;font-size:.74rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .onb-foot{margin:1.4rem auto 0;text-align:center;color:#6f7480;font-size:.68rem;letter-spacing:.05em}
      .onb-foot strong{color:#9aa0ab;font-weight:600}
      @media(max-width:560px){.onb-grid{grid-template-columns:1fr}.onb-card h1{font-size:1.6rem}.onb-secure span{display:none}}
    </style>
    <main class="onb">
      <div class="onb-top"></div>
      <header class="onb-bar">
        <div class="onb-brand">
          <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" onerror="this.style.display='none'" />
          <div class="wm"><strong>VARADA NEXUS</strong><span>Private Limited</span></div>
        </div>
        <div class="onb-secure"><span class="lock">&#128274;</span><span>Secure&nbsp;Onboarding</span></div>
      </header>
      <div class="onb-wrap">
        ${inner}
        <div class="onb-trust">
          <div class="onb-trust-item"><span class="ico">&#128274;</span><div><strong>Bank-grade security</strong><small>Encrypted in transit &amp; at rest</small></div></div>
          <div class="onb-trust-item"><span class="ico">&#10003;</span><div><strong>Verified identity</strong><small>One-time code &amp; live photo</small></div></div>
          <div class="onb-trust-item"><span class="ico">&#9878;</span><div><strong>Confidential</strong><small>Used only for your onboarding</small></div></div>
        </div>
        <div class="onb-foot">&copy; Varada Nexus Private Limited &middot; <strong>Encrypted &amp; confidential onboarding</strong></div>
      </div>
      <div id="onbToast" class="onb-toast"></div>
    </main>`;
}

function steps() {
  const labels = { verify: "Verify", details: "Details", documents: "Documents", photo: "Authentication", terms: "Terms" };
  const idx = STEP_ORDER.indexOf(state.step);
  const html = STEP_ORDER.map((s, i) => {
    const done = i < idx, active = s === state.step;
    const clickable = Boolean(state.session) && i >= 1 && i <= state.maxStepIdx && i !== idx;
    return `<div class="onb-step ${active ? "active" : ""} ${done ? "done" : ""}"${clickable ? ` data-goto="${s}" role="button" tabindex="0"` : ""}>
      <div class="onb-step-dot">${done ? "&#10003;" : (i + 1)}</div>
      <div class="onb-step-label">${labels[s]}</div>
    </div>`;
  }).join("");
  const note = state.session ? `<p class="onb-savenote">Your progress is saved — resume from the same link anytime.</p>` : "";
  return `<div class="onb-stepper">${html}</div>${note}`;
}

function heading() {
  const c = state.context || {};
  const division = DIVISION_LABELS[c.division_code] || c.division_code || "";
  return `<p class="onb-eyebrow">${esc(division)} · Client Onboarding</p><h1>${esc(c.entity_name || "Welcome")}</h1><p class="onb-muted">Complete your secure onboarding with Varada Nexus Private Limited to begin your engagement.</p><div class="onb-rule"></div>`;
}

// ── Verify ───────────────────────────────────────────────────────────────────
function renderVerify() {
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Verify it's you</h2>
    <p class="onb-muted">We'll send a one-time code to the contact on file. ${state.masked ? `Code sent to <strong>${esc(state.masked)}</strong>.` : ""}</p>
    ${!state.otpSent
      ? `<div class="onb-actions"><button class="onb-btn" id="sendOtp">Send code</button></div>`
      : `<label class="onb-l">Enter the code</label>
         <input class="onb-in" id="otp" inputmode="numeric" maxlength="8" placeholder="6-digit code" style="max-width:280px;letter-spacing:.3em" />
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
    goTo("details");
  } catch (e) { toast(e.message); } finally { setBusy(false); }
}

// ── Details ──────────────────────────────────────────────────────────────────
function renderDetails() {
  const c = state.context || {};
  const d = state.details;
  const division = DIVISION_LABELS[c.division_code] || c.division_code || "";
  const ck = (v) => v ? " checked" : "";
  const yn = (id, val) => `<select class="onb-in" id="${id}"><option value="">Select…</option><option${val === "Yes" ? " selected" : ""}>Yes</option><option${val === "No" ? " selected" : ""}>No</option></select>`;
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Client onboarding form</h2>
    <p class="onb-muted">Fields marked <span style="color:#e6c87e">*</span> are required. On continue we generate a ready-to-sign application on our letterhead for you to print, stamp and upload.</p>

    <div class="onb-sub">1 · Client Details</div>
    <label class="onb-l">Name of entity / firm *</label>
    <input class="onb-in" id="f_legal" value="${esc(d.legal_name || c.entity_name || "")}" />
    <div class="onb-grid">
      <div><label class="onb-l">Type of entity *</label>
        <select class="onb-in" id="f_type"><option value="">Select…</option>${ENTITY_TYPES.map((t) => `<option${(d.entity_type || c.entity_type) === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      <div><label class="onb-l">Registration No. / CIN / LLPIN *</label><input class="onb-in" id="f_reg" value="${esc(d.registration_no || "")}" /></div>
      <div><label class="onb-l">Date of incorporation</label><input class="onb-in" id="f_doi" type="date" value="${esc(d.date_incorporation || "")}" /></div>
      <div><label class="onb-l">Nature of business</label><input class="onb-in" id="f_nob" value="${esc(d.nature_of_business || "")}" /></div>
      <div><label class="onb-l">Website</label><input class="onb-in" id="f_web" value="${esc(d.website || "")}" placeholder="https://" /></div>
      <div><label class="onb-l">Social handle</label><input class="onb-in" id="f_social" value="${esc(d.social_handle || "")}" /></div>
    </div>
    <label class="onb-l">Registered address *</label>
    <textarea class="onb-in" id="f_addr" rows="2">${esc(d.address || "")}</textarea>
    <div class="onb-grid">
      <div><label class="onb-l">City *</label><input class="onb-in" id="f_city" value="${esc(d.city || "")}" /></div>
      <div><label class="onb-l">State *</label><input class="onb-in" id="f_state" value="${esc(d.state || "")}" /></div>
      <div><label class="onb-l">PIN *</label><input class="onb-in" id="f_pin" inputmode="numeric" value="${esc(d.pincode || "")}" /></div>
    </div>

    <div class="onb-sub">2 · Contact Person</div>
    <div class="onb-grid">
      <div><label class="onb-l">Name *</label><input class="onb-in" id="f_sig" value="${esc(d.signatory_name || "")}" /></div>
      <div><label class="onb-l">Designation *</label><input class="onb-in" id="f_desig" value="${esc(d.signatory_designation || "")}" /></div>
      <div><label class="onb-l">Mobile *</label><input class="onb-in" id="f_phone" inputmode="tel" value="${esc(d.contact_phone || "")}" /></div>
      <div><label class="onb-l">Email *</label><input class="onb-in" id="f_email" inputmode="email" value="${esc(d.contact_email || "")}" /></div>
      <div><label class="onb-l">Alternate contact name</label><input class="onb-in" id="f_altname" value="${esc(d.alt_contact_name || "")}" /></div>
      <div><label class="onb-l">Alternate contact mobile</label><input class="onb-in" id="f_altmob" value="${esc(d.alt_contact_mobile || "")}" /></div>
      <div><label class="onb-l">Authorised to sign / approve for the entity? *</label>${yn("f_auth", d.authorised_to_sign)}</div>
      <div><label class="onb-l">If no, approval needed from</label><input class="onb-in" id="f_approver" value="${esc(d.approver_name || "")}" /></div>
    </div>

    <div class="onb-sub">3 · Statutory Details</div>
    <div class="onb-grid">
      <div><label class="onb-l">PAN of entity *</label><input class="onb-in" id="f_pan" value="${esc(d.pan || "")}" style="text-transform:uppercase" /></div>
      <div><label class="onb-l">GSTIN</label><input class="onb-in" id="f_gst" value="${esc(d.gstin || "")}" style="text-transform:uppercase" /></div>
      <div><label class="onb-l">Udyam / MSME No.</label><input class="onb-in" id="f_udyam" value="${esc(d.udyam_no || "")}" /></div>
      <div><label class="onb-l">TDS applicable on payments to us?</label>${yn("f_tds", d.tds_applicable)}</div>
      <div><label class="onb-l">TDS section (if yes)</label><input class="onb-in" id="f_tdssec" value="${esc(d.tds_section || "")}" /></div>
    </div>
    <label class="onb-check"><input type="checkbox" id="f_nogst"${ck(d.gst_not_registered)} /><span>Not registered under GST</span></label>

    <div class="onb-sub">4 · Service Required — ${esc(division)}</div>
    <label class="onb-l">What services do you need? *</label>
    <div class="onb-servicelist">
      ${(SERVICE_OPTIONS[c.division_code] || []).map((s) => `<label class="onb-check"><input type="checkbox" class="svc" value="${esc(s)}"${(d.services_required || []).includes(s) ? " checked" : ""} /><span>${esc(s)}</span></label>`).join("")}
    </div>
    <label class="onb-l">Other service (if any)</label>
    <input class="onb-in" id="f_svcother" value="${esc(d.services_other || "")}" />
    <label class="onb-l">Brief requirement</label>
    <textarea class="onb-in" id="f_brief" rows="2">${esc(d.brief_requirement || "")}</textarea>
    <div class="onb-grid">
      <div><label class="onb-l">Site / project location</label><input class="onb-in" id="f_ploc" value="${esc(d.project_location || "")}" /></div>
      <div><label class="onb-l">Indicative budget</label><input class="onb-in" id="f_budget" value="${esc(d.indicative_budget || "")}" /></div>
      <div><label class="onb-l">Expected start date / timeline</label><input class="onb-in" id="f_timeline" value="${esc(d.expected_timeline || "")}" /></div>
      <div><label class="onb-l">How did you hear about us?</label><input class="onb-in" id="f_ref" value="${esc(d.referral_source || "")}" /></div>
    </div>

    <div class="onb-sub">5 · Billing &amp; Refund Bank Details</div>
    <p class="onb-muted" style="font-size:.8rem;margin:.1rem 0 .3rem">Bank account where any eligible refund would be credited. Please ensure these details exactly match your bank records.</p>
    <div class="onb-grid">
      <div><label class="onb-l">Billing name (if different)</label><input class="onb-in" id="f_billname" value="${esc(d.billing_name || "")}" /></div>
      <div><label class="onb-l">Payment mode</label>
        <select class="onb-in" id="f_pay"><option value="">Select…</option>${["NEFT / RTGS", "Cheque", "UPI", "Cash", "Other"].map((o) => `<option${d.payment_mode === o ? " selected" : ""}>${o}</option>`).join("")}</select></div>
      <div><label class="onb-l">Account holder name</label><input class="onb-in" id="f_acholder" value="${esc(d.account_holder || "")}" /></div>
      <div><label class="onb-l">Account number</label><input class="onb-in" id="f_acno" inputmode="numeric" autocomplete="off" value="${esc(d.account_number || "")}" /></div>
      <div><label class="onb-l">IFSC code</label><input class="onb-in" id="f_ifsc" value="${esc(d.ifsc || "")}" style="text-transform:uppercase" /></div>
      <div><label class="onb-l">Bank name</label><input class="onb-in" id="f_bank" value="${esc(d.bank_name || "")}" /></div>
    </div>
    <label class="onb-l">Bank branch / address</label>
    <textarea class="onb-in" id="f_bankaddr" rows="2">${esc(d.bank_address || "")}</textarea>
    <label class="onb-l">Billing address &amp; state (if different)</label>
    <textarea class="onb-in" id="f_billaddr" rows="2">${esc(d.billing_address || "")}</textarea>

    <div class="onb-sub">6 · Declarations &amp; Consent *</div>
    <label class="onb-check"><input type="checkbox" id="c_authority"${ck(d.consent_authority)} /><span>I confirm the information and documents provided are true, complete and correct, and that I am duly authorised to submit this application and engage Varada Nexus Private Limited on behalf of the entity named above.</span></label>
    <label class="onb-check"><input type="checkbox" id="c_verify"${ck(d.consent_verify)} /><span>I consent to Varada Nexus verifying the details and documents (KYC), including with third-party and government sources where lawful.</span></label>
    <label class="onb-check"><input type="checkbox" id="c_data"${ck(d.consent_data)} /><span>I consent to the collection, processing and secure storage of this information for onboarding, service delivery, and legal and regulatory compliance.</span></label>
    <label class="onb-check"><input type="checkbox" id="c_engage"${ck(d.consent_engagement)} /><span>I understand no work, procurement or engagement is binding on the Company until a written work order / service agreement is signed and any required advance is received, and that the entity will be bound by those terms. Misrepresentation may lead to refusal or termination at our risk and cost.</span></label>
    <label class="onb-check"><input type="checkbox" id="c_tax"${ck(d.consent_tax)} /><span>I undertake to provide valid GST / tax documents and to deduct TDS correctly with certificates where applicable; any input-credit loss due to my non-compliance is my responsibility.</span></label>
    <label class="onb-check"><input type="checkbox" id="c_contact"${ck(d.consent_contact)} /><span>I consent to being contacted on the details provided (call, SMS, WhatsApp and email) in connection with this engagement.</span></label>

    <div class="onb-actions"><button class="onb-btn" id="saveDetails">Save &amp; generate application &rarr;</button></div>
  </div>`);
  document.querySelector("#saveDetails")?.addEventListener("click", saveDetails);
}
async function saveDetails() {
  const g = (id) => (document.querySelector(id)?.value || "").trim();
  const ckd = (id) => Boolean(document.querySelector(id)?.checked);
  const services = Array.from(document.querySelectorAll(".svc:checked")).map((x) => x.value);
  const details = {
    legal_name: g("#f_legal"), entity_type: g("#f_type"), registration_no: g("#f_reg"),
    date_incorporation: g("#f_doi"), nature_of_business: g("#f_nob"), website: g("#f_web"), social_handle: g("#f_social"),
    address: g("#f_addr"), city: g("#f_city"), state: g("#f_state"), pincode: g("#f_pin"),
    signatory_name: g("#f_sig"), signatory_designation: g("#f_desig"), contact_phone: g("#f_phone"), contact_email: g("#f_email"),
    alt_contact_name: g("#f_altname"), alt_contact_mobile: g("#f_altmob"),
    authorised_to_sign: g("#f_auth"), approver_name: g("#f_approver"),
    pan: g("#f_pan").toUpperCase(), gstin: g("#f_gst").toUpperCase(), gst_not_registered: ckd("#f_nogst"),
    udyam_no: g("#f_udyam"), tds_applicable: g("#f_tds"), tds_section: g("#f_tdssec"),
    services_required: services, services_other: g("#f_svcother"),
    brief_requirement: g("#f_brief"), project_location: g("#f_ploc"), indicative_budget: g("#f_budget"),
    expected_timeline: g("#f_timeline"), referral_source: g("#f_ref"),
    billing_name: g("#f_billname"), billing_address: g("#f_billaddr"), payment_mode: g("#f_pay"),
    account_holder: g("#f_acholder"), account_number: g("#f_acno"), ifsc: g("#f_ifsc").toUpperCase(),
    bank_name: g("#f_bank"), bank_address: g("#f_bankaddr"),
    consent_authority: ckd("#c_authority"), consent_verify: ckd("#c_verify"),
    consent_data: ckd("#c_data"), consent_engagement: ckd("#c_engage"),
    consent_tax: ckd("#c_tax"), consent_contact: ckd("#c_contact")
  };
  const required = {
    "Name of entity": details.legal_name, "Type of entity": details.entity_type,
    "Registration / CIN": details.registration_no, "Address": details.address, "City": details.city, "State": details.state, "PIN": details.pincode,
    "Contact name": details.signatory_name, "Designation": details.signatory_designation, "Mobile": details.contact_phone, "Email": details.contact_email,
    "Authorised to sign": details.authorised_to_sign, "PAN": details.pan
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return toast(`Please fill: ${missing.join(", ")}`);
  if (!services.length && !details.services_other) return toast("Please select at least one service you need.");
  if (!(details.consent_authority && details.consent_verify && details.consent_data && details.consent_engagement && details.consent_tax && details.consent_contact))
    return toast("Please tick all the declaration & consent boxes to continue.");

  state.details = details; persist();
  try {
    setBusy(true);
    await saveOnboardingSubmission({ session_token: state.session, details });
    try { await generateApplicationPdf(details, state.context || {}); } catch (pdfErr) { console.warn("pdf", pdfErr); }
    toast("Application downloaded — print it, sign & stamp, then upload under 'Signed Application Form'.", true);
    goTo("documents");
  } catch (e) { if (!handleErr(e)) toast(e.message); } finally { setBusy(false); }
}

// ── Application PDF (Varada Nexus letterhead) ─────────────────────────────────
async function loadLogoDataUrl() {
  try {
    const res = await fetch("/new-ems/assets/pdf/vn-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch { return null; }
}
// Downscale the logo so it embeds at a few KB instead of the full-res original.
function downscaleImage(dataUrl, maxW) {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      try { resolve({ dataUrl: cv.toDataURL("image/png"), w, h }); } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
// Convert the stored HTML T&C into ordered {tag,text} blocks for the PDF.
function stripHtmlToBlocks(html) {
  const out = []; const re = /<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi; let m;
  const clean = (s) => s.replace(/<[^>]+>/g, " ").replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  while ((m = re.exec(String(html || ""))) !== null) { const t = clean(m[2]); if (t) out.push({ tag: m[1].toLowerCase(), text: t }); }
  return out;
}
async function generateApplicationPdf(d, c) {
  const JS = window.jspdf && window.jspdf.jsPDF;
  if (!JS) { toast("Could not build the PDF (library still loading). Please refresh and retry."); throw new Error("jsPDF missing"); }
  const doc = new JS({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 46, TOP = 104, BOT = H - 58;
  const GUT = 18, colW = (W - 2 * M - GUT) / 2;
  const division = DIVISION_LABELS[c.division_code] || c.division_code || "";
  const dateStr = new Date().toLocaleDateString("en-GB");
  const refNo = `ONB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(token || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
  const smallLogo = await downscaleImage(await loadLogoDataUrl(), 160);
  let y = TOP;

  const ensure = (need) => { if (y + need > BOT) { doc.addPage(); y = TOP; } };

  // Section header: gold accent bar + uppercase title + hairline rule.
  const section = (title) => {
    ensure(30); y += 8;
    doc.setFillColor(173, 133, 52); doc.rect(M, y - 9, 3.4, 14, "F");
    doc.setFont("times", "bold"); doc.setFontSize(11.5); doc.setTextColor(120, 92, 30);
    doc.text(String(title).toUpperCase(), M + 11, y + 2);
    doc.setDrawColor(214, 190, 132); doc.setLineWidth(0.6); doc.line(M, y + 9, W - M, y + 9);
    y += 24;
  };

  // A single labelled value "cell": tiny gold caps label with the value beneath
  // and a hairline underline — laid out one or two per row (see fields()).
  const cellLines = (value, cw) => doc.splitTextToSize(String(value == null || value === "" ? "—" : value), cw);
  const cellH = (n) => 13 + n * 11 + 9;
  const drawCell = (x, label, lines, cw) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(150, 122, 58);
    doc.text(String(label).toUpperCase(), x, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.4); doc.setTextColor(28, 28, 30);
    doc.text(lines, x, y + 12.5);
    const b = y + 12.5 + lines.length * 11 + 4;
    doc.setDrawColor(226, 226, 228); doc.setLineWidth(0.5); doc.line(x, b, x + cw, b);
  };
  const fields = (items) => {
    let pend = null;
    const single = (it) => {
      const ls = cellLines(it.value, W - 2 * M);
      ensure(cellH(ls.length)); drawCell(M, it.label, ls, W - 2 * M); y += cellH(ls.length);
    };
    const pair = (a, b) => {
      const la = cellLines(a.value, colW), lb = cellLines(b.value, colW);
      const h = Math.max(cellH(la.length), cellH(lb.length));
      ensure(h); const sy = y;
      drawCell(M, a.label, la, colW); y = sy;
      drawCell(M + colW + GUT, b.label, lb, colW); y = sy + h;
    };
    items.forEach((it) => {
      if (it.full) { if (pend) { single(pend); pend = null; } single(it); }
      else if (pend) { pair(pend, it); pend = null; }
      else pend = it;
    });
    if (pend) single(pend);
  };

  // ── Title + reference meta ──────────────────────────────────────────
  doc.setFont("times", "bold"); doc.setFontSize(17); doc.setTextColor(24, 24, 26);
  doc.text("Client Onboarding Application", M, y);
  doc.setDrawColor(173, 133, 52); doc.setLineWidth(1.6); doc.line(M, y + 8, M + 150, y + 8);
  y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.4); doc.setTextColor(120, 122, 128);
  doc.text(`Division:  ${division}`, M, y + 6);
  doc.text(`Reference:  ${refNo}`, W / 2, y + 6, { align: "center" });
  doc.text(`Date:  ${dateStr}`, W - M, y + 6, { align: "right" });
  y += 22;

  // ── Instructions box ────────────────────────────────────────────────
  const boxH = 58; ensure(boxH + 10);
  doc.setFillColor(250, 247, 239); doc.setDrawColor(214, 190, 132); doc.setLineWidth(0.7);
  doc.roundedRect(M, y, W - 2 * M, boxH, 6, 6, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.4); doc.setTextColor(120, 92, 30);
  doc.text("HOW TO COMPLETE THIS APPLICATION", M + 14, y + 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(78, 78, 82);
  doc.text("1.  Print this document.        2.  Sign & affix the company seal in the Declaration.        3.  Scan or photograph every page.", M + 14, y + 32);
  doc.text("4.  Upload it under “Signed Application Form” in your onboarding link.        Keep a copy for your records.", M + 14, y + 46);
  y += boxH + 18;

  const gstLine = d.gst_not_registered ? "Not registered under GST" : (d.gstin || "—");
  const tdsLine = d.tds_applicable === "Yes" ? `Yes${d.tds_section ? " — Section " + d.tds_section : ""}` : (d.tds_applicable || "—");
  const authLine = d.authorised_to_sign === "No" ? `No — approval from: ${d.approver_name || "—"}` : (d.authorised_to_sign || "—");

  section("1 · Client Details");
  fields([
    { label: "Name of Entity / Firm", value: d.legal_name, full: true },
    { label: "Type of Entity", value: d.entity_type },
    { label: "Registration No. / CIN / LLPIN", value: d.registration_no },
    { label: "Date of Incorporation", value: d.date_incorporation },
    { label: "Nature of Business", value: d.nature_of_business },
    { label: "Registered Address", value: [d.address, d.city, d.state, d.pincode].filter(Boolean).join(", "), full: true },
    { label: "Website", value: d.website },
    { label: "Social Handle", value: d.social_handle }
  ]);

  section("2 · Contact Person");
  fields([
    { label: "Name", value: d.signatory_name },
    { label: "Designation", value: d.signatory_designation },
    { label: "Mobile", value: d.contact_phone },
    { label: "Email", value: d.contact_email },
    { label: "Alternate Contact Name", value: d.alt_contact_name },
    { label: "Alternate Contact Mobile", value: d.alt_contact_mobile },
    { label: "Authorised to Sign / Approve", value: authLine, full: true }
  ]);

  section("3 · Statutory Details");
  fields([
    { label: "PAN of Entity", value: d.pan },
    { label: "GSTIN", value: gstLine },
    { label: "Udyam / MSME No.", value: d.udyam_no },
    { label: "TDS Applicable on Payments", value: tdsLine },
    { label: "TDS Section", value: d.tds_section }
  ]);

  section("4 · Service Required");
  fields([
    { label: "Service Line", value: division },
    { label: "Indicative Budget", value: d.indicative_budget },
    { label: "Services Required", value: [...(d.services_required || []), d.services_other].filter(Boolean).join(", "), full: true },
    { label: "Brief Requirement", value: d.brief_requirement, full: true },
    { label: "Site / Project Location", value: d.project_location },
    { label: "Expected Start / Timeline", value: d.expected_timeline },
    { label: "How Did You Hear About Us", value: d.referral_source }
  ]);

  section("5 · Billing & Refund Bank Details");
  fields([
    { label: "Billing Name", value: d.billing_name || d.legal_name },
    { label: "Payment Mode", value: d.payment_mode },
    { label: "Account Holder Name", value: d.account_holder },
    { label: "Account Number", value: d.account_number },
    { label: "IFSC Code", value: d.ifsc },
    { label: "Bank Name", value: d.bank_name },
    { label: "Bank Branch / Address", value: d.bank_address, full: true },
    { label: "Billing Address & State", value: d.billing_address || [d.address, d.city, d.state, d.pincode].filter(Boolean).join(", "), full: true }
  ]);

  // ── Consents (drawn tick-marks) ─────────────────────────────────────
  section("6 · Consents Provided");
  doc.setFontSize(8.6); doc.setTextColor(50, 50, 52);
  [
    "The information and documents provided are true & correct; I am authorised to engage on behalf of the entity.",
    "Consent to KYC verification of the details & documents (including lawful third-party / government sources).",
    "Consent to collection, processing & secure storage for onboarding, service delivery and compliance.",
    "No engagement is binding until a work order / agreement is signed and any advance received; the entity is bound by those terms.",
    "Undertaking to provide valid GST / tax documents and correct TDS; any input-credit loss from non-compliance is the applicant's responsibility.",
    "Consent to be contacted (call / SMS / WhatsApp / email) in connection with this engagement."
  ].forEach((t) => {
    const ls = doc.splitTextToSize(t, W - 2 * M - 22);
    const need = Math.max(15, ls.length * 11) + 6; ensure(need);
    const bx = M + 1, by = y - 8;
    doc.setDrawColor(173, 133, 52); doc.setLineWidth(0.8); doc.roundedRect(bx, by, 11, 11, 2, 2);
    doc.setDrawColor(35, 120, 72); doc.setLineWidth(1.2);
    doc.line(bx + 2.4, by + 6, bx + 4.7, by + 8.4); doc.line(bx + 4.7, by + 8.4, bx + 9, by + 2.6);
    doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 52); doc.text(ls, M + 20, y);
    y += need;
  });

  // ── Declaration + signature / seal (kept together on one page) ──────
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const decl = "I/We confirm that the information and documents provided in this form are true, complete and correct, and that I am/we are duly authorised to submit this application and to engage Varada Nexus Private Limited (“the Company”) on behalf of the entity named above. I/We understand and agree that: (a) the Company may verify the information and documents provided; (b) any misrepresentation or omission may result in refusal or termination of the engagement, at our risk and cost; (c) no work, procurement or engagement is binding on the Company until a written work order or service agreement is signed and any required advance is received; (d) the entity shall be bound by the Company’s Terms & Conditions and the applicable work order / agreement; and (e) the Company may collect, process and store this information for onboarding, service delivery and legal / regulatory compliance.";
  const dl = doc.splitTextToSize(decl, W - 2 * M);
  // Reserve the full block (section header + declaration body + signature/seal).
  const declBlockH = 8 + 24 + dl.length * 11.5 + 22 + 98;
  if (y + declBlockH > BOT) { doc.addPage(); y = TOP; }
  section("Declaration");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(58, 58, 60);
  doc.text(dl, M, y, { lineHeightFactor: 1.35 }); y += dl.length * 11.5 + 22;

  const sy = y;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40, 40, 42);
  doc.text("Signature", M, sy + 4);
  doc.setDrawColor(120, 120, 124); doc.setLineWidth(0.6); doc.line(M, sy + 30, M + 230, sy + 30);
  doc.setFontSize(8.6); doc.setTextColor(70, 70, 72);
  doc.text("Name:  " + (d.signatory_name || "______________________________"), M, sy + 46);
  doc.text("Designation:  " + (d.signatory_designation || "______________________"), M, sy + 62);
  doc.text("Date: ______________          Place: ______________", M, sy + 78);
  doc.setDrawColor(170, 170, 174); doc.setLineWidth(0.7); doc.roundedRect(W - M - 178, sy, 178, 82, 4, 4);
  doc.setFontSize(7.8); doc.setTextColor(150, 150, 154);
  doc.text("Company Seal / Stamp", W - M - 178 / 2, sy + 46, { align: "center" });
  y = sy + 98;

  // ── Terms & Conditions (from the division's active version) ─────────
  if (c && c.terms && c.terms.body) {
    doc.addPage(); y = TOP;
    section(`Terms & Conditions — ${division}`);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(120, 120, 124);
    doc.text(`Version: ${c.terms.version || "—"}    ·    These terms form part of the engagement and the signed application.`, M, y); y += 16;
    stripHtmlToBlocks(c.terms.body).forEach((b) => {
      if (b.tag === "h2") {
        y += 4; doc.setFont("times", "bold"); doc.setFontSize(11.5); doc.setTextColor(120, 92, 30);
        const l = doc.splitTextToSize(b.text, W - 2 * M); ensure(l.length * 13 + 12); doc.text(l, M, y); y += l.length * 13 + 7;
      } else if (b.tag === "h3") {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(45, 45, 47);
        const l = doc.splitTextToSize(b.text, W - 2 * M); ensure(l.length * 11 + 8); doc.text(l, M, y); y += l.length * 11 + 4;
      } else {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(62, 62, 64);
        const l = doc.splitTextToSize(b.text, W - 2 * M); ensure(l.length * 11 + 6); doc.text(l, M, y, { lineHeightFactor: 1.4 }); y += l.length * 11 + 7;
      }
    });
  }

  // ── Important notes / fine print ────────────────────────────────────
  ensure(46);
  section("Important Notes");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.7); doc.setTextColor(88, 88, 92);
  [
    "1.  This application forms part of the engagement record. Providing false, incomplete or misleading information may result in refusal or termination of the engagement at the applicant's risk and cost.",
    "2.  No work, procurement, purchase commitment or engagement is binding on Varada Nexus Private Limited until a written work order or service agreement is executed and any required advance is received.",
    "3.  All fees are exclusive of GST and applicable taxes unless expressly stated. Estimates, timelines and budgets are indicative and subject to a signed work order / agreement.",
    "4.  The information and documents provided will be used for onboarding, KYC verification, service delivery and legal / regulatory compliance, and retained in accordance with applicable law and the Company's policies.",
    "5.  The applicant consents to verification of the details and documents provided, including with third-party and government sources where lawful.",
    "6.  This is a confidential document. Any dispute is subject to the Terms & Conditions, and to arbitration and the exclusive jurisdiction of the courts at Rajamahendravaram (Rajahmundry), Andhra Pradesh, India, as stated therein.",
    "7.  Bank account details (account holder, account number, IFSC, bank & branch) are collected only to process any eligible refund and are stored securely with restricted access. Please retain a signed copy of this application for your records."
  ].forEach((n) => { const l = doc.splitTextToSize(n, W - 2 * M); ensure(l.length * 10 + 5); doc.text(l, M, y, { lineHeightFactor: 1.35 }); y += l.length * 10 + 6; });

  // ── Letterhead header + footer stamped on every page ────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(173, 133, 52); doc.rect(0, 0, W, 4.5, "F");
    let tx = M;
    if (smallLogo) { const lh = 30, lw = smallLogo.w * (lh / smallLogo.h); try { doc.addImage(smallLogo.dataUrl, "PNG", M, 20, lw, lh); tx = M + lw + 11; } catch {} }
    doc.setFont("times", "bold"); doc.setFontSize(12.5); doc.setTextColor(26, 26, 28);
    doc.text("VARADA NEXUS PRIVATE LIMITED", tx, 34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(150, 122, 58);
    doc.text("CLIENT ONBOARDING  ·  CONFIDENTIAL", tx, 45);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(150, 122, 58);
    doc.text(refNo, W - M, 28, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(130, 130, 134);
    doc.text(dateStr, W - M, 40, { align: "right" });
    doc.setDrawColor(214, 190, 132); doc.setLineWidth(0.8); doc.line(M, 56, W - M, 56);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.9); doc.setTextColor(128, 128, 132);
    doc.text(`Regd. Office: ${COMPANY.office}   ·   CIN: ${COMPANY.cin}   ·   GSTIN: ${COMPANY.gst}`, W / 2, 67, { align: "center" });
    doc.setDrawColor(230, 230, 232); doc.setLineWidth(0.5); doc.line(M, H - 40, W - M, H - 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(140, 140, 144);
    doc.text("Confidential — for onboarding use only", M, H - 27);
    doc.text(`Page ${p} of ${total}`, W / 2, H - 27, { align: "center" });
    doc.text("www.varadanexus.com", W - M, H - 27, { align: "right" });
  }

  const safe = (d.legal_name || "applicant").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  doc.save(`Varada-Nexus-Onboarding-Application-${safe}.pdf`);
}

// ── Documents ────────────────────────────────────────────────────────────────
function docRow(doc, removable) {
  const up = state.uploaded[doc.document_key];
  const pinned = PINNED_DOCS.includes(doc.document_key);
  return `<div class="onb-doc">
    <div><strong>${esc(doc.label)}</strong>${pinned ? ' <span class="onb-req">REQUIRED</span>' : ""}${removable && !up ? ` <button class="onb-docrm" data-rm="${esc(doc.document_key)}" title="Remove" type="button">&times;</button>` : ""}
      <small>${esc(doc.description || "")}</small>
      ${up ? `<span class="onb-ok">✓ ${esc(up.name)}</span>` : ""}</div>
    <div><input type="file" id="file_${esc(doc.document_key)}" accept="application/pdf,image/*" style="max-width:150px;font-size:.72rem" /></div>
  </div>`;
}
function renderDocuments() {
  const all = (state.context?.checklist) || [];
  const pinned = all.filter((d) => PINNED_DOCS.includes(d.document_key));
  // Extras are shown once revealed via "Add a document", or if already uploaded (e.g. after resume).
  const shownKeys = new Set([...(state.extraDocs || []), ...Object.keys(state.uploaded)].filter((k) => !PINNED_DOCS.includes(k)));
  const extras = all.filter((d) => shownKeys.has(d.document_key));
  const available = all.filter((d) => !PINNED_DOCS.includes(d.document_key) && !shownKeys.has(d.document_key));
  const shown = [...pinned, ...extras];
  const addBox = available.length
    ? `<div class="onb-adddoc"><select class="onb-in" id="addDocSel"><option value="">＋  Add a supporting document…</option>${available.map((d) => `<option value="${esc(d.document_key)}">${esc(d.label)}</option>`).join("")}</select></div>`
    : "";
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Upload documents</h2>
    <p class="onb-muted">Upload the two required documents below. Print, sign &amp; stamp the application first, then upload it under “Signed Application Form”. You can attach any other supporting document using <strong>Add a document</strong>. Accepted: PDF or image.</p>
    <div class="onb-actions" style="margin:.2rem 0 1rem"><button class="onb-btn ghost" id="dlApp">&#8681;&nbsp; Re-download application (PDF)</button></div>
    ${shown.map((doc) => docRow(doc, !PINNED_DOCS.includes(doc.document_key))).join("")}
    ${addBox}
    <div class="onb-actions"><button class="onb-btn ghost" id="docsBack">Back</button><button class="onb-btn" id="docsNext">Continue</button></div>
  </div>`);
  shown.forEach((doc) => {
    document.querySelector(`#file_${CSS.escape(doc.document_key)}`)?.addEventListener("change", (e) => uploadDoc(e, doc));
  });
  document.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    const k = b.getAttribute("data-rm");
    state.extraDocs = (state.extraDocs || []).filter((x) => x !== k);
    persist(); renderDocuments();
  }));
  document.querySelector("#addDocSel")?.addEventListener("change", (e) => {
    const k = e.target.value; if (!k) return;
    if (!Array.isArray(state.extraDocs)) state.extraDocs = [];
    if (!state.extraDocs.includes(k)) state.extraDocs.push(k);
    persist(); renderDocuments();
  });
  document.querySelector("#dlApp")?.addEventListener("click", async () => {
    try { await generateApplicationPdf(state.details, state.context || {}); } catch (e) { if (!handleErr(e)) toast(e.message); }
  });
  document.querySelector("#docsBack")?.addEventListener("click", () => goTo("details"));
  document.querySelector("#docsNext")?.addEventListener("click", () => {
    const missing = pinned.filter((d) => !state.uploaded[d.document_key]);
    if (missing.length) return toast(`Please upload: ${missing.map((m) => m.label).join(", ")}`);
    goTo("photo");
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
// Downscale + re-encode photos client-side so a phone scan uploads as a few
// hundred KB instead of several MB. PDFs and other files pass through unchanged.
function compressImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(cv.toDataURL("image/jpeg", quality)); } catch { resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function prepareUpload(file) {
  if (/^image\//i.test(file.type)) {
    const c = await compressImage(file, 1800, 0.72).catch(() => null);
    if (c && c.length < file.size * 1.34) {
      const name = file.name.replace(/\.(png|webp|heic|heif|bmp|tiff?|jpe?g)$/i, "") + ".jpg";
      const bytes = Math.round((c.length - (c.indexOf(",") + 1)) * 0.75);
      return { base64: c, mime: "image/jpeg", name, size: bytes };
    }
  }
  const b = await fileToBase64(file);
  return { base64: b, mime: file.type || "application/octet-stream", name: file.name, size: file.size };
}
async function uploadDoc(e, doc) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return toast("File too large (max 15 MB). Please upload a smaller scan or a compressed PDF.");
  try {
    setBusy(true); toast(`Uploading ${doc.label}…`, true);
    const prep = await prepareUpload(file);
    const r = await uploadOnboardingDocument({
      session_token: state.session, document_key: doc.document_key, document_label: doc.label,
      file_name: prep.name, mime_type: prep.mime, file_size: prep.size, base64: prep.base64
    });
    state.uploaded[doc.document_key] = { name: prep.name, link: r.web_view_link, mime: prep.mime };
    state.uploadedData[doc.document_key] = prep.base64;
    persist();
    renderDocuments(); toast(`${doc.label} uploaded to Drive.`, true);
  } catch (err) { if (!handleErr(err)) toast(err.message); } finally { setBusy(false); }
}

// ── Live photo ───────────────────────────────────────────────────────────────
let geoWatchId = null;
function startGeoWatch() {
  const el = () => document.querySelector("#geoStatus");
  if (!navigator.geolocation) { const e = el(); if (e) e.textContent = "⚠ Location is not supported on this device — it is required to capture the photo."; return; }
  const e0 = el(); if (e0) e0.textContent = "Acquiring precise location… please allow location access.";
  try {
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const g = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        // Keep refining — retain the most accurate fix seen.
        if (!state.geo || g.acc <= state.geo.acc) state.geo = g;
        const e = el();
        if (e) e.textContent = state.geo.acc <= 50
          ? `📍 Precise location acquired · accuracy ±${Math.round(state.geo.acc)} m`
          : `📍 Location acquired · accuracy ±${Math.round(state.geo.acc)} m — hold on for a sharper fix…`;
      },
      () => { const e = el(); if (e) e.textContent = "⚠ Location blocked — please enable location access to capture the photo."; },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  } catch {}
}
function stopGeoWatch() { try { if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId); } catch {} geoWatchId = null; }

// ── Face-in-circle detection (face-api.js) ───────────────────────────────────
let faceTimer = null, faceModelsReady = false, faceApiActive = false, faceStable = 0;
let countdownTimer = null, countdownVal = 0, manualRevealTimer = null;
function clampNum(v, a, b) { return Math.max(a, Math.min(b, v)); }
async function ensureFaceModels() {
  if (!window.faceapi) return false;
  if (faceModelsReady) return true;
  try { await window.faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL); faceModelsReady = true; return true; }
  catch { return false; }
}
function setRing(pct, ok, hint) {
  state.faceMatch = pct;
  const ring = document.querySelector("#faceRing");
  const h = document.querySelector("#faceHint");
  if (ring) ring.classList.toggle("ok", ok);
  if (h) { h.textContent = hint; h.classList.toggle("ok", ok); }
}
async function startFaceLoop() {
  const video = document.querySelector("#cam");
  if (!video) return;
  const ready = await ensureFaceModels();
  faceApiActive = ready;
  if (!ready) { setRing(0, false, "Center your face in the circle, then press Capture"); return; }
  faceStable = 0;
  const opts = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
  stopFaceLoop();
  faceTimer = setInterval(async () => {
    if (!video.videoWidth || state.photoDataUrl) return;
    let det = null;
    try { det = await window.faceapi.detectSingleFace(video, opts); } catch { return; }
    evaluateFace(det, video);
  }, 240);
}
function stopFaceLoop() { try { if (faceTimer) clearInterval(faceTimer); } catch {} faceTimer = null; faceStable = 0; }
function showCount(v) { const el = document.querySelector("#faceCount"); if (el) el.textContent = v > 0 ? String(v) : ""; }
function cancelCountdown() { if (countdownTimer) { try { clearInterval(countdownTimer); } catch {} } countdownTimer = null; countdownVal = 0; showCount(0); }
function startCountdown() {
  if (countdownTimer) return;
  countdownVal = 3; showCount(countdownVal);
  const h = document.querySelector("#faceHint"); if (h) { h.textContent = "Hold still — capturing…"; h.classList.add("ok"); }
  countdownTimer = setInterval(() => {
    countdownVal -= 1;
    if (countdownVal <= 0) { try { clearInterval(countdownTimer); } catch {} countdownTimer = null; showCount(0); stopFaceLoop(); captureFrame(); return; }
    showCount(countdownVal);
  }, 1000);
}
function evaluateFace(det, video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!det || !vw) { faceStable = 0; if (countdownTimer) cancelCountdown(); return setRing(0, false, "Position your face inside the circle"); }
  const b = det.box;
  const cx = (b.x + b.width / 2) / vw, cy = (b.y + b.height / 2) / vh;
  const centerDist = Math.hypot(cx - 0.5, cy - 0.5);
  // Positioning quality drives the score; detection confidence is only a low-bar
  // gate (desktop webcams report modest confidence even for a clear, centred face).
  const centerScore = clampNum(1 - centerDist / 0.34, 0, 1);
  const sizeRatio = b.width / vw;
  const sizeScore = sizeRatio < 0.20 ? clampNum((sizeRatio - 0.10) / 0.10, 0, 1)
    : sizeRatio > 0.70 ? clampNum((0.92 - sizeRatio) / 0.22, 0, 1) : 1;
  const conf = clampNum(det.score, 0, 1);
  const pos = 0.55 * centerScore + 0.45 * sizeScore;
  const pct = Math.round((0.85 * pos + 0.15 * conf) * 100);
  const good = pct >= FACE_MATCH_MIN && conf >= 0.35 && !!state.geo;
  let hint;
  if (sizeRatio < 0.20) hint = `Move closer — ${pct}%`;
  else if (sizeRatio > 0.70) hint = `Move back a little — ${pct}%`;
  else if (centerScore < 0.55) hint = `Center your face in the circle — ${pct}%`;
  else if (!state.geo) hint = `Acquiring location — ${pct}%`;
  else if (pct < FACE_MATCH_MIN) hint = `Hold steady — ${pct}%`;
  else hint = `Face matched ${pct}% — hold still`;
  // Countdown in progress: keep it running unless the face clearly drops out.
  if (countdownTimer) {
    if (pct < 65 || conf < 0.3 || !state.geo) { cancelCountdown(); setRing(pct, false, hint); }
    else { state.faceMatch = pct; const r = document.querySelector("#faceRing"); if (r) r.classList.add("ok"); }
    return;
  }
  setRing(pct, good, hint);
  if (good) { faceStable++; if (faceStable >= 2) startCountdown(); }
  else faceStable = 0;
}
async function renderPhoto() {
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>Live authentication</h2>
    <p class="onb-muted">Live identity authentication of the authorised signatory / individual. Position your face within the circle to authenticate — your image is geotagged and time-stamped as verification evidence.</p>
    ${state.photoDataUrl
      ? `<img class="onb-shot" src="${state.photoDataUrl}" alt="captured" />
         ${state.photoMeta ? `<p class="onb-geo">Stamped: ${esc(new Date(state.photoMeta.captured_at).toLocaleString("en-GB"))}${state.photoMeta.geo ? ` · ${state.photoMeta.geo.lat.toFixed(5)}, ${state.photoMeta.geo.lng.toFixed(5)}` : " · location unavailable"}</p>` : ""}
         <div class="onb-actions"><button class="onb-btn ghost" id="photoBack">Back</button><button class="onb-btn ghost" id="retake">Retake</button>
         <button class="onb-btn" id="photoNext">Continue</button></div>`
      : `<div class="onb-facewrap">
           <video class="onb-cam" id="cam" autoplay playsinline muted></video>
           <div class="onb-facering" id="faceRing"></div>
           <div class="onb-facecount" id="faceCount"></div>
           <div class="onb-facehint" id="faceHint">Position your face inside the circle</div>
         </div>
         <p class="onb-geo" id="geoStatus">Acquiring precise location…</p>
         <div class="onb-note">This live photo is captured for <strong>internal verification and onboarding records only</strong>. Your <strong>name, designation, current location and the date &amp; time</strong> are stamped on the photo as evidence. Align your face inside the circle — it turns <strong style="color:#8ef0b8">green</strong> once matched (75%+), then a <strong>3-2-1 countdown</strong> captures it. Location access is required. Capturing confirms you are the authorised person and consent to this being recorded.</div>
         <div class="onb-actions"><button class="onb-btn ghost" id="photoBack">Back</button><button class="onb-btn" id="snap" style="display:none">Capture &amp; accept</button></div>`}
  </div>`);
  document.querySelector("#photoBack")?.addEventListener("click", () => { stopCam(); goTo("documents"); });
  if (!state.photoDataUrl) {
    startGeoWatch();
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const v = document.querySelector("#cam");
      if (v) { v.srcObject = state.stream; v.addEventListener("loadeddata", startFaceLoop, { once: true }); }
    } catch { toast("Camera access is required for the live photo."); }
    // Reveal the manual capture button only if nothing has been captured after 25s.
    if (manualRevealTimer) clearTimeout(manualRevealTimer);
    manualRevealTimer = setTimeout(() => {
      const b = document.querySelector("#snap");
      if (b && !state.photoDataUrl) { b.style.display = ""; toast("Taking a while? You can capture manually now."); }
    }, 25000);
    document.querySelector("#snap")?.addEventListener("click", () => {
      if (!state.geo) { startGeoWatch(); return toast("Waiting for your location — please allow location access."); }
      if (faceApiActive && state.faceMatch < FACE_MATCH_MIN) return toast("Align your face inside the circle until it turns green (75%+ match).");
      captureFrame();
    });
  } else {
    document.querySelector("#retake")?.addEventListener("click", () => { state.photoDataUrl = ""; state.photoMeta = null; renderPhoto(); });
    document.querySelector("#photoNext")?.addEventListener("click", () => { stopCam(); goTo("terms"); });
  }
}
// Shrink the font until the text fits within maxW (down to minPx).
function fitFont(ctx, text, maxW, startPx, minPx, weight) {
  let px = startPx;
  while (px > minPx) { ctx.font = `${weight} ${px}px Arial, sans-serif`; if (ctx.measureText(text).width <= maxW) break; px -= 1; }
  ctx.font = `${weight} ${px}px Arial, sans-serif`;
  return px;
}
function captureFrame() {
  const v = document.querySelector("#cam");
  if (!v) return;
  // Location (with a real fix) is mandatory before capture.
  if (!state.geo) { startGeoWatch(); return toast("Waiting for your location — please allow location access, then try again."); }
  const w = v.videoWidth || 640, h = v.videoHeight || 480;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(v, 0, 0, w, h);
  // Burn the verification caption — name · designation, timestamp, coordinates.
  const d = state.details || {};
  const now = new Date();
  const nameLine = [d.signatory_name, d.signatory_designation].filter(Boolean).join("  ·  ")
    || (state.context?.entity_name || "Authorised person");
  const when = now.toLocaleString("en-GB", { hour12: false });
  const geoStr = `Lat ${state.geo.lat.toFixed(6)}, Lng ${state.geo.lng.toFixed(6)}  (±${Math.round(state.geo.acc)} m)`;
  const base = Math.max(13, Math.round(w * 0.030));
  const pad = Math.round(base * 0.7);
  const maxW = w - pad * 2;
  const lineGap = Math.round(base * 0.5);
  // Pre-measure fitted sizes so the band height matches.
  const s1 = fitFont(ctx, nameLine, maxW, base, 10, "bold");
  const s2 = fitFont(ctx, when, maxW, Math.round(base * 0.92), 10, "normal");
  const s3 = fitFont(ctx, geoStr, maxW, Math.round(base * 0.92), 10, "normal");
  const bandH = pad * 2 + s1 + s2 + s3 + lineGap * 2;
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, h - bandH, w, bandH);
  ctx.textBaseline = "top";
  let ty = h - bandH + pad;
  fitFont(ctx, nameLine, maxW, base, 10, "bold"); ctx.fillStyle = "#e6c87e"; ctx.fillText(nameLine, pad, ty); ty += s1 + lineGap;
  fitFont(ctx, when, maxW, Math.round(base * 0.92), 10, "normal"); ctx.fillStyle = "#ffffff"; ctx.fillText(when, pad, ty); ty += s2 + lineGap;
  fitFont(ctx, geoStr, maxW, Math.round(base * 0.92), 10, "normal"); ctx.fillStyle = "#ffffff"; ctx.fillText(geoStr, pad, ty);
  state.photoDataUrl = canvas.toDataURL("image/jpeg", 0.85);
  state.photoMeta = { captured_at: now.toISOString(), geo: state.geo, signatory_name: d.signatory_name || null, signatory_designation: d.signatory_designation || null };
  persist();
  stopCam(); renderPhoto();
}
function stopCam() { try { state.stream?.getTracks().forEach((t) => t.stop()); } catch {} state.stream = null; stopGeoWatch(); stopFaceLoop(); cancelCountdown(); if (manualRevealTimer) { clearTimeout(manualRevealTimer); manualRevealTimer = null; } }

// ── Terms ────────────────────────────────────────────────────────────────────
function renderTerms() {
  const t = state.context?.terms;
  if (!t) { shell(`<div class="onb-card">${heading()}<p class="onb-muted">Terms are not configured for this division yet. Please contact Varada Nexus.</p></div>`); return; }
  shell(`${steps()}<div class="onb-card">${heading()}
    <h2>${esc(t.title)}</h2>
    <div class="onb-terms" id="termsBox">${t.body}</div>
    <p class="onb-scrollhint" id="scrollHint">Please read and scroll to the end of the Terms to enable acceptance.</p>
    <label class="onb-check disabled" id="agreeLabel"><input type="checkbox" id="agree" disabled />
      <span>I have read and accept these Terms &amp; Conditions in full, on behalf of the organisation, and I am authorised to do so. I understand a live authentication image, location, timestamp and device details are recorded as acceptance evidence.</span></label>
    <div class="onb-actions"><button class="onb-btn ghost" id="termsBack">Back</button><button class="onb-btn" id="submitAll">Accept &amp; submit onboarding</button></div>
  </div>`);
  const box = document.querySelector("#termsBox");
  const agree = document.querySelector("#agree");
  const hint = document.querySelector("#scrollHint");
  const label = document.querySelector("#agreeLabel");
  const enable = () => {
    if (agree) agree.disabled = false;
    if (label) label.classList.remove("disabled");
    if (hint) { hint.textContent = "✓ You've reached the end — you may now accept the Terms."; hint.classList.add("done"); }
  };
  const checkScroll = () => { if (box && box.scrollTop + box.clientHeight >= box.scrollHeight - 24) enable(); };
  if (box) {
    box.addEventListener("scroll", checkScroll);
    // If the terms fit without scrolling, allow acceptance right away.
    if (box.scrollHeight <= box.clientHeight + 24) enable();
  }
  document.querySelector("#termsBack")?.addEventListener("click", () => goTo("photo"));
  document.querySelector("#submitAll")?.addEventListener("click", submitAll);
}
async function submitAll() {
  const agree = document.querySelector("#agree");
  if (agree?.disabled) return toast("Please scroll to the end of the Terms & Conditions first.");
  if (!agree?.checked) return toast("Please tick the box to accept the Terms.");
  try {
    setBusy(true); toast("Submitting…", true);
    await acceptOnboardingTerms({
      session_token: state.session,
      terms_version: state.context.terms.version,
      live_image_base64: state.photoDataUrl || null
    });
    saveDoneSnapshot();
    clearPersisted();
    state.step = "done"; render();
  } catch (e) { if (!handleErr(e)) toast(e.message); } finally { setBusy(false); }
}

// ── Done ─────────────────────────────────────────────────────────────────────
// Modal preview of an uploaded file or the live image (image/PDF; Drive-link fallback).
function openFilePreview(label, dataUrl, mime, link, fileName) {
  let inner;
  if (dataUrl && /^image\//i.test(mime)) inner = `<img src="${dataUrl}" alt="${esc(label)}" class="onb-modal-img" />`;
  else if (dataUrl && /pdf/i.test(mime)) inner = `<iframe src="${dataUrl}" class="onb-modal-frame" title="${esc(label)}"></iframe>`;
  else if (dataUrl) inner = `<div class="onb-modal-msg"><p>Preview isn't available for this file type.</p><a class="onb-btn ghost" href="${dataUrl}" download="${esc(fileName || "document")}">Download file</a></div>`;
  else inner = `<div class="onb-modal-msg"><p>Preview isn't available here${link ? "." : " after reopening the link."}</p>${link ? `<a class="onb-btn ghost" href="${esc(link)}" target="_blank" rel="noopener">Open in Drive</a>` : ""}</div>`;
  const overlay = document.createElement("div");
  overlay.className = "onb-modal";
  overlay.innerHTML = `<div class="onb-modal-box"><div class="onb-modal-head"><strong>${esc(label)}</strong><button class="onb-modal-x" aria-label="Close" type="button">&times;</button></div><div class="onb-modal-body">${inner}</div><div class="onb-modal-foot">${esc(fileName || "")}</div></div>`;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => { try { document.removeEventListener("keydown", onKey); } catch {} overlay.remove(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".onb-modal-x").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}
function openDocPreview(key) {
  const c = state.context || {};
  const meta = (state.uploaded || {})[key] || {};
  const label = (c.checklist || []).find((x) => x.document_key === key)?.label || meta.name || "Document";
  openFilePreview(label, (state.uploadedData || {})[key] || "", meta.mime || "", meta.link || "", meta.name || "");
}
function renderDone() {
  const c = state.context || {};
  const d = state.details || {};
  const division = DIVISION_LABELS[c.division_code] || c.division_code || "";
  const docs = Object.entries(state.uploaded || {});
  const hasSummary = Boolean(d.legal_name || d.contact_email || docs.length);
  const refNo = `ONB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(token || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
  const services = [...(d.services_required || []), d.services_other].filter(Boolean).join(", ");
  const photoLine = state.photoMeta
    ? `${new Date(state.photoMeta.captured_at).toLocaleString("en-GB")}${state.photoMeta.geo ? ` · ${state.photoMeta.geo.lat.toFixed(5)}, ${state.photoMeta.geo.lng.toFixed(5)}` : ""}`
    : (state.photoDataUrl ? "Captured" : "");
  const termsV = c.terms && c.terms.version ? c.terms.version : "";
  const row = (label, val) => val ? `<div class="onb-sumrow"><span>${esc(label)}</span><strong>${esc(val)}</strong></div>` : "";
  shell(`<div class="onb-card" style="padding:2rem 1.4rem">
    <div style="text-align:center">
      <div class="onb-doneicon">✓</div>
      <h1 style="margin:.5rem 0 .2rem">Onboarding submitted</h1>
      <p class="onb-muted">Thank you${d.signatory_name || c.entity_name ? ", " + esc(d.signatory_name || c.entity_name) : ""}. Your onboarding has been received by Varada Nexus Private Limited. Our team will review it and contact you if anything further is required.</p>
      <p class="onb-geo" style="margin-top:.5rem">Reference: <strong style="color:#e6c87e">${esc(refNo)}</strong></p>
    </div>
    ${hasSummary ? `
      <div class="onb-sub">Submission summary</div>
      <div class="onb-summary">
        ${row("Division", division)}
        ${row("Applicant / Entity", d.legal_name || c.entity_name)}
        ${row("Type of entity", d.entity_type)}
        ${row("Contact person", [d.signatory_name, d.signatory_designation].filter(Boolean).join(" · "))}
        ${row("Mobile", d.contact_phone)}
        ${row("Email", d.contact_email)}
        ${row("Services required", services)}
        ${state.photoDataUrl
          ? `<div class="onb-sumrow onb-docview" data-live="1" role="button" tabindex="0"><span>Live authentication</span><strong>${esc(photoLine)}<img src="${state.photoDataUrl}" class="onb-thumb" alt="live" /> ↗</strong></div>`
          : row("Live authentication", photoLine)}
        <div class="onb-sumrow"><span>Terms accepted</span><strong style="color:#8fd6ac">✓ Accepted</strong></div>
      </div>
      <div class="onb-sub">Documents submitted (${docs.length})</div>
      ${docs.length ? `<div class="onb-summary">${docs.map(([k, u]) => {
        const label = (c.checklist || []).find((x) => x.document_key === k)?.label || k;
        return `<div class="onb-sumrow onb-docview" data-doc="${esc(k)}" role="button" tabindex="0"><span>${esc(label)}</span><strong>${esc(u.name || "Uploaded")} ↗</strong></div>`;
      }).join("")}</div>` : `<p class="onb-muted">No documents recorded.</p>`}
      <div class="onb-actions" style="justify-content:center"><button class="onb-btn ghost" id="dlAppDone">&#8681;&nbsp; Download application (PDF)</button></div>
      <p class="onb-muted" style="text-align:center;font-size:.78rem;margin-top:.6rem">Tap any document or the live authentication to preview it. Please keep the reference for your records — you may now close this page.</p>
    ` : `<p class="onb-muted" style="text-align:center">Your details and documents have been received. You may close this page.</p>`}
  </div>`);
  document.querySelector("#dlAppDone")?.addEventListener("click", async () => {
    try { await generateApplicationPdf(state.details, state.context || {}); } catch (e) { toast(e.message); }
  });
  document.querySelectorAll("[data-doc]").forEach((el) => el.addEventListener("click", () => openDocPreview(el.getAttribute("data-doc"))));
  document.querySelector("[data-live]")?.addEventListener("click", () => openFilePreview("Live authentication", state.photoDataUrl, "image/jpeg", "", "live-authentication.jpg"));
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
  // Delegated navigation for the clickable step chips (survives re-renders).
  $app().addEventListener("click", (e) => {
    const chip = e.target.closest?.("[data-goto]");
    if (chip) goTo(chip.getAttribute("data-goto"));
  });
  shell(`<div class="onb-card"><p class="onb-muted">Loading your onboarding…</p></div>`);
  try {
    const r = await getOnboardingContext({ public_token: token });
    state.context = r.context;
    if (["submitted", "approved"].includes(state.context?.status)) {
      clearPersisted();
      const snap = loadDoneSnapshot();
      if (snap) { state.details = snap.details || {}; state.uploaded = snap.uploaded || {}; state.photoMeta = snap.photoMeta || null; }
      state.step = "done";
    } else {
      const saved = loadPersisted();
      if (saved && saved.session) {
        state.session = saved.session;
        state.details = saved.details || {};
        state.uploaded = saved.uploaded || {};
        state.extraDocs = Array.isArray(saved.extraDocs) ? saved.extraDocs : [];
        state.photoDataUrl = saved.photoDataUrl || "";
        state.photoMeta = saved.photoMeta || null;
        state.step = saved.step && saved.step !== "verify" ? saved.step : "details";
        state.maxStepIdx = Number.isInteger(saved.maxStepIdx) ? saved.maxStepIdx : STEP_ORDER.indexOf(state.step);
      }
    }
    render();
  } catch (e) {
    shell(`<div class="onb-card"><h1>Onboarding unavailable</h1><p class="onb-muted">${esc(e.message)}</p></div>`);
  }
}

boot();
