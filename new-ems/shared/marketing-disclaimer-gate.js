import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { getMarketingPortalSessionToken, signOutMarketingPortal } from "./marketing-api.js?v=marketing-whatsapp-1";
import { hasValidTermsBypassSession, redeemTermsBypassCode } from "./terms-gate.js?v=terms-face-handoff-2";

let faceDetectorPromise = null;

function loadFaceDetector() {
  if (faceDetectorPromise) return faceDetectorPromise;
  faceDetectorPromise = (async () => {
    const visionTasks = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs");
    const vision = await visionTasks.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
    );
    return visionTasks.FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
      },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.7,
      minSuppressionThreshold: 0.3
    });
  })();
  return faceDetectorPromise;
}

const DISCLAIMERS = {
  client: {
    eyebrow: "CLIENT PORTAL ACCESS NOTICE",
    title: "Client Portal Disclaimer & Electronic Acknowledgement",
    intro: "Please read this notice completely. It governs your use of the Digital Marketing & Services client workspace and operates together with your signed proposal, work order, agreement and applicable law.",
    acceptance: "I confirm that I am authorised to use this client account, have read and understood every section, and agree to the Client Portal Disclaimer and electronic-action terms shown above.",
    sections: [
      ["Authorised account and binding instructions", "You confirm that you are the client, or an authorised representative of the client entity shown in this portal. You must not share credentials or permit unauthorised access. Messages, approvals, revision requests, confirmations and other actions made through your account may be treated as authorised electronic business instructions attributable to the client, subject to the governing written agreement and applicable law."],
      ["Project information, decisions and approvals", "You must review briefs, deliverables, specifications, dates, dependencies and attachments before approving, rejecting or requesting changes. An approval or confirmation may allow work to proceed and may affect timelines, scope and cost. Report incorrect or incomplete information promptly. Portal progress indicators are operational updates and do not replace formal acceptance criteria stated in the governing agreement."],
      ["Invoices, credit notes and payments", "Invoices, credit notes, payment history and balances displayed here are business records based on information available to Varada Nexus. You must verify party details, GST information, amounts, due dates and payment references and promptly raise a query about any discrepancy. A portal display does not itself prove bank settlement, waive a valid amount, or replace professional tax, accounting or legal advice."],
      ["Confidentiality and permitted use", "Project material, commercial terms, credentials, communications, designs, strategies, reports, personal data and non-public information are confidential. You may use them only for the authorised client engagement and share them internally only on a need-to-know basis. Credential sharing, scraping, bulk extraction, unauthorised copying, publication, resale or disclosure is prohibited. Confidentiality obligations survive suspension or termination of portal access."],
      ["Queries and official communications", "The Queries workspace is an official recorded communication channel with the Varada Nexus team. Communications must be accurate, lawful and professional. You must not upload malicious, infringing or unlawful material. Varada Nexus may retain messages and action history for delivery, security, compliance, audit and dispute-resolution purposes."],
      ["Intellectual property and deliverables", "Ownership, licensing, permitted use and transfer of deliverables are governed by the applicable written agreement. Visibility, preview, download or review of a deliverable in the portal does not by itself transfer intellectual-property rights or remove payment, acceptance, licence or third-party restrictions. You must not use drafts or third-party assets outside the rights expressly granted."],
      ["Security, availability and suspension", "You must protect devices, passwords and verification codes and immediately report suspected compromise, mistaken disclosure or unauthorised activity. Portal access is limited, monitored and revocable. Features may be unavailable during maintenance or security events, and access may be suspended to protect the client, Varada Nexus or other users."],
      ["Responsibility, precedence and governing law", "You remain responsible for instructions and data submitted through your account and for loss caused by your fraud, wilful misconduct, unlawful disclosure or material breach, to the extent permitted by law. Nothing here excludes a responsibility or right that cannot lawfully be excluded. The governing proposal, work order or signed agreement prevails if a conflict exists. This notice is governed by Indian law, with jurisdiction as stated in the governing agreement or, if none is stated, the competent courts at Rajamahendravaram, Andhra Pradesh."],
    ]
  },
  vendor: {
    eyebrow: "VENDOR PORTAL ACCESS NOTICE",
    title: "Vendor Portal Disclaimer, White-Label Undertaking & Acknowledgement",
    intro: "This is a restricted delivery workspace. Read every section before continuing. This notice operates together with your vendor, freelancer, confidentiality, work-order and data-processing obligations.",
    acceptance: "I confirm that I am the authorised vendor or freelancer representative, have read and understood every section, and accept the white-label, confidentiality, non-circumvention, delivery, billing and electronic-action obligations shown above.",
    sections: [
      ["Authorised vendor account", "You confirm that you are the vendor, freelancer or authorised representative named in this portal and are legally authorised to act for that party. Access is personal, limited, monitored and revocable. You must not share credentials, create unauthorised users or allow another person to submit work, invoices, status updates or communications through your account."],
      ["Mandatory white-label identity", "When interacting with a client or client-facing material, you act only as an authorised member of the Varada Nexus delivery team. You must not disclose or imply that you are an independent third party, subcontractor, freelancer or separate agency; expose your separate branding; or provide personal or business contact details unless Varada Nexus gives prior written approval. You must follow authorised identity, communication and brand instructions."],
      ["Non-circumvention and no solicitation", "You must not bypass Varada Nexus to solicit, contract with, invoice, accept work from, quote prices to or establish an independent commercial relationship with a Varada Nexus client, prospect or lead introduced through the engagement. You must not divert opportunities or encourage direct dealing. These restrictions apply during the engagement and thereafter to the extent stated in the governing agreement and permitted by applicable law."],
      ["Confidentiality and data protection", "Client identity, project data, credentials, source files, strategies, pricing, margins, contracts, communications and all non-public Varada Nexus information are confidential. Use them only for assigned work, apply need-to-know access, and use approved systems and channels. Do not transfer data to personal cloud storage, external AI systems, unapproved processors or third parties. Immediately report loss, disclosure, compromise or suspicious access. These duties survive the end of the engagement."],
      ["Deliverables, status and professional standards", "Submit only original, complete and professionally competent work that meets the brief, law, platform rules and agreed deadlines. Status, percentage-complete, dependency and delivery updates must be accurate and timely; do not mark work complete before it is genuinely ready for review. Work may be reviewed, rejected or returned for revision under the governing work order. You may not change scope, deadline, price or client commitments without written authority."],
      ["Intellectual property, assets and technical safety", "You warrant that submitted work is created or lawfully licensed for the intended use and does not infringe intellectual-property, privacy or publicity rights. You must disclose third-party assets and their licence conditions. Do not submit malware, hidden access, copied work, unlicensed fonts/media/software, fabricated analytics or manipulated evidence. Ownership or licence transfer is governed by the vendor agreement, work order and applicable payment conditions."],
      ["Client and company queries", "Use the correct query recipient. Client-facing replies must be professional, limited to authorised project matters and consistent with Varada Nexus instructions. You must not discuss internal margins, vendor rates, subcontracting, disputes, staffing, confidential company matters or unauthorised promises with a client. Company-only queries must remain within the company channel."],
      ["Invoices, GST, PAN and payment records", "Invoice numbers, dates, GST/PAN details, bank information, tax rates, work descriptions and supporting bills must be genuine, complete and accurate. Duplicate, inflated, altered, misleading or fraudulent claims are prohibited. You are responsible for your registrations, filings, taxes and statutory compliance. Submission does not guarantee approval or payment; disputed or unsupported amounts may be held while reviewed, subject to the governing agreement and law."],
      ["Audit, suspension and remedies", "Portal actions, files, messages, status changes and invoice submissions may be logged and audited. Varada Nexus may restrict or suspend access, client contact or assignments to protect security, confidentiality, service quality or legal interests. A material breach may result in rejection of work, termination, recovery of proven loss, injunctive relief or other contractual and lawful remedies. Nothing creates a penalty or waives a non-waivable right beyond applicable law."],
      ["Precedence and governing law", "The applicable vendor or freelancer agreement, NDA and work order continue to apply and prevail if a conflict exists; the stricter lawful confidentiality, security or client-protection obligation applies where duties overlap. This notice is governed by Indian law, with jurisdiction as stated in the governing agreement or, if none is stated, the competent courts at Rajamahendravaram, Andhra Pradesh."],
    ]
  }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function injectStyles() {
  if (document.querySelector("#marketingDisclaimerStyles")) return;
  const style = document.createElement("style");
  style.id = "marketingDisclaimerStyles";
  style.textContent = `
    body.mkt-disclaimer-lock{overflow:hidden!important}
    .mkt-disclaimer-backdrop{position:fixed;inset:0;z-index:20000;display:grid;place-items:center;padding:18px;background:rgba(2,5,10,.9);backdrop-filter:blur(10px)}
    .mkt-disclaimer-modal{width:min(940px,100%);height:min(850px,calc(100vh - 36px));display:flex;flex-direction:column;overflow:hidden;color:#e9edf3;background:#090d13;border:1px solid rgba(202,161,64,.48);border-radius:20px;box-shadow:0 32px 110px rgba(0,0,0,.72);font-family:Manrope,system-ui,sans-serif}
    .mkt-disclaimer-head{padding:22px 26px 18px;background:linear-gradient(135deg,#17150f,#0b111b);border-bottom:1px solid rgba(202,161,64,.24)}
    .mkt-disclaimer-eyebrow{display:block;margin-bottom:8px;color:#d7ae4b;font-size:11px;font-weight:800;letter-spacing:.16em}.mkt-disclaimer-head h2{margin:0;color:#fff;font:700 clamp(22px,3vw,32px)/1.15 Georgia,serif}.mkt-disclaimer-head p{max-width:820px;margin:9px 0 0;color:#aeb8c6;font-size:13px;line-height:1.55}
    .mkt-disclaimer-scroll{flex:1;min-height:0;overflow:auto;padding:8px 26px 22px;overscroll-behavior:contain}.mkt-disclaimer-scroll section{padding:17px 0;border-bottom:1px solid rgba(148,163,184,.13)}.mkt-disclaimer-scroll h3{margin:0 0 7px;color:#e5bd5c;font:700 17px/1.3 Georgia,serif}.mkt-disclaimer-scroll p{margin:0;color:#c4ccd7;font-size:13px;line-height:1.68}
    .mkt-disclaimer-evidence{margin:18px 0 2px;padding:18px;border:1px solid rgba(215,174,75,.3);border-radius:16px;background:#0c121c}.mkt-disclaimer-evidence h3{margin:0 0 6px}.mkt-disclaimer-evidence>p{margin:0 0 14px}.mkt-disclaimer-person{display:grid;gap:6px;margin-bottom:14px;color:#d7ae4b;font-size:12px;font-weight:800}.mkt-disclaimer-person input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #303a49;border-radius:10px;background:#070b11;color:#fff;font:600 14px Manrope,sans-serif}.mkt-disclaimer-person small{color:#8f9bad;font-weight:500}.mkt-disclaimer-camera-grid{display:grid;grid-template-columns:minmax(240px,360px) 1fr;gap:16px;align-items:start}.mkt-disclaimer-camera{width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid #303a49;border-radius:13px;background:#020407}.mkt-disclaimer-camera-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.mkt-disclaimer-photo-consent{display:grid;grid-template-columns:20px 1fr;gap:9px;color:#bfc8d5;font-size:11px;line-height:1.5}.mkt-disclaimer-photo-consent input{width:17px;height:17px;accent-color:#d7ae4b}.mkt-disclaimer-proof-note{margin-top:10px!important;color:#8290a3!important;font-size:11px!important}.mkt-disclaimer-foot{padding:16px 26px 20px;background:#0c1119;border-top:1px solid rgba(148,163,184,.16)}.mkt-disclaimer-read{margin:0 0 10px;color:#8f9bad;font-size:11px}.mkt-disclaimer-check{display:grid;grid-template-columns:20px 1fr;gap:10px;align-items:start;color:#d8dee8;font-size:12px;line-height:1.5}.mkt-disclaimer-check input{width:18px;height:18px;margin:1px 0 0;accent-color:#d7ae4b}.mkt-disclaimer-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:15px}.mkt-disclaimer-btn{padding:10px 15px;border:1px solid #293342;border-radius:10px;background:#101722;color:#dce4ee;font-weight:800;cursor:pointer}.mkt-disclaimer-btn.primary{border-color:#d7ae4b;background:linear-gradient(135deg,#e4bd60,#b98c2e);color:#080b10}.mkt-disclaimer-btn:disabled{opacity:.42;cursor:not-allowed}.mkt-disclaimer-status{min-height:18px;margin:8px 0 0;color:#f1a6a6;font-size:12px}
    .mkt-disclaimer-owner-bypass{padding:16px 26px 20px;border-top:1px solid rgba(215,174,75,.25);background:#090f18}.mkt-disclaimer-owner-bypass h3{margin:0;color:#e5bd5c;font:700 17px/1.3 Georgia,serif}.mkt-disclaimer-owner-bypass p{margin:6px 0 11px;color:#8f9bad;font-size:11px;line-height:1.5}.mkt-disclaimer-owner-row{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:8px}.mkt-disclaimer-owner-row input{min-width:0;padding:10px 12px;border:1px solid #303a49;border-radius:10px;background:#05090f;color:#fff;font:700 13px ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase}
    @media(max-width:700px){.mkt-disclaimer-backdrop{padding:0}.mkt-disclaimer-modal{height:100vh;border-radius:0}.mkt-disclaimer-head,.mkt-disclaimer-scroll,.mkt-disclaimer-foot,.mkt-disclaimer-owner-bypass{padding-left:18px;padding-right:18px}.mkt-disclaimer-camera-grid{grid-template-columns:1fr}.mkt-disclaimer-actions{display:grid;grid-template-columns:1fr 1fr}.mkt-disclaimer-btn{padding:11px 8px}.mkt-disclaimer-owner-row{grid-template-columns:1fr 1fr}.mkt-disclaimer-owner-row input{grid-column:1/-1}}
  `;
  document.head.append(style);
}

async function statusFor(portalType) {
  const token = getMarketingPortalSessionToken();
  if (!token) throw new Error("Your secure portal session has expired. Sign in again.");
  const { data, error } = await getSupabaseClient().rpc("marketing_portal_disclaimer_status", {
    p_session_token: token,
    p_portal_type: portalType
  });
  if (error) throw error;
  return data;
}

async function recordAcceptance(portalType, status, evidenceDataUrl, authorizedPersonName, faceConfidence) {
  const token = getMarketingPortalSessionToken();
  if (!token) throw new Error("Your secure portal session has expired. Sign in again.");
  const image = String(evidenceDataUrl || "").match(/^data:(image\/jpeg);base64,(.+)$/);
  if (!image) throw new Error("Capture a valid live identity image before continuing.");
  const { data, error } = await getSupabaseClient().rpc("accept_marketing_portal_disclaimer", {
    p_session_token: token,
    p_portal_type: portalType,
    p_disclaimer_version: status.disclaimer_version,
    p_authorized_person_name: authorizedPersonName || null,
    p_evidence_mime_type: image[1],
    p_evidence_base64: image[2],
    p_photo_consent: true,
    p_face_detected: true,
    p_face_confidence: Number(faceConfidence || 0),
    p_user_agent: navigator.userAgent || null
  });
  if (error) throw error;
  return data;
}

function showGate(portalType, status) {
  const copy = DISCLAIMERS[portalType];
  return new Promise((resolve) => {
    injectStyles();
    document.body.classList.add("mkt-disclaimer-lock");
    const gate = document.createElement("div");
    gate.className = "mkt-disclaimer-backdrop";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "marketingDisclaimerTitle");
    gate.innerHTML = `<article class="mkt-disclaimer-modal">
      <header class="mkt-disclaimer-head"><span class="mkt-disclaimer-eyebrow">${copy.eyebrow}</span><h2 id="marketingDisclaimerTitle">${copy.title}</h2><p>${copy.intro}</p></header>
      <div class="mkt-disclaimer-scroll" id="marketingDisclaimerScroll">${copy.sections.map(([title, body], index) => `<section><h3>${index + 1}. ${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></section>`).join("")}
        <section class="mkt-disclaimer-evidence"><h3>Identity and acceptance evidence</h3><p>A live image of the accepting person and the network IP address supplied with this acceptance will be securely recorded as evidence. Face detection runs on this device; only one person may be visible.</p>
          ${status.requires_authorized_person ? `<label class="mkt-disclaimer-person">Authorised person’s full name<input id="marketingAuthorizedPerson" maxlength="160" autocomplete="name" value="${escapeHtml(status.suggested_authorized_person || "")}" placeholder="Full legal name" required><small>Accepting on behalf of ${escapeHtml(status.entity_name || "this organisation")}</small></label>` : ""}
          <div class="mkt-disclaimer-camera-grid"><video class="mkt-disclaimer-camera" id="marketingDisclaimerCamera" playsinline muted></video><div><div class="mkt-disclaimer-camera-actions"><button class="mkt-disclaimer-btn" id="marketingStartCamera" type="button">Enable live camera</button><button class="mkt-disclaimer-btn" id="marketingCapturePhoto" type="button" disabled>Capture identity photo</button></div><label class="mkt-disclaimer-photo-consent"><input id="marketingPhotoConsent" type="checkbox"><span>I expressly consent to Varada Nexus securely retaining this live identity image, its cryptographic fingerprint, the acceptance IP address, browser information and timestamp as evidence of this acknowledgement, security review and dispute management.</span></label><p class="mkt-disclaimer-proof-note">The IP address is captured by the server from the acceptance request and cannot be manually entered or changed here.</p><p class="mkt-disclaimer-status" id="marketingCameraStatus">Enable the camera, keep only the accepting person in frame, and capture a clear photo.</p></div></div>
        </section>
      </div>
      <footer class="mkt-disclaimer-foot"><p class="mkt-disclaimer-read" id="marketingDisclaimerRead">Scroll to the end to enable acknowledgement.</p><label class="mkt-disclaimer-check"><input id="marketingDisclaimerCheck" type="checkbox" disabled><span>${copy.acceptance}</span></label><p class="mkt-disclaimer-status" id="marketingDisclaimerStatus" aria-live="polite"></p><div class="mkt-disclaimer-actions"><button class="mkt-disclaimer-btn" id="marketingDisclaimerDecline">Decline &amp; sign out</button><button class="mkt-disclaimer-btn primary" id="marketingDisclaimerAccept" disabled>Accept &amp; continue</button></div></footer>
      <section class="mkt-disclaimer-owner-bypass" id="marketingDisclaimerOwnerBypass" hidden><h3>Chairman temporary access</h3><p>This single-use override opens only the current browser session. It does not accept this disclaimer for the account holder, and the original acknowledgement remains pending.</p><div class="mkt-disclaimer-owner-row"><input id="marketingDisclaimerBypassCode" type="password" autocomplete="off" aria-label="One-time Chairman bypass code" placeholder="One-time code"><button class="mkt-disclaimer-btn primary" id="marketingDisclaimerBypassApply" type="button">Bypass Once</button><button class="mkt-disclaimer-btn" id="marketingDisclaimerBypassCancel" type="button">Cancel</button></div><p class="mkt-disclaimer-status" id="marketingDisclaimerBypassStatus" aria-live="polite"></p></section>
    </article>`;
    document.body.append(gate);

    const scroll = gate.querySelector("#marketingDisclaimerScroll");
    const checkbox = gate.querySelector("#marketingDisclaimerCheck");
    const accept = gate.querySelector("#marketingDisclaimerAccept");
    const read = gate.querySelector("#marketingDisclaimerRead");
    const message = gate.querySelector("#marketingDisclaimerStatus");
    const video = gate.querySelector("#marketingDisclaimerCamera");
    const startCamera = gate.querySelector("#marketingStartCamera");
    const capturePhoto = gate.querySelector("#marketingCapturePhoto");
    const photoConsent = gate.querySelector("#marketingPhotoConsent");
    const cameraStatus = gate.querySelector("#marketingCameraStatus");
    const authorizedPerson = gate.querySelector("#marketingAuthorizedPerson");
    const bypassPanel = gate.querySelector("#marketingDisclaimerOwnerBypass");
    const bypassInput = gate.querySelector("#marketingDisclaimerBypassCode");
    const bypassApply = gate.querySelector("#marketingDisclaimerBypassApply");
    const bypassStatus = gate.querySelector("#marketingDisclaimerBypassStatus");
    let evidenceDataUrl = "";
    let faceConfidence = 0;
    let faceDetector = null;
    let cameraStream = null;
    let termsRead = false;
    const ownerShortcut = (event) => {
      if (!(event.ctrlKey && event.altKey && event.key.toLowerCase() === "b")) return;
      event.preventDefault();
      bypassPanel.hidden = !bypassPanel.hidden;
      bypassStatus.textContent = "";
      if (!bypassPanel.hidden) requestAnimationFrame(() => bypassInput.focus());
    };
    document.addEventListener("keydown", ownerShortcut);
    const removeGate = () => {
      document.removeEventListener("keydown", ownerShortcut);
      gate.remove();
      document.body.classList.remove("mkt-disclaimer-lock");
    };
    const updateAcceptState = () => {
      const personReady = !status.requires_authorized_person || String(authorizedPerson?.value || "").trim().length >= 2;
      accept.disabled = !(termsRead && checkbox.checked && photoConsent.checked && evidenceDataUrl && personReady);
    };
    const unlockRead = () => {
      if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 18) {
        checkbox.disabled = false;
        termsRead = true;
        read.textContent = "You have reached the end. Confirm the acknowledgement to continue.";
        updateAcceptState();
      }
    };
    scroll.addEventListener("scroll", unlockRead, { passive: true });
    requestAnimationFrame(unlockRead);
    checkbox.addEventListener("change", updateAcceptState);
    photoConsent.addEventListener("change", updateAcceptState);
    authorizedPerson?.addEventListener("input", updateAcceptState);

    startCamera.addEventListener("click", async () => {
      startCamera.disabled = true;
      evidenceDataUrl = "";
      faceConfidence = 0;
      updateAcceptState();
      cameraStatus.textContent = "Loading face detection and requesting camera access…";
      try {
        cameraStream?.getTracks().forEach((track) => track.stop());
        [cameraStream, faceDetector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
          loadFaceDetector()
        ]);
        video.removeAttribute("poster");
        video.srcObject = cameraStream;
        await video.play();
        capturePhoto.disabled = false;
        cameraStatus.textContent = "Camera ready. Keep exactly one person’s face clearly visible, then capture.";
      } catch (error) {
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        startCamera.disabled = false;
        cameraStatus.textContent = "The camera or local face detector could not start. Allow camera access and try again.";
      }
    });

    capturePhoto.addEventListener("click", () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const width = Math.min(640, video.videoWidth);
      const height = Math.round(width * video.videoHeight / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(video, 0, 0, width, height);
      const detections = faceDetector?.detect(canvas)?.detections || [];
      if (detections.length !== 1) {
        cameraStatus.textContent = detections.length ? "More than one face was detected. Only the accepting person may be in frame." : "No face was detected. Face the camera clearly and try again.";
        return;
      }
      const detection = detections[0];
      const box = detection.boundingBox || {};
      const faceArea = Number(box.width || 0) * Number(box.height || 0);
      const frameArea = width * height;
      faceConfidence = Number(detection.categories?.[0]?.score || 0);
      if (faceConfidence < .7 || !frameArea || faceArea / frameArea < .06) {
        cameraStatus.textContent = "The face is not clear or close enough. Move closer and capture again.";
        return;
      }
      evidenceDataUrl = canvas.toDataURL("image/jpeg", .82);
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      video.srcObject = null;
      video.poster = evidenceDataUrl;
      capturePhoto.disabled = true;
      startCamera.disabled = false;
      startCamera.textContent = "Retake photo";
      cameraStatus.textContent = `One person detected (${Math.round(faceConfidence * 100)}% confidence). Identity photo ready.`;
      updateAcceptState();
    });

    gate.querySelector("#marketingDisclaimerDecline").addEventListener("click", async () => {
      gate.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      cameraStream?.getTracks().forEach((track) => track.stop());
      try { await signOutMarketingPortal(); } finally { location.replace(ROUTES.LOGIN); }
    });
    gate.querySelector("#marketingDisclaimerBypassCancel").addEventListener("click", () => {
      bypassInput.value = "";
      bypassStatus.textContent = "";
      bypassPanel.hidden = true;
    });
    bypassApply.addEventListener("click", async () => {
      if (!bypassInput.value.trim()) {
        bypassStatus.textContent = "Enter the current one-time bypass code.";
        return;
      }
      bypassApply.disabled = true;
      bypassStatus.textContent = "Validating protected owner authority…";
      try {
        const result = await redeemTermsBypassCode(bypassInput.value);
        if (!result?.bypass_session_token) throw new Error("The bypass session could not be created.");
        sessionStorage.setItem("ems_terms_owner_bypass_session", result.bypass_session_token);
        cameraStream?.getTracks().forEach((track) => track.stop());
        removeGate();
        resolve(true);
      } catch (error) {
        bypassInput.value = "";
        bypassStatus.textContent = error?.message || "The one-time bypass code is invalid or expired.";
        bypassApply.disabled = false;
        bypassInput.focus();
      }
    });
    accept.addEventListener("click", async () => {
      accept.disabled = true;
      message.textContent = "Recording your acknowledgement securely…";
      try {
        await recordAcceptance(portalType, status, evidenceDataUrl, authorizedPerson?.value?.trim() || "", faceConfidence);
        cameraStream?.getTracks().forEach((track) => track.stop());
        removeGate();
        resolve(true);
      } catch (error) {
        message.textContent = error?.message || "The acknowledgement could not be recorded. Please try again.";
        updateAcceptState();
      }
    });
  });
}

export async function enforceMarketingPortalDisclaimer(portalType) {
  if (!DISCLAIMERS[portalType]) throw new Error("Unsupported marketing portal disclaimer type.");
  const status = await statusFor(portalType);
  if (status?.accepted) return true;
  if (await hasValidTermsBypassSession()) return true;
  return showGate(portalType, status);
}
