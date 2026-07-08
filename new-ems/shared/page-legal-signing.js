import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const state = {
  agreementId: new URLSearchParams(window.location.search).get("agreement") || "AGR-2026-NEW",
  stream: null,
  photoDataUrl: "",
  location: null,
  ipRisk: null,
  accepted: false
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getDeviceEvidence() {
  return {
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    language: navigator.language || "",
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    capturedAt: new Date().toISOString()
  };
}

async function detectIpRisk() {
  const endpoint = window.EMS_IP_RISK_ENDPOINT || "";
  let ip = "";
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    ip = data?.ip || "";
  } catch {}

  if (!endpoint) {
    return {
      ip: ip || "Unavailable",
      checkedAt: new Date().toISOString(),
      provider: "not_configured",
      vpn: false,
      proxy: false,
      tor: false,
      hosting: false,
      riskScore: 0,
      decision: "allow_pending_provider",
      note: "Configure EMS_IP_RISK_ENDPOINT server-side for VPN/proxy/Tor blocking."
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip, agreementId: state.agreementId })
  });
  if (!response.ok) throw new Error(`IP risk service failed (${response.status})`);
  return await response.json();
}

function isBlockedRisk(risk) {
  if (!risk) return false;
  return Boolean(risk.vpn || risk.proxy || risk.tor || risk.hosting || Number(risk.riskScore || 0) >= 80 || risk.decision === "block");
}

function renderRiskStatus() {
  const risk = state.ipRisk;
  if (!risk) return "Not checked";
  const blocked = isBlockedRisk(risk);
  return blocked
    ? `Blocked: ${risk.reason || "VPN/proxy/high-risk network detected"}`
    : `Allowed: ${risk.ip || "IP unavailable"} (${risk.provider || "provider pending"})`;
}

function getLocationEvidence() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ status: "unsupported", capturedAt: new Date().toISOString() });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        status: "granted",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAt: new Date(position.timestamp).toISOString()
      }),
      (error) => resolve({
        status: "denied_or_failed",
        code: error.code,
        message: error.message,
        capturedAt: new Date().toISOString()
      }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function startCamera() {
  if (state.stream) return;
  state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  const video = document.querySelector("#legalCamera");
  if (video) video.srcObject = state.stream;
  document.querySelector("#capturePhotoBtn").disabled = false;
}

function capturePhoto() {
  const video = document.querySelector("#legalCamera");
  const canvas = document.querySelector("#legalCanvas");
  if (!video || !canvas) return;
  canvas.width = video.videoWidth || 960;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  state.photoDataUrl = canvas.toDataURL("image/jpeg", 0.86);
  document.querySelector("#photoPreview").src = state.photoDataUrl;
  document.querySelector("#photoPreview").hidden = false;
  document.querySelector("#captureStatus").textContent = `Live photo captured at ${new Date().toLocaleString()}`;
  updateSubmitState();
}

async function refreshEvidence() {
  const locationStatus = document.querySelector("#locationStatus");
  const ipStatus = document.querySelector("#ipStatus");
  locationStatus.textContent = "Requesting location permission...";
  ipStatus.textContent = "Checking IP and VPN risk...";
  const [location, ipRisk] = await Promise.all([
    getLocationEvidence(),
    detectIpRisk().catch((error) => ({
      ip: "Unavailable",
      provider: "error",
      riskScore: 50,
      decision: "review",
      note: error?.message || "IP risk check failed",
      checkedAt: new Date().toISOString()
    }))
  ]);
  state.location = location;
  state.ipRisk = ipRisk;
  locationStatus.textContent = location.status === "granted"
    ? `GPS ${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)} · Accuracy ${Math.round(location.accuracyMeters || 0)}m`
    : `GPS ${location.status}: ${location.message || "No location captured"}`;
  ipStatus.textContent = renderRiskStatus();
  ipStatus.classList.toggle("danger-text", isBlockedRisk(ipRisk));
  updateSubmitState();
}

function updateSubmitState() {
  const consent = document.querySelector("#legalConsent")?.checked;
  const submit = document.querySelector("#acceptAgreementBtn");
  const blocked = isBlockedRisk(state.ipRisk);
  if (submit) submit.disabled = !(consent && state.photoDataUrl && state.ipRisk && state.location) || blocked || state.accepted;
  const blocker = document.querySelector("#riskBlocker");
  if (blocker) blocker.hidden = !blocked;
}

async function acceptAgreement() {
  if (isBlockedRisk(state.ipRisk)) {
    showToast("Signing blocked because VPN/proxy/high-risk network is detected.", TOAST_TYPES.ERROR);
    return;
  }
  const consentText = document.querySelector("#legalConsentText")?.textContent?.trim() || "";
  const acceptedAt = new Date().toISOString();
  const evidence = {
    agreementId: state.agreementId,
    agreementVersion: "v1",
    status: "accepted_pending_didit_provider_wiring",
    acceptedAt,
    consentText,
    signer: {
      name: document.querySelector("[data-signer='name']")?.value || "",
      mobile: document.querySelector("[data-signer='mobile']")?.value || "",
      email: document.querySelector("[data-signer='email']")?.value || ""
    },
    device: getDeviceEvidence(),
    location: state.location,
    ipRisk: state.ipRisk,
    livePhoto: {
      mimeType: "image/jpeg",
      capturedAt: acceptedAt,
      dataUrlLength: state.photoDataUrl.length,
      sha256: await sha256(state.photoDataUrl)
    },
    providers: {
      didit: { status: "not_connected", transactionId: null },
      googleDrive: { status: "not_connected", folderId: null, fileIds: [] },
      whatsappOtp: { status: "future" }
    }
  };
  evidence.evidenceHash = await sha256(JSON.stringify(evidence));
  localStorage.setItem(`ems_legal_evidence_${state.agreementId}`, JSON.stringify(evidence));
  state.accepted = true;
  document.querySelector("#evidenceOutput").value = JSON.stringify(evidence, null, 2);
  document.querySelector("#acceptAgreementBtn").disabled = true;
  document.querySelector("#acceptedStatus").textContent = `Accepted and evidence bundle generated. Hash: ${evidence.evidenceHash}`;
  showToast("Agreement evidence bundle generated.", TOAST_TYPES.SUCCESS);
}

function renderPage() {
  renderModuleContent(`
    <style>
      .legal-sign-grid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.1fr);gap:1rem;align-items:start}
      .legal-capture-box{border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:.85rem;background:#111d31;color:#dbeafe}
      .legal-camera,.legal-photo{width:100%;aspect-ratio:4/3;object-fit:cover;background:#020617;border-radius:8px;border:1px solid #cbd5e1}
      .legal-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem}
      .legal-status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin-top:.75rem}
      .legal-status-grid div{border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:.65rem;background:#111d31;color:#dbeafe}
      .legal-status-grid strong{color:#f8fafc}
      .legal-status-grid .muted{color:#a9bad0}
      .legal-evidence-output{width:100%;min-height:320px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem}
      .danger-text{color:#b91c1c;font-weight:800}
      @media (max-width: 980px){.legal-sign-grid,.legal-fields,.legal-status-grid{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>Legal Signing Evidence Capture</h3>
      <p class="muted">Agreement ${escapeHtml(state.agreementId)} · Live photo, consent, GPS, IP, VPN risk, device details, Didit hook, and secure archive evidence.</p>
      <div id="riskBlocker" class="legal-capture-box danger-text" hidden>Signing is blocked for this attempt. Disable VPN/proxy/Tor or use a normal verified network, then refresh evidence.</div>
    </section>

    <div class="legal-sign-grid" style="margin-top:1rem;">
      <section class="card">
        <h3>Signer Identity</h3>
        <div class="legal-fields">
          <input data-signer="name" placeholder="Signer full name" />
          <input data-signer="mobile" placeholder="Mobile number" />
          <input data-signer="email" placeholder="Email" />
        </div>

        <div class="legal-capture-box" style="margin-top:.85rem;">
          <video id="legalCamera" class="legal-camera" autoplay playsinline muted></video>
          <canvas id="legalCanvas" hidden></canvas>
          <img id="photoPreview" class="legal-photo" alt="Captured signer" hidden style="margin-top:.65rem;" />
          <p id="captureStatus" class="muted">Camera not started.</p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
            <button class="btn" id="startCameraBtn" type="button">Enable Camera</button>
            <button class="btn" id="capturePhotoBtn" type="button" disabled>Capture Live Photo</button>
          </div>
        </div>

        <label style="display:grid;grid-template-columns:22px minmax(0,1fr);gap:.55rem;margin-top:.85rem;">
          <input id="legalConsent" type="checkbox" />
          <span id="legalConsentText">I have read the complete agreement, understood its terms, voluntarily accept it, and consent to live photo, timestamp, location, IP address, device details, KYC/signing provider references, and archive metadata being recorded as legal evidence.</span>
        </label>
      </section>

      <section class="card">
        <h3>Network, Location and Evidence</h3>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn" id="refreshEvidenceBtn" type="button">Capture Location + Check IP</button>
          <button class="btn btn-ghost" id="acceptAgreementBtn" type="button" disabled>Accept Agreement</button>
        </div>
        <div class="legal-status-grid">
          <div><strong>GPS Location</strong><p id="locationStatus" class="muted">Not captured</p></div>
          <div><strong>IP / VPN Risk</strong><p id="ipStatus" class="muted">Not checked</p></div>
          <div><strong>Didit</strong><p class="muted">Hook ready: KYC + digital signing transaction IDs</p></div>
          <div><strong>Google Drive</strong><p class="muted">Hook ready: signed PDF + evidence bundle file IDs</p></div>
        </div>
        <p id="acceptedStatus" class="muted" style="margin-top:.75rem;">Agreement is not accepted yet.</p>
        <textarea id="evidenceOutput" class="legal-evidence-output" placeholder="Final evidence bundle JSON appears after acceptance."></textarea>
      </section>
    </div>
  `);

  document.querySelector("#startCameraBtn")?.addEventListener("click", () => startCamera().catch((error) => showToast(error?.message || "Camera permission failed.", TOAST_TYPES.ERROR)));
  document.querySelector("#capturePhotoBtn")?.addEventListener("click", capturePhoto);
  document.querySelector("#refreshEvidenceBtn")?.addEventListener("click", () => refreshEvidence().catch((error) => showToast(error?.message || "Evidence refresh failed.", TOAST_TYPES.ERROR)));
  document.querySelector("#legalConsent")?.addEventListener("change", updateSubmitState);
  document.querySelector("#acceptAgreementBtn")?.addEventListener("click", acceptAgreement);
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_SIGNING,
    pageTitle: "Legal Signing Evidence",
    pageDescription: "Live photo, consent, GPS, IP risk, device record and acceptance bundle",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  renderPage();
}

window.addEventListener("beforeunload", () => {
  state.stream?.getTracks?.().forEach((track) => track.stop());
});

init();
