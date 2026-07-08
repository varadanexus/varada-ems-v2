import { getPublicSigningRequest, getPublicIpRisk, acceptPublicSigningRequest } from "./legal-api.js";
import { TOAST_TYPES } from "../config/constants.js";
import { showToast } from "./utils.js";

const token = new URLSearchParams(window.location.search).get("t") || "";
const state = { request: null, stream: null, photoDataUrl: "", location: null, ipRisk: null };
document.querySelector("#app")?.classList.add("page-enter-active");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderDocument(value) {
  const lines = escapeHtml(value || "").split(/\r?\n/);
  let inList = false;
  const html = [];
  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "---") {
      closeList();
      if (line === "---") html.push("<hr>");
      continue;
    }
    const formatted = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^\*\s+/.test(line)) {
      if (!inList) html.push("<ul>");
      inList = true;
      html.push(`<li>${formatted.replace(/^\*\s+/, "")}</li>`);
    } else if (/^(ARTICLE\s+\d+|IN WITNESS WHEREOF|ADVOCATE REVIEW CHECKLIST)/i.test(line.replace(/\*\*/g, ""))) {
      closeList();
      html.push(`<h3>${formatted}</h3>`);
    } else if (/^\d+\.\s+/.test(line)) {
      closeList();
      html.push(`<h4>${formatted}</h4>`);
    } else {
      closeList();
      html.push(`<p>${formatted}</p>`);
    }
  }
  closeList();
  return html.join("");
}

function renderShell(content) {
  document.querySelector("#app").innerHTML = `
    <style>
      body{background:#edf1f5;color:#172033}
      .public-sign-shell{min-height:100vh;background:#edf1f5;color:#172033}
      .public-brand-bar{background:#09172a;border-bottom:3px solid #c9a85c;color:#fff}
      .public-brand-inner{width:min(1180px,calc(100% - 32px));min-height:76px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem}
      .public-brand{display:flex;align-items:center;gap:.8rem}.public-brand img{width:42px;height:42px;object-fit:contain}
      .public-brand strong{display:block;font-size:1rem}.public-brand span{display:block;color:#d9bd78;font-size:.68rem;text-transform:uppercase}
      .public-secure{display:flex;align-items:center;gap:.45rem;color:#c5d0df;font-size:.78rem}
      .public-secure-mark{display:grid;place-items:center;width:26px;height:26px;border:1px solid #54657c;border-radius:50%;color:#d9bd78}
      .public-sign-wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:1.4rem 0 2.5rem}
      .public-sign-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;padding:.35rem 0 1.2rem}
      .public-sign-head h1{margin:.25rem 0 0;font-size:1.75rem;letter-spacing:0}.public-sign-head p{margin:.35rem 0 0;color:#64748b}
      .public-eyebrow{margin:0;color:#8b6a22;font-size:.72rem;font-weight:800;text-transform:uppercase}
      .public-reference{padding:.5rem .7rem;border:1px solid #ccd5e1;border-radius:6px;background:#fff;color:#4b5c72;font-size:.78rem}
      .public-progress{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:1.2rem;border:1px solid #ced7e3;background:#fff}
      .public-step{display:flex;align-items:center;gap:.55rem;min-width:0;padding:.72rem;border-right:1px solid #dce3eb;color:#65758b;font-size:.78rem}
      .public-step:last-child{border-right:0}.public-step.active{color:#172033;font-weight:800;background:#fbf8ef}
      .public-step-no{display:grid;place-items:center;flex:0 0 26px;height:26px;border-radius:50%;background:#e8edf3;font-weight:800}
      .public-step.active .public-step-no{background:#c9a85c;color:#09172a}
      .public-sign-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(330px,.65fr);gap:1rem;align-items:start}
      .public-card{border:1px solid #ced7e3;border-radius:6px;background:#fff;padding:1rem;box-shadow:0 8px 24px rgba(23,32,51,.07)}
      .public-card-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding-bottom:.75rem;border-bottom:1px solid #e2e7ed}
      .public-card-head h2{margin:0;font-size:1rem}.public-card-head span{color:#75859a;font-size:.75rem}
      .public-agreement{height:min(60vh,650px);overflow:auto;line-height:1.68;background:#fff;padding:1.2rem .9rem .5rem;color:#293448}
      .public-agreement p{margin:.6rem 0}.public-agreement h3{margin:1.35rem 0 .5rem;color:#101c30;font-size:1rem}.public-agreement h4{margin:1rem 0 .35rem;font-size:.9rem}
      .public-agreement ul{margin:.45rem 0;padding-left:1.25rem}.public-agreement hr{border:0;border-top:1px solid #dfe5ec;margin:1.2rem 0}
      .public-camera-frame{position:relative;margin-top:1rem;overflow:hidden;border:1px solid #2c3d55;border-radius:6px;background:#071224}
      .public-camera,.public-photo{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#071224}
      .public-photo[hidden]{display:none}
      .public-camera-label{position:absolute;left:.65rem;bottom:.55rem;padding:.25rem .45rem;background:rgba(7,18,36,.82);color:#dbe4ef;border-radius:4px;font-size:.7rem}
      .public-status{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin:.75rem 0}
      .public-status div{min-width:0;border:1px solid #dce3eb;border-radius:6px;padding:.65rem;background:#f5f7fa}
      .public-status strong{font-size:.76rem}.public-status span{display:block;margin-top:.25rem;overflow-wrap:anywhere;font-size:.74rem}
      .public-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}
      .public-sign-shell .btn{min-height:40px;border-radius:5px;background:#0b1b32;border:1px solid #0b1b32;color:#fff;padding:.58rem .8rem}
      .public-sign-shell .btn:hover{background:#132b4b}.public-sign-shell .btn.btn-ghost{background:#fff;border-color:#b9c5d3;color:#172033}
      .public-sign-shell .btn:disabled{background:#e8edf3;border-color:#d9e0e8;color:#98a5b5}
      .public-primary{width:100%;justify-content:center;background:#b8923e!important;border-color:#b8923e!important;color:#101827!important;font-weight:800}
      .public-kyc{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-top:.75rem;padding:.75rem;border:1px solid #ddcfaa;background:#fbf8ef}
      .public-kyc strong{display:block;font-size:.8rem}.public-kyc span{color:#6d6044;font-size:.72rem}
      .public-consent{display:grid;grid-template-columns:20px minmax(0,1fr);gap:.6rem;margin-top:.8rem;padding:.75rem;border-top:1px solid #e2e7ed;color:#46556a;font-size:.78rem}
      .public-consent input{margin-top:.2rem}.danger-text{color:#a51f2b;font-weight:800}
      .public-footer{display:flex;justify-content:space-between;gap:1rem;margin-top:1rem;color:#718096;font-size:.7rem}
      @media(max-width:900px){.public-sign-grid{grid-template-columns:1fr}.public-agreement{height:48vh}.public-progress{grid-template-columns:1fr 1fr}.public-step:nth-child(2){border-right:0}.public-step:nth-child(-n+2){border-bottom:1px solid #dce3eb}}
      @media(max-width:560px){.public-brand-inner,.public-sign-wrap{width:min(100% - 20px,1180px)}.public-secure{display:none}.public-sign-head{align-items:flex-start;flex-direction:column}.public-progress{grid-template-columns:1fr}.public-step{border-right:0;border-bottom:1px solid #dce3eb}.public-status{grid-template-columns:1fr}.public-footer{flex-direction:column}}
    </style>
    <main class="public-sign-shell">
      <header class="public-brand-bar">
        <div class="public-brand-inner">
          <div class="public-brand">
            <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" />
            <div><strong>Varada Nexus</strong><span>Private Limited</span></div>
          </div>
          <div class="public-secure"><span class="public-secure-mark">✓</span><span>Secure legal execution portal</span></div>
        </div>
      </header>
      <div class="public-sign-wrap">${content}</div>
    </main>
  `;
}

function deviceEvidence() {
  return {
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    language: navigator.language || "",
    screen: `${screen.width || 0}x${screen.height || 0}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    capturedAt: new Date().toISOString()
  };
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ status: "unsupported", capturedAt: new Date().toISOString() });
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        status: "granted",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAt: new Date(position.timestamp).toISOString()
      }),
      (error) => resolve({ status: "denied_or_failed", code: error.code, message: error.message, capturedAt: new Date().toISOString() }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function getIpRisk() {
  return await getPublicIpRisk(token);
}

function blockedRisk() {
  const risk = state.ipRisk || {};
  return Boolean(risk.vpn || risk.proxy || risk.tor || risk.hosting || risk.decision === "block" || Number(risk.riskScore || 0) >= 80);
}

function updateSubmitState() {
  const canSubmit = document.querySelector("#consentCheck")?.checked && state.photoDataUrl && state.location && state.ipRisk && !blockedRisk();
  const button = document.querySelector("#submitSignBtn");
  if (button) button.disabled = !canSubmit;
  const risk = document.querySelector("#riskWarning");
  if (risk) risk.hidden = !blockedRisk();
}

async function startCamera() {
  state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  document.querySelector("#camera").srcObject = state.stream;
  document.querySelector("#captureBtn").disabled = false;
}

function capturePhoto() {
  const video = document.querySelector("#camera");
  const canvas = document.querySelector("#canvas");
  canvas.width = video.videoWidth || 960;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  state.photoDataUrl = canvas.toDataURL("image/jpeg", 0.86);
  const preview = document.querySelector("#photoPreview");
  preview.src = state.photoDataUrl;
  preview.hidden = false;
  document.querySelector("#photoStatus").textContent = `Captured at ${new Date().toLocaleString()}`;
  updateSubmitState();
}

async function refreshEvidence() {
  document.querySelector("#locationStatus").textContent = "Capturing...";
  document.querySelector("#ipStatus").textContent = "Checking...";
  const [location, ipRisk] = await Promise.all([getLocation(), getIpRisk()]);
  state.location = location;
  state.ipRisk = ipRisk;
  document.querySelector("#locationStatus").textContent = location.status === "granted"
    ? `${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)} (${Math.round(location.accuracyMeters || 0)}m)`
    : `${location.status}: ${location.message || "No GPS captured"}`;
  document.querySelector("#ipStatus").textContent = `${ipRisk.ip || "IP unavailable"} · ${ipRisk.provider || "risk provider"} · score ${ipRisk.riskScore || 0}`;
  updateSubmitState();
}

async function submitAcceptance() {
  const button = document.querySelector("#submitSignBtn");
  button.disabled = true;
  button.textContent = "Submitting...";
  try {
    const consentText = document.querySelector("#consentText").textContent.trim();
    const result = await acceptPublicSigningRequest({
      token,
      consentText,
      livePhotoDataUrl: state.photoDataUrl,
      evidence: {
        agreementNo: state.request?.agreementNo,
        recipientName: state.request?.recipientName,
        consentText,
        device: deviceEvidence(),
        location: state.location,
        ipRisk: state.ipRisk,
        didit: {
          verificationUrl: state.request?.diditVerificationUrl || null,
          status: state.request?.diditStatus || null
        }
      }
    });
    state.stream?.getTracks?.().forEach((track) => track.stop());
    renderShell(`
      <section class="public-card">
        <h1>Agreement accepted</h1>
        <p class="muted">Your acceptance evidence has been securely recorded.</p>
        <p><strong>Evidence Hash:</strong> ${escapeHtml(result.evidenceHash)}</p>
      </section>
    `);
  } catch (error) {
    showToast(error?.message || "Acceptance failed.", TOAST_TYPES.ERROR);
    button.disabled = false;
    button.textContent = "Accept and Submit";
  }
}

function renderSigning() {
  const r = state.request;
  renderShell(`
    <header class="public-sign-head">
      <div><p class="public-eyebrow">Document awaiting your signature</p><h1>${escapeHtml(r.title || "Agreement Signing")}</h1><p>Prepared for ${escapeHtml(r.recipientName || "")}</p></div>
      <div class="public-reference">Reference: ${escapeHtml(r.agreementNo || "")}</div>
    </header>
    <div class="public-progress">
      <div class="public-step active"><span class="public-step-no">1</span><span>Review agreement</span></div>
      <div class="public-step"><span class="public-step-no">2</span><span>Verify identity</span></div>
      <div class="public-step"><span class="public-step-no">3</span><span>Capture evidence</span></div>
      <div class="public-step"><span class="public-step-no">4</span><span>Accept and sign</span></div>
    </div>
    <div class="public-sign-grid">
      <section class="public-card">
        <div class="public-card-head"><h2>Agreement Document</h2><span>Read the complete document before accepting</span></div>
        <div class="public-agreement">${renderDocument(r.bodyMarkdown || "Agreement preview is unavailable.")}</div>
        ${r.diditVerificationUrl ? `<div class="public-kyc"><div><strong>Identity verification required</strong><span>Complete secure Didit KYC before final acceptance.</span></div><a class="btn" href="${escapeHtml(r.diditVerificationUrl)}" target="_blank" rel="noreferrer">Verify with Didit</a></div>` : `<div class="public-kyc"><div><strong>Identity provider unavailable</strong><span>Contact Varada Nexus before continuing.</span></div></div>`}
      </section>
      <section class="public-card">
        <div class="public-card-head"><h2>Signing Evidence</h2><span>Required for execution</span></div>
        <div class="public-camera-frame">
          <video id="camera" class="public-camera" autoplay playsinline muted></video>
          <canvas id="canvas" hidden></canvas>
          <img id="photoPreview" class="public-photo" alt="Captured signer" hidden />
          <span class="public-camera-label">Live identity capture</span>
        </div>
        <p id="photoStatus" class="muted">Camera is ready to be enabled.</p>
        <div class="public-actions">
          <button class="btn" id="cameraBtn" type="button">Enable Camera</button>
          <button class="btn" id="captureBtn" type="button" disabled>Capture Live Photo</button>
          <button class="btn btn-ghost" id="evidenceBtn" type="button">Capture Location + IP</button>
        </div>
        <div class="public-status">
          <div><strong>Location</strong><br><span id="locationStatus" class="muted">Not captured</span></div>
          <div><strong>IP / VPN Risk</strong><br><span id="ipStatus" class="muted">Not checked</span></div>
        </div>
        <p id="riskWarning" class="danger-text" hidden>Signing is blocked because VPN/proxy/Tor/high-risk network was detected.</p>
        <label class="public-consent">
          <input id="consentCheck" type="checkbox" />
          <span id="consentText">I have read and understood this agreement, voluntarily accept it, and consent to live photo, timestamp, location, IP address, device details, Didit KYC reference and Google Drive archive evidence being recorded.</span>
        </label>
        <div class="public-actions">
          <button class="btn public-primary" id="submitSignBtn" type="button" disabled>Accept and Sign Agreement</button>
        </div>
      </section>
    </div>
    <footer class="public-footer"><span>Protected by encrypted transport and tamper-evident evidence hashing.</span><span>Varada Nexus Private Limited · Legal Command</span></footer>
  `);
  document.querySelector("#cameraBtn")?.addEventListener("click", () => startCamera().catch((error) => showToast(error.message, TOAST_TYPES.ERROR)));
  document.querySelector("#captureBtn")?.addEventListener("click", capturePhoto);
  document.querySelector("#evidenceBtn")?.addEventListener("click", () => refreshEvidence().catch((error) => showToast(error.message, TOAST_TYPES.ERROR)));
  document.querySelector("#consentCheck")?.addEventListener("change", updateSubmitState);
  document.querySelector("#submitSignBtn")?.addEventListener("click", submitAcceptance);
}

async function init() {
  if (!token) {
    renderShell(`<section class="public-card"><h1>Invalid signing link</h1><p class="muted">No signing token was provided.</p></section>`);
    return;
  }
  renderShell(`<section class="public-card"><h1>Loading secure agreement...</h1><p class="muted">Please wait.</p></section>`);
  try {
    state.request = await getPublicSigningRequest(token);
    renderSigning();
  } catch (error) {
    renderShell(`<section class="public-card"><h1>Signing link unavailable</h1><p class="muted">${escapeHtml(error?.message || "This link cannot be opened.")}</p></section>`);
  }
}

window.addEventListener("beforeunload", () => state.stream?.getTracks?.().forEach((track) => track.stop()));
init();
