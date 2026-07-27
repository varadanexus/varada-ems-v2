import { ROUTES } from "../config/constants.js";
import { getSupabaseClient } from "../config/supabase.js";
import { getChatSessionTokens } from "./chat-api.js";
import { getLocalSession } from "./ems-local-auth.js";

export const CURRENT_TERMS_VERSION = "2026-07-04-v4";
const TERMS_BYPASS_SESSION_KEY = "ems_terms_owner_bypass_session";
const TERMS_DEVICE_ID_KEY = "ems_terms_device_id_v1";
const MIN_FACE_CONFIDENCE = 0.90;

function getOrCreateTermsDeviceId() {
  try {
    const existing = localStorage.getItem(TERMS_DEVICE_ID_KEY);
    if (/^ems-device-v1:[0-9a-f-]{36}$/i.test(existing || "")) return existing;
    const uuid = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : [...crypto.getRandomValues(new Uint8Array(16))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    const deviceId = `ems-device-v1:${uuid}`;
    localStorage.setItem(TERMS_DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch {
    return null;
  }
}

let faceDetectorPromise = null;
let qrCodePromise = null;

function loadQrCodeLibrary() {
  if (qrCodePromise) return qrCodePromise;
  qrCodePromise = (async () => {
    try {
      const module = await import("https://esm.sh/qrcode@1.5.4");
      const api = module.default || module;
      if (typeof api?.toCanvas === "function") return api;
    } catch (error) {
      console.warn("Primary QR module unavailable; loading fallback:", error?.message || error);
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("QR fallback generator could not load"));
      document.head.appendChild(script);
    });
    if (typeof window.QRCode !== "function") throw new Error("QR generator could not load");
    return {
      async toCanvas(targetCanvas, value, options = {}) {
        const holder = document.createElement("div");
        holder.style.cssText = "position:fixed;left:-9999px;top:-9999px";
        document.body.appendChild(holder);
        try {
          new window.QRCode(holder, {
            text: value,
            width: Number(options.width || 190),
            height: Number(options.width || 190),
            colorDark: options.color?.dark || "#05070b",
            colorLight: options.color?.light || "#ffffff",
            correctLevel: window.QRCode.CorrectLevel?.H
          });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const generated = holder.querySelector("canvas");
          if (!generated) throw new Error("QR fallback did not render");
          const context = targetCanvas.getContext("2d", { alpha: false });
          targetCanvas.width = generated.width;
          targetCanvas.height = generated.height;
          context.drawImage(generated, 0, 0);
        } finally {
          holder.remove();
        }
      }
    };
  })();
  return qrCodePromise;
}

function loadFaceDetector() {
  if (faceDetectorPromise) return faceDetectorPromise;
  faceDetectorPromise = (async () => {
    const visionTasks = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs");
    const vision = await visionTasks.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
    );
    return await visionTasks.FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
      },
      runningMode: "IMAGE",
      minDetectionConfidence: MIN_FACE_CONFIDENCE,
      minSuppressionThreshold: 0.3
    });
  })();
  return faceDetectorPromise;
}

export const DEFAULT_TERMS_HTML = `
  <section>
    <h3>1. Agreement and authorised use</h3>
    <p>These Terms and Conditions, Confidentiality Undertaking, Acceptable Use Rules and Electronic Consent (“Terms”) govern access to <strong>Varada Nexus EMS</strong> (“EMS” or “System”). By accepting, you confirm that you are the authorised holder of this account, are legally capable of accepting these Terms, and will use EMS only for legitimate Company or authorised portal business. Access is personal, limited, conditional, monitored, revocable and governed by your assigned role, division, portal entity and permissions.</p>
    <p>“Company” means Varada Nexus Private Limited and, where the context requires, its lawful successors and permitted assigns. “User” means the individual accepting these Terms. “Confidential Information” has the broad meaning stated below, whether marked confidential or not.</p>
  </section>
  <section>
    <h3>2. Account security</h3>
    <p>You must keep your password, session, verification codes and devices secure; must not share accounts; and must immediately report suspected compromise. Activity performed through your account may be attributed to you. Attempts to bypass authentication, permissions, audit controls or portal isolation are prohibited.</p>
  </section>
  <section>
    <h3>3. Confidentiality and data protection</h3>
    <p>All non-public EMS information—including credentials, personal data, contracts, prices, rates, margins, accounts, tax records, business plans, communications, documents and information concerning the Company, its management, employees, clients, transporters, agents, vendors and projects—is confidential. You may use it only for authorised duties and must apply need-to-know access, secure handling and approved communication channels. You must not disclose, photograph, copy, download, forward, publish, sell, exploit or retain confidential information except as expressly authorised.</p>
    <p><strong>Confidentiality obligations continue after role change, suspension, resignation, termination or the end of any business relationship.</strong> Suspected loss or disclosure must be reported immediately. Breach may result in access suspension, disciplinary or contractual action, recovery of losses, injunctions, civil proceedings, criminal complaint or other remedies available under company policy and applicable law.</p>
  </section>
  <section>
    <h3>4. Role, division and portal boundaries</h3>
    <p>Staff access is limited by page-level View, Create, Edit, Delete, Approve, Post and Export grants and by division scope. Portal users may view only records linked to their permitted entity or project. Portal users may not create operational or financial records and may act only on existing approvals when approval access is expressly granted.</p>
  </section>
  <section>
    <h3>5. Ownership and intellectual property</h3>
    <p>EMS, its software, workflows, designs, databases, reports, templates, documentation, branding, configurations and related intellectual property are owned by or licensed to the Company. No ownership or licence is granted except the limited, non-transferable and revocable right to use EMS for authorised duties. Reverse engineering, scraping, bulk extraction, copying system design, creating competing materials or removing proprietary notices is prohibited except where applicable law expressly prevents such restriction.</p>
  </section>
  <section>
    <h3>6. Financial and statutory records</h3>
    <p>Invoices, bills, credit notes, receipts, statements, payments, GST, TDS, tax, journals and reports must be supported by accurate source documents. Users must verify amounts, parties, tax treatment, dates and approvals before saving, approving, posting, filing, exporting or paying. EMS does not replace professional accounting, tax, legal or audit judgement.</p>
  </section>
  <section>
    <h3>7. Approvals and electronic actions</h3>
    <p>An approval, rejection, revision request, posting or confirmation made through your account is an electronic business action. You must review the complete record and attachments before acting. You must not approve your own work where segregation of duties or company policy prohibits it.</p>
  </section>
  <section>
    <h3>8. Nexus AI assistant</h3>
    <p>Nexus may provide guidance, summaries and permission-controlled actions. AI output can be incomplete or incorrect and must be verified against source records. Nexus does not grant authority, override permissions or replace required human review. Record-changing actions require confirmation and remain your responsibility.</p>
  </section>
  <section>
    <h3>9. Accuracy and acceptable conduct</h3>
    <p>You must enter accurate, complete and timely information; correct known errors; and avoid false, misleading, unlawful or malicious content. You must not upload malware, probe the system, automate abusive traffic, impersonate another person or interfere with availability or integrity.</p>
  </section>
  <section>
    <h3>10. Documents, downloads and retention</h3>
    <p>Downloaded documents remain confidential and must be stored, shared and destroyed according to company policy and applicable law. Records, messages, approvals and supporting documents may be retained for operational, statutory, contractual, security and audit purposes.</p>
  </section>
  <section>
    <h3>11. Monitoring, identity evidence and audit</h3>
    <p>Logins, access attempts, page activity, changes, approvals, exports, Nexus actions and other security-relevant events may be logged and reviewed. Monitoring is used for security, support, compliance, investigation and audit. Your acceptance evidence includes account identity, terms version, time, device/browser information and the identity image you expressly provide. The image is processed only to evidence acceptance and investigate disputes, is not used for facial recognition, and is retained only as required by the Company’s lawful retention and dispute-management policy.</p>
  </section>
  <section>
    <h3>12. Security incidents and mandatory cooperation</h3>
    <p>You must immediately report lost devices, compromised credentials, mistaken disclosure, suspicious access, malware, altered records or any actual or suspected confidentiality or security incident. You must preserve relevant evidence, cooperate with authorised investigation, remediation, audit and legal process, and must not conceal, destroy or alter evidence or retaliate against a person making a good-faith report.</p>
  </section>
  <section>
    <h3>13. Availability, suspension and changes</h3>
    <p>Features may be changed, suspended or withdrawn for maintenance, security, legal or business reasons. Access may be restricted or terminated for inactivity, role changes, policy violations, security risk or the end of a business relationship. Updated terms may require fresh acceptance.</p>
  </section>
  <section>
    <h3>14. Allocation of responsibility and acknowledgement</h3>
    <p>You remain responsible for actions performed through your account, information you enter, decisions you approve and any unauthorised use caused by your breach of these Terms, negligence, wilful misconduct or unlawful conduct. To the maximum extent permitted by applicable law, the Company, its directors, management and employees are not responsible for loss caused by a user’s unauthorised disclosure, inaccurate entry, misuse, permission circumvention, failure to verify records or violation of law or policy. Nothing in these Terms excludes or limits a responsibility that applicable law does not permit to be excluded.</p>
    <p>You acknowledge that unauthorised access, confidentiality breach, alteration or misuse may cause serious financial, commercial, reputational and legal harm. The Company reserves all lawful rights and remedies. By accepting, you confirm that you have read, understood and voluntarily agree to these Terms and the separate identity-image notice.</p>
  </section>
  <section>
    <h3>15. Indemnity for unauthorised conduct</h3>
    <p>To the extent permitted by applicable law and subject to the nature of the User’s relationship with the Company, the User is responsible for losses, claims, penalties, investigation costs and reasonable legal expenses directly arising from the User’s fraud, wilful misconduct, unlawful disclosure, deliberate permission circumvention or material breach of confidentiality. This clause does not remove employee protections or other rights that cannot lawfully be waived.</p>
  </section>
  <section>
    <h3>16. Injunctive and other relief</h3>
    <p>The User acknowledges that unauthorised disclosure or misuse of Confidential Information may cause harm that monetary compensation alone may not adequately remedy. The Company may seek urgent interim, protective or injunctive relief, recovery of losses and any civil, criminal, contractual, employment or statutory remedy available under applicable law.</p>
  </section>
  <section>
    <h3>17. Governing law and exclusive court jurisdiction</h3>
    <p>These Terms and every dispute, claim or proceeding arising from or connected with EMS, access, confidentiality, electronic acceptance or use of Company information are governed by the laws of India. Subject to any mandatory jurisdiction that applicable law does not permit the parties to exclude, the <strong>courts of competent jurisdiction at Rajamahendravaram, East Godavari District, Andhra Pradesh, India shall have exclusive jurisdiction</strong>. Disputes under these Terms shall be pursued through such courts and not private arbitration unless the Company and the affected party later enter a separate written arbitration agreement permitted by law.</p>
  </section>
  <section>
    <h3>18. Severability, waiver, precedence and survival</h3>
    <p>If a provision is held invalid or unenforceable, it shall be limited or severed only to the minimum extent required, and the remaining provisions continue in effect. Failure or delay in enforcement is not a waiver. Applicable employment contracts, confidentiality agreements, portal contracts and Company policies continue to apply; the stricter lawful confidentiality or security obligation prevails where provisions overlap. Confidentiality, ownership, audit, responsibility, remedies, governing law and jurisdiction survive termination of access.</p>
  </section>
  <section>
    <h3>19. Applicable legal and regulatory framework</h3>
    <p>Use of EMS and records maintained through it shall comply, where applicable, with the Indian Contract Act, 1872; Information Technology Act, 2000 and rules; Companies Act, 2013 and applicable rules concerning books, records, accounts, audit and electronic maintenance; Digital Personal Data Protection Act, 2023 and applicable rules and notifications; Bharatiya Sakshya Adhiniyam, 2023 concerning electronic or digital evidence; Bharatiya Nyaya Sanhita, 2023; Copyright Act, 1957; Trade Marks Act, 1999; Specific Relief Act, 1963; applicable GST, income-tax, labour, employment, anti-fraud, anti-bribery, cybersecurity and record-retention requirements; and binding orders of competent authorities.</p>
    <p>References to legislation include lawful amendments, replacements, subordinate legislation and binding directions. These Terms do not create an offence, penalty or statutory power beyond what applicable law provides, and do not waive any non-waivable right or duty.</p>
  </section>
  <section>
    <h3>20. Privacy, international access and cross-border compliance</h3>
    <p>Personal data shall be processed for identity, access control, security, audit, legal compliance, support and authorised business operations. Where a User or transaction is subject to an additional privacy regime—including the EU General Data Protection Regulation, UK GDPR, California privacy law or another applicable foreign law—the Company and User shall comply to the extent that regime lawfully applies. No foreign law applies merely because it is named here.</p>
    <p>Users must not transfer personal data or Confidential Information across borders, to personal cloud services, external AI systems or unapproved processors without written authorisation and required safeguards. Rights requests, grievances and lawful withdrawal requests must be submitted through the Company’s designated privacy or administrative channel; withdrawal does not invalidate processing already lawfully completed and may require termination of EMS access where processing is necessary for security or contract performance.</p>
  </section>
  <section>
    <h3>21. Notices, complete understanding and informed acceptance</h3>
    <p>System notices, policy updates and security directions may be delivered through EMS, registered email or another recorded business channel. These Terms operate together with the User’s employment, engagement, portal, confidentiality and data-processing documents and do not replace stricter lawful obligations in them. No oral statement changes these Terms. A change must be issued or approved through an authorised Company process, and a material revised version may require fresh electronic acceptance.</p>
    <p>The User confirms adequate opportunity to read these Terms, ask questions and seek independent advice before accepting; understands that declining prevents access; is not relying on a promise not recorded in the applicable written documents; and adopts the electronic acceptance procedure as evidence of informed agreement.</p>
  </section>
`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getDefaultTermsSections() {
  const template = document.createElement("template");
  template.innerHTML = DEFAULT_TERMS_HTML;
  return [...template.content.querySelectorAll("section")].map((section, index) => {
    const heading = section.querySelector("h3")?.textContent?.trim() || `Section ${index + 1}`;
    return {
      title: heading.replace(/^\d+\.\s*/, ""),
      body: [...section.querySelectorAll("p")]
        .map((paragraph) => paragraph.textContent.trim())
        .filter(Boolean)
        .join("\n\n"),
      enabled: true
    };
  });
}

function configuredTermsHtml(status) {
  const sections = Array.isArray(status?.sections) ? status.sections : [];
  const enabledSections = sections.filter((section) => section?.enabled !== false && (section?.title || section?.body));
  if (!enabledSections.length) return DEFAULT_TERMS_HTML;
  return enabledSections.map((section, index) => {
    const body = String(section.body || "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
      .join("");
    return `<section><h3>${index + 1}. ${escapeHtml(section.title || `Section ${index + 1}`)}</h3>${body || "<p>-</p>"}</section>`;
  }).join("");
}

function rpcArgs(extra = {}) {
  const tokens = getChatSessionTokens();
  return {
    ...extra,
    p_transport_session_token: tokens.transport,
    p_external_session_token: tokens.external
  };
}

async function getStatus() {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_my_terms_acceptance_status", rpcArgs());
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function acceptTerms(termsVersion, evidenceDataUrl = "", faceConfidence = 0, identityRequired = false) {
  const client = getSupabaseClient();
  const match = String(evidenceDataUrl || "").match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (identityRequired && !match) throw new Error("Capture a valid live identity image.");
  if (identityRequired && Number(faceConfidence || 0) < MIN_FACE_CONFIDENCE) {
    throw new Error("Recapture is required with at least 90% face detection confidence.");
  }
  const { data, error } = await client.rpc("accept_current_terms", rpcArgs({
    p_terms_version: termsVersion || CURRENT_TERMS_VERSION,
    p_user_agent: navigator.userAgent || null,
    p_evidence_mime_type: match?.[1] || null,
    p_evidence_base64: match?.[2] || null,
    p_photo_consent: identityRequired,
    p_face_detected: identityRequired,
    p_face_confidence: identityRequired ? Number(faceConfidence || 0) : 0,
    p_device_id: getOrCreateTermsDeviceId()
  }));
  if (error) throw error;
  return data;
}

async function createMobileHandoff() {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("create_terms_mobile_handoff", rpcArgs({
    p_device_id: getOrCreateTermsDeviceId()
  }));
  if (error) throw error;
  return data;
}

async function getMobileHandoffStatus(handoffToken) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_terms_mobile_handoff_status", {
    p_handoff_token: handoffToken
  });
  if (error) throw error;
  return data;
}

async function archiveTermsAcceptance(termsVersion) {
  const client = getSupabaseClient();
  const tokens = getChatSessionTokens();
  const localSession = getLocalSession();
  const { data, error } = await client.functions.invoke("drive-integrations", {
    body: {
      action: "archive_terms_acceptance",
      termsVersion: termsVersion || CURRENT_TERMS_VERSION,
      staffSessionToken: localSession?.sessionToken || null,
      transportSessionToken: tokens.transport,
      externalSessionToken: tokens.external
    }
  });
  if (error) {
    let message = error.message || "Terms evidence could not be archived to Drive.";
    if (error.context && typeof error.context.json === "function") {
      const detail = await error.context.json().catch(() => null);
      if (detail?.error) message = detail.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function redeemTermsBypassCode(code) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("redeem_terms_bypass_code", rpcArgs({
    p_bypass_code: String(code || "").trim(),
    p_user_agent: navigator.userAgent || null
  }));
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function hasValidTermsBypassSession() {
  const bypassToken = sessionStorage.getItem(TERMS_BYPASS_SESSION_KEY);
  if (!bypassToken) return false;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc("validate_terms_bypass_session", rpcArgs({
      p_bypass_session_token: bypassToken
    }));
    if (error) throw error;
    if (data === true) return true;
  } catch (error) {
    console.warn("Temporary Terms bypass session validation failed:", error?.message || error);
  }
  sessionStorage.removeItem(TERMS_BYPASS_SESSION_KEY);
  return false;
}

function injectStyles() {
  if (document.getElementById("emsTermsGateStyles")) return;
  const style = document.createElement("style");
  style.id = "emsTermsGateStyles";
  style.textContent = `
    .ems-terms-lock{overflow:hidden!important}
    .ems-terms-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(2,6,18,.86);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1rem}
    .ems-terms-modal{width:min(960px,100%);height:min(860px,calc(100vh - 2rem));display:flex;flex-direction:column;background:#0b1425;color:#e8eef8;border:1px solid rgba(212,178,106,.45);border-radius:20px;box-shadow:0 30px 100px rgba(0,0,0,.62);overflow:hidden}
    .ems-terms-head{padding:1.2rem 1.35rem;border-bottom:1px solid rgba(148,163,184,.2);background:linear-gradient(135deg,#142542,#0d172a)}
    .ems-terms-head h2{margin:0;color:#fff}.ems-terms-head p{margin:.4rem 0 0;color:#a9bad0;font-size:.9rem}
    .ems-terms-content{flex:1;min-height:0;overflow:auto;padding:1.15rem 1.35rem;line-height:1.55;overscroll-behavior:contain}
    .ems-terms-content section{padding:.8rem 0;border-bottom:1px solid rgba(148,163,184,.12)}
    .ems-terms-content h3{margin:0 0 .35rem;color:#f3cc75;font-size:1rem}.ems-terms-content p{margin:0;color:#c4d0df}
    .ems-terms-foot{padding:1rem 1.35rem;border-top:1px solid rgba(148,163,184,.2);background:#0e192c}
    .ems-terms-check{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:start;gap:.65rem;color:#d9e3ef;font-size:.9rem;line-height:1.4}.ems-terms-check input{width:18px;height:18px;margin:1px 0 0;justify-self:center;accent-color:#d4b26a}
    .ems-terms-evidence{margin:.85rem 0;padding:.75rem;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#091222}
    .ems-terms-evidence-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:.85rem;align-items:start}
    .ems-terms-camera{width:100%;aspect-ratio:4/3;border-radius:12px;background:#020617;object-fit:cover;border:1px solid rgba(148,163,184,.25)}
    .ems-terms-evidence p{margin:.25rem 0 .65rem;color:#aebdd0;font-size:.8rem;line-height:1.4}
    .ems-terms-evidence-actions{display:flex;gap:.45rem;flex-wrap:wrap}.ems-terms-file{max-width:100%;font-size:.78rem;color:#cbd5e1}
    .ems-terms-phone{margin-top:.75rem;padding:.8rem;border:1px solid rgba(212,178,106,.3);border-radius:14px;background:#070d17}.ems-terms-phone-grid{display:grid;grid-template-columns:190px 1fr;gap:.9rem;align-items:center}.ems-terms-qr{width:190px;height:190px;padding:10px;border-radius:12px;background:#fff}.ems-terms-phone h3{margin:0 0 .35rem;color:#f3cc75}.ems-terms-phone p{margin:.25rem 0;color:#aebdd0;font-size:.82rem;line-height:1.45}
    .ems-terms-actions{display:flex;justify-content:flex-end;gap:.65rem;margin-top:.9rem}
    .ems-terms-btn{border:1px solid rgba(148,163,184,.35);border-radius:11px;padding:.65rem .95rem;background:#14223a;color:#eef4fb;font-weight:800;cursor:pointer}
    .ems-terms-btn.primary{background:#b9903e;border-color:#d4b26a;color:#08111f}.ems-terms-btn:disabled{opacity:.45;cursor:not-allowed}
    .ems-terms-status{min-height:1.2rem;margin-top:.55rem;color:#fca5a5;font-size:.82rem}
    .ems-terms-owner-bypass{padding:1rem 1.35rem;border-top:1px solid rgba(212,178,106,.28);background:#0a1322}
    .ems-terms-owner-bypass h3{margin:0;color:#f3cc75;font-size:1rem}.ems-terms-owner-bypass p{margin:.35rem 0 .75rem;color:#9fb0c5;font-size:.8rem;line-height:1.45}
    .ems-terms-owner-bypass-row{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:.55rem}.ems-terms-owner-bypass input{min-width:0;border:1px solid rgba(148,163,184,.35);border-radius:10px;padding:.65rem .75rem;background:#060d19;color:#f8fafc;font:700 .88rem ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase}
    .ems-terms-modal [hidden]{display:none!important}
    .ems-identity-step{padding:1.15rem 1.35rem;overflow:auto;min-height:0;flex:1}
    .ems-identity-intro{margin:0 0 .8rem;color:#b8c7d9;line-height:1.5}
    @media(max-width:700px){.ems-terms-owner-bypass-row{grid-template-columns:1fr 1fr}.ems-terms-owner-bypass input{grid-column:1/-1}.ems-terms-phone-grid{grid-template-columns:1fr}.ems-terms-qr{justify-self:center}}
  `;
  document.head.appendChild(style);
}

async function declineAndLogout() {
  try {
    sessionStorage.removeItem(TERMS_BYPASS_SESSION_KEY);
    localStorage.removeItem("ems_transport_portal_session");
    localStorage.removeItem("ems_external_portal_session");
    localStorage.removeItem("ems_interiors_portal_session");
    localStorage.removeItem("ems_local_session");
    await getSupabaseClient().auth.signOut().catch(() => {});
  } finally {
    window.location.replace(ROUTES.LOGIN);
  }
}

function showGate(status) {
  return new Promise((resolve) => {
    const termsVersion = status?.terms_version || CURRENT_TERMS_VERSION;
    const title = status?.title || "Varada Nexus EMS Terms and Conditions";
    const effectiveDate = status?.effective_at ? new Date(status.effective_at).toLocaleDateString() : "04 July 2026";
    const identityRequired = status?.identity_capture_enabled === true;
    const requireFullScroll = status?.require_full_scroll !== false;
    const allowDecline = status?.allow_decline !== false;
    const acceptanceLabel = status?.acceptance_label || "I have read, understood and agree to the complete Terms and Conditions, Confidentiality Undertaking and Acceptable Use Rules.";
    injectStyles();
    document.documentElement.classList.add("ems-terms-lock");
    document.body.classList.add("ems-terms-lock");
    const overlay = document.createElement("div");
    overlay.className = "ems-terms-backdrop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "emsTermsTitle");
    overlay.innerHTML = `
      <div class="ems-terms-modal">
        <header class="ems-terms-head">
          <h2 id="emsTermsTitle">${escapeHtml(title)}</h2>
          <p>Version ${escapeHtml(termsVersion)} · Effective ${escapeHtml(effectiveDate)} · Read the complete terms to continue.</p>
        </header>
        <div class="ems-terms-content" id="emsTermsContent" tabindex="0">${configuredTermsHtml(status)}</div>
        <footer class="ems-terms-foot" id="emsTermsDecisionStep">
          <label class="ems-terms-check"><input id="emsTermsAgree" type="checkbox" ${requireFullScroll ? "disabled" : ""} /><span>${escapeHtml(acceptanceLabel)}</span></label>
          <div class="ems-terms-status" id="emsTermsReadStatus">${requireFullScroll ? "Scroll to the end to enable acceptance." : "Confirm your agreement to continue."}</div>
          <div class="ems-terms-actions">
            <button class="ems-terms-btn" id="emsTermsDecline" type="button" ${allowDecline ? "" : "hidden"}>Decline and Logout</button>
            <button class="ems-terms-btn primary" id="emsTermsProceed" type="button" disabled>${identityRequired ? "I Accept the Terms" : "Accept and Continue"}</button>
          </div>
        </footer>
        <section class="ems-terms-owner-bypass" id="emsTermsOwnerBypass" hidden>
          <h3>Chairman temporary access</h3>
          <p>This single-use override opens only the current browser session. It does not accept these Terms for the account holder, and the full acceptance will remain pending.</p>
          <div class="ems-terms-owner-bypass-row">
            <input id="emsTermsBypassCode" type="password" autocomplete="off" inputmode="text" aria-label="One-time Chairman bypass code" placeholder="One-time code" />
            <button class="ems-terms-btn primary" id="emsTermsBypassApply" type="button">Bypass Once</button>
            <button class="ems-terms-btn" id="emsTermsBypassCancel" type="button">Cancel</button>
          </div>
          <div class="ems-terms-status" id="emsTermsBypassStatus" aria-live="polite"></div>
        </section>
        <div class="ems-identity-step" id="emsIdentityStep" hidden>
          <h2 style="margin:.1rem 0 .35rem;color:#fff;">Quick identity confirmation</h2>
          <p class="ems-identity-intro">One live camera image confirms that the account holder personally completed this acceptance. The image is stored privately as acceptance evidence and is not used for facial recognition.</p>
          <div class="ems-terms-evidence">
            <div class="ems-terms-evidence-grid">
              <video class="ems-terms-camera" id="emsTermsCamera" autoplay playsinline muted></video>
              <div>
                <strong>Take a quick live photo</strong>
                <p>Keep only the accepting person in frame. The capture must confirm exactly one clear face at 90% confidence or higher. Lower-confidence images are rejected and must be recaptured.</p>
                <div class="ems-terms-evidence-actions">
                  <button class="ems-terms-btn" id="emsTermsStartCamera" type="button">Enable Camera</button>
                  <button class="ems-terms-btn" id="emsTermsCapture" type="button" disabled>Capture Live Image</button>
                  <button class="ems-terms-btn" id="emsTermsUsePhone" type="button">Use phone instead</button>
                </div>
                <label class="ems-terms-check" style="margin-top:.7rem;"><input id="emsTermsPhotoConsent" type="checkbox" /><span>I consent to this identity image being collected and retained solely as evidence of my acceptance and for related security, audit or dispute purposes.</span></label>
              </div>
            </div>
            <div class="ems-terms-phone" id="emsTermsPhonePanel" hidden>
              <div class="ems-terms-phone-grid">
                <canvas class="ems-terms-qr" id="emsTermsPhoneQr" width="190" height="190"></canvas>
                <div>
                  <h3>Continue securely on your phone</h3>
                  <p>Scan this one-time QR code with your phone camera. The mobile guide will help you capture one clear face above 90% confidence.</p>
                  <p id="emsTermsPhoneExpiry">Generating a secure 10-minute link…</p>
                  <button class="ems-terms-btn" id="emsTermsRefreshPhoneQr" type="button">Generate a new QR code</button>
                </div>
              </div>
            </div>
          </div>
          <div class="ems-terms-status" id="emsTermsStatus">Scroll to the end to enable acceptance.</div>
          <div class="ems-terms-actions">
            <button class="ems-terms-btn" id="emsTermsBack" type="button">Back to Terms</button>
            <button class="ems-terms-btn primary" id="emsTermsAccept" type="button" disabled>Confirm Identity and Continue</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const content = overlay.querySelector("#emsTermsContent");
    const agree = overlay.querySelector("#emsTermsAgree");
    const accept = overlay.querySelector("#emsTermsAccept");
    const proceed = overlay.querySelector("#emsTermsProceed");
    const decisionStep = overlay.querySelector("#emsTermsDecisionStep");
    const identityStep = overlay.querySelector("#emsIdentityStep");
    const headerText = overlay.querySelector(".ems-terms-head p");
    const readStatus = overlay.querySelector("#emsTermsReadStatus");
    const photoConsent = overlay.querySelector("#emsTermsPhotoConsent");
    const video = overlay.querySelector("#emsTermsCamera");
    const capture = overlay.querySelector("#emsTermsCapture");
    const usePhone = overlay.querySelector("#emsTermsUsePhone");
    const phonePanel = overlay.querySelector("#emsTermsPhonePanel");
    const phoneQr = overlay.querySelector("#emsTermsPhoneQr");
    const phoneExpiry = overlay.querySelector("#emsTermsPhoneExpiry");
    const refreshPhoneQr = overlay.querySelector("#emsTermsRefreshPhoneQr");
    const bypassPanel = overlay.querySelector("#emsTermsOwnerBypass");
    const bypassInput = overlay.querySelector("#emsTermsBypassCode");
    const bypassApply = overlay.querySelector("#emsTermsBypassApply");
    const bypassStatus = overlay.querySelector("#emsTermsBypassStatus");
    let evidenceDataUrl = "";
    let faceConfidence = 0;
    let faceDetector = null;
    let cameraStream = null;
    let mobileHandoffToken = "";
    let mobilePollTimer = null;
    let termsRead = !requireFullScroll;
    const statusText = overlay.querySelector("#emsTermsStatus");
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
      if (mobilePollTimer) clearInterval(mobilePollTimer);
      overlay.remove();
      document.documentElement.classList.remove("ems-terms-lock");
      document.body.classList.remove("ems-terms-lock");
    };
    const updateAcceptState = () => {
      accept.disabled = identityRequired
        ? !(agree.checked && photoConsent.checked && evidenceDataUrl)
        : !agree.checked;
    };
    const finishMobileAcceptance = async () => {
      if (mobilePollTimer) clearInterval(mobilePollTimer);
      mobilePollTimer = null;
      statusText.textContent = "Phone capture verified. Securing the evidence archive…";
      statusText.style.color = "#a7f3d0";
      try {
        await archiveTermsAcceptance(termsVersion);
      } catch (archiveError) {
        console.warn("Terms Drive archive is pending and will retry:", archiveError?.message || archiveError);
      }
      cameraStream?.getTracks().forEach((track) => track.stop());
      removeGate();
      resolve(true);
    };
    const pollMobileHandoff = async () => {
      if (!mobileHandoffToken) return;
      try {
        const handoff = await getMobileHandoffStatus(mobileHandoffToken);
        if (handoff?.status === "completed") {
          await finishMobileAcceptance();
        } else if (["expired", "cancelled"].includes(handoff?.status)) {
          if (mobilePollTimer) clearInterval(mobilePollTimer);
          mobilePollTimer = null;
          phoneExpiry.textContent = "This QR code expired or was replaced. Generate a new one.";
          statusText.textContent = "The phone link is no longer active. Generate a new QR code.";
          statusText.style.color = "#fca5a5";
        }
      } catch (error) {
        console.warn("Phone handoff status check failed:", error?.message || error);
      }
    };
    const generateMobileHandoff = async () => {
      usePhone.disabled = true;
      refreshPhoneQr.disabled = true;
      phonePanel.hidden = false;
      phoneExpiry.textContent = "Generating a secure 10-minute link…";
      statusText.textContent = "Preparing phone camera handoff…";
      statusText.style.color = "#dbeafe";
      try {
        const [handoff, QRCode] = await Promise.all([createMobileHandoff(), loadQrCodeLibrary()]);
        mobileHandoffToken = handoff?.handoff_token || "";
        if (!mobileHandoffToken) throw new Error("The secure phone link could not be created.");
        const mobileUrl = new URL("https://www.varadanexus.com/terms-mobile.html");
        mobileUrl.searchParams.set("handoff", mobileHandoffToken);
        await QRCode.toCanvas(phoneQr, mobileUrl.toString(), {
          width: 190,
          margin: 1,
          color: { dark: "#05070b", light: "#ffffff" },
          errorCorrectionLevel: "H"
        });
        const expiry = handoff?.expires_at
          ? new Date(handoff.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "10 minutes";
        phoneExpiry.textContent = `Single-use link · Expires at ${expiry}. This computer will continue automatically after successful capture.`;
        statusText.textContent = "Scan the QR code and complete the guided capture on your phone.";
        statusText.style.color = "#a7f3d0";
        if (mobilePollTimer) clearInterval(mobilePollTimer);
        mobilePollTimer = setInterval(pollMobileHandoff, 2500);
      } catch (error) {
        phoneExpiry.textContent = error?.message || "The phone handoff could not be created.";
        statusText.textContent = phoneExpiry.textContent;
        statusText.style.color = "#fca5a5";
      } finally {
        usePhone.disabled = false;
        refreshPhoneQr.disabled = false;
      }
    };
    const updateScrollState = () => {
      if (!requireFullScroll) {
        agree.disabled = false;
        readStatus.style.color = "#a7f3d0";
        return;
      }
      const reachedEnd = content.scrollTop + content.clientHeight >= content.scrollHeight - 12;
      if (reachedEnd) {
        termsRead = true;
        agree.disabled = false;
        readStatus.textContent = "Confirm your agreement to continue.";
        readStatus.style.color = "#a7f3d0";
      }
    };
    content.addEventListener("scroll", updateScrollState);
    updateScrollState();
    agree.addEventListener("change", () => {
      proceed.disabled = !agree.checked;
      updateAcceptState();
    });
    photoConsent.addEventListener("change", updateAcceptState);
    const finishAcceptance = async () => {
      const messageTarget = identityRequired ? statusText : readStatus;
      proceed.disabled = true;
      accept.disabled = true;
      agree.disabled = true;
      messageTarget.textContent = "Recording your acceptance…";
      messageTarget.style.color = "#dbeafe";
      try {
        await acceptTerms(termsVersion, evidenceDataUrl, faceConfidence, identityRequired);
        messageTarget.textContent = "Acceptance recorded. Securing the photo and accepted Terms in the company archive…";
        messageTarget.style.color = "#dbeafe";
        try {
          await archiveTermsAcceptance(termsVersion);
        } catch (archiveError) {
          // The restricted database record remains authoritative. The archive
          // queue retries idempotently on the user's next authenticated visit.
          console.warn("Terms Drive archive is pending and will retry:", archiveError?.message || archiveError);
        }
        cameraStream?.getTracks().forEach((track) => track.stop());
        removeGate();
        resolve(true);
      } catch (error) {
        messageTarget.textContent = error?.message || "Acceptance could not be recorded. Please try again.";
        messageTarget.style.color = "#fca5a5";
        agree.disabled = requireFullScroll && !termsRead;
        proceed.disabled = !agree.checked;
        updateAcceptState();
      }
    };
    proceed.addEventListener("click", async () => {
      if (!agree.checked) return;
      if (!identityRequired) {
        await finishAcceptance();
        return;
      }
      content.hidden = true;
      decisionStep.hidden = true;
      identityStep.hidden = false;
      headerText.textContent = "Terms accepted in principle · Complete the quick identity confirmation to record and activate access.";
      statusText.textContent = "Enable the camera to begin.";
      statusText.style.color = "#dbeafe";
    });
    overlay.querySelector("#emsTermsBack").addEventListener("click", () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      video.srcObject = null;
      video.removeAttribute("poster");
      capture.disabled = true;
      evidenceDataUrl = "";
      faceConfidence = 0;
      photoConsent.checked = false;
      accept.disabled = true;
      identityStep.hidden = true;
      content.hidden = false;
      decisionStep.hidden = false;
      headerText.textContent = `Version ${termsVersion} · Read the complete terms, then accept to continue.`;
    });
    overlay.querySelector("#emsTermsStartCamera").addEventListener("click", async () => {
      try {
        statusText.textContent = "Loading live face detection and requesting camera access…";
        statusText.style.color = "#dbeafe";
        [cameraStream, faceDetector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
          loadFaceDetector()
        ]);
        video.srcObject = cameraStream;
        await video.play();
        capture.disabled = false;
        statusText.textContent = "Camera ready. Keep exactly one person’s face clearly visible, then capture.";
        statusText.style.color = "#a7f3d0";
      } catch (error) {
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        statusText.textContent = "This computer camera is unavailable. Scan the phone QR code to complete the guided live-face capture.";
        statusText.style.color = "#fca5a5";
        await generateMobileHandoff();
      }
    });
    capture.addEventListener("click", () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const width = Math.min(640, video.videoWidth);
      const height = Math.round(width * video.videoHeight / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(video, 0, 0, width, height);
      const result = faceDetector?.detect(canvas);
      const detections = result?.detections || [];
      if (detections.length !== 1) {
        statusText.textContent = detections.length
          ? "More than one face was detected. Only the accepting person may be in frame."
          : "No person’s face was detected. Face the camera clearly and try again.";
        statusText.style.color = "#fca5a5";
        return;
      }
      const detection = detections[0];
      const box = detection.boundingBox || {};
      const faceArea = Number(box.width || 0) * Number(box.height || 0);
      const frameArea = width * height;
      faceConfidence = Number(detection.categories?.[0]?.score || 0);
      if (faceConfidence < MIN_FACE_CONFIDENCE || !frameArea || faceArea / frameArea < .08) {
        evidenceDataUrl = "";
        updateAcceptState();
        statusText.textContent = `Capture rejected at ${Math.round(faceConfidence * 100)}%. Improve the light, move closer, and recapture above 90%.`;
        statusText.style.color = "#fca5a5";
        return;
      }
      evidenceDataUrl = canvas.toDataURL("image/jpeg", .82);
      video.srcObject = null;
      video.poster = evidenceDataUrl;
      cameraStream?.getTracks().forEach((track) => track.stop());
      cameraStream = null;
      statusText.textContent = `One clear face confirmed (${Math.round(faceConfidence * 100)}% confidence). Confirm both checkboxes to continue.`;
      statusText.style.color = "#a7f3d0";
      updateAcceptState();
    });
    usePhone.addEventListener("click", generateMobileHandoff);
    refreshPhoneQr.addEventListener("click", generateMobileHandoff);
    overlay.querySelector("#emsTermsDecline").addEventListener("click", declineAndLogout);
    overlay.querySelector("#emsTermsBypassCancel").addEventListener("click", () => {
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
      bypassStatus.style.color = "#dbeafe";
      try {
        const result = await redeemTermsBypassCode(bypassInput.value);
        if (!result?.bypass_session_token) throw new Error("The bypass session could not be created.");
        sessionStorage.setItem(TERMS_BYPASS_SESSION_KEY, result.bypass_session_token);
        cameraStream?.getTracks().forEach((track) => track.stop());
        removeGate();
        resolve(true);
      } catch (error) {
        bypassInput.value = "";
        bypassStatus.textContent = error?.message || "The one-time bypass code is invalid or expired.";
        bypassStatus.style.color = "#fca5a5";
        bypassApply.disabled = false;
        bypassInput.focus();
      }
    });
    accept.addEventListener("click", async () => {
      await finishAcceptance();
    });
    requestAnimationFrame(() => content.focus());
  });
}

export async function enforceTermsAcceptance() {
  // If the acceptance status can't be resolved (null / transient error), don't
  // block or blank the app — fall through to the gate so the user can accept
  // the terms and continue the login. showGate() renders sensible defaults when
  // status is null.
  let status = null;
  try {
    status = await getStatus();
  } catch (error) {
    console.warn("Terms status unavailable; prompting acceptance to continue:", error?.message || error);
    status = null;
  }
  if (status?.popup_enabled === false) return true;
  if (status?.accepted) {
    if (status.drive_archive_status !== "stored") {
      archiveTermsAcceptance(status.terms_version).catch((error) => {
        console.warn("Terms Drive archive retry remains pending:", error?.message || error);
      });
    }
    return true;
  }
  if (await hasValidTermsBypassSession()) return true;
  return await showGate(status);
}
