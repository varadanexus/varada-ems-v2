import { MODULES, ROUTES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { dispatchNotification } from "./notification-api.js";
import { showToast } from "./utils.js";
import { escapeHtml } from "./legal-workflow-data.js";
import { prepareLegalSend, getTwilioMessageStatus, listLegalData } from "./legal-api.js";

function agreementNo(row) {
  return row.agreement_no || row.id || "";
}

function options(agreements) {
  if (!agreements.length) return `<option value="">No approved agreements available</option>`;
  return agreements.map((row) => `<option value="${escapeHtml(agreementNo(row))}">${escapeHtml(agreementNo(row))} - ${escapeHtml(row.title || "")}</option>`).join("");
}

function normalizeIndiaMobile(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function renderTwilioStatus(whatsapp = {}) {
  if (!whatsapp?.configured) return "Twilio secrets not configured yet";
  const payload = whatsapp.payload || {};
  const bits = [
    `SID: ${whatsapp.sid || "-"}`,
    `Status: ${payload.status || whatsapp.status || "accepted"}`,
    whatsapp.template ? "Mode: approved template" : "Mode: free-form body",
    payload.error_code ? `Error: ${payload.error_code}` : "",
    payload.error_message ? payload.error_message : ""
  ].filter(Boolean);
  return bits.map(escapeHtml).join("<br>");
}

function renderPage(agreements = []) {
  renderModuleContent(`
    <style>
      .legal-send-layout{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(0,1.1fr);gap:1rem;align-items:start}
      .legal-send-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
      .legal-send-form input,.legal-send-form select,.legal-send-form textarea{width:100%;min-width:0}
      .legal-flow-list{display:grid;gap:.65rem;margin:0;padding:0;list-style:none}
      .legal-flow-list li{display:grid;grid-template-columns:34px minmax(0,1fr);gap:.65rem;align-items:start;border:1px solid rgba(230,200,126,.14);border-radius:12px;padding:.7rem;background:linear-gradient(145deg,rgba(230,200,126,.035),#07080d 65%);color:#c9c5b8}
      .legal-flow-list b{width:34px;height:34px;border:1px solid rgba(230,200,126,.15);border-radius:9px;background:#090a0e;color:#e6c87e;display:grid;place-items:center}
      .legal-flow-list strong{color:#f7f4ec}
      .legal-flow-list .muted{color:#9b9788}
      @media (max-width: 980px){.legal-send-layout,.legal-send-form{grid-template-columns:1fr}}
    </style>
    <div class="legal-send-layout">
      <section class="card">
        <h3>Send Agreement To User</h3>
        <p class="muted">Send only locked, approved versions for Didit KYC and digital signing.</p>
        <div class="legal-send-form">
          <select id="agreementSelect">${options(agreements)}</select>
          <select><option>Client</option><option>Vendor</option><option>Employee</option><option>Consultant</option></select>
          <input id="recipientName" placeholder="Recipient full name" />
          <input id="recipientMobile" placeholder="Mobile number" />
          <input id="recipientEmail" placeholder="Email address" />
          <select><option>Didit KYC + Digital Sign</option><option>KYC Only</option><option>Manual Review Only</option></select>
          <textarea id="sendMessage" rows="5" style="grid-column:1/-1" placeholder="WhatsApp message / portal notification"></textarea>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;">
          <button class="btn" id="prepareSendBtn" type="button">Prepare Send Request</button>
          <a class="btn btn-ghost" href="${ROUTES.LEGAL_SIGNING}">Open Evidence Page</a>
        </div>
        <div id="sendResult" class="legal-flow-list" style="margin-top:.85rem;"></div>
      </section>
      <section class="card">
        <h3>Release Checklist</h3>
        <ul class="legal-flow-list">
          <li><b>1</b><span><strong>Version lock</strong><br><span class="muted">Final PDF and content hash must be frozen before portal release.</span></span></li>
          <li><b>2</b><span><strong>Recipient authority</strong><br><span class="muted">Signer name, mobile and email must match the authorised party.</span></span></li>
          <li><b>3</b><span><strong>Didit session</strong><br><span class="muted">Create KYC/sign session and store provider IDs before notification.</span></span></li>
          <li><b>4</b><span><strong>Evidence policy</strong><br><span class="muted">Live photo, GPS, IP, VPN block and consent record are required.</span></span></li>
        </ul>
      </section>
    </div>
  `);
  document.querySelector("#prepareSendBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#prepareSendBtn");
    const result = document.querySelector("#sendResult");
    const id = document.querySelector("#agreementSelect")?.value;
    if (!id) {
      result.innerHTML = `<li><b>!</b><span><strong>No agreement selected</strong><br><span class="muted">Create or approve a legal agreement before sending.</span></span></li>`;
      showToast("No agreement selected.", TOAST_TYPES.ERROR);
      return;
    }
    const agreement = agreements.find((row) => agreementNo(row) === id) || {};
    const recipientName = document.querySelector("#recipientName")?.value || agreement.signer_name || agreement.signer || "";
    const recipientMobile = normalizeIndiaMobile(document.querySelector("#recipientMobile")?.value || agreement.signer_mobile || agreement.mobile || "");
    const recipientEmail = document.querySelector("#recipientEmail")?.value || agreement.signer_email || agreement.email || "";
    if (!recipientName.trim() || !recipientMobile || recipientMobile.length < 12) {
      result.innerHTML = `<li><b>!</b><span><strong>Missing recipient details</strong><br><span class="muted">Enter full name and a valid 10 digit India mobile number.</span></span></li>`;
      showToast("Enter full name and valid mobile number.", TOAST_TYPES.ERROR);
      return;
    }
    button.disabled = true;
    button.textContent = "Preparing...";
    result.innerHTML = "";
    try {
      const data = await prepareLegalSend({
        agreementNo: id,
        title: agreement.title || id,
        agreementType: agreement.agreement_type || agreement.type || "custom",
        partyName: agreement.party_name || agreement.party || "",
        recipientName,
        recipientMobile,
        recipientEmail,
        whatsappMessage: document.querySelector("#sendMessage")?.value || "",
        sendWhatsapp: true
      });
      try {
        await dispatchNotification({
          moduleCode: MODULES.LEGAL_SEND,
          eventCode: "legal_send_prepared",
          category: "legal",
          title: `Agreement sent: ${id}`,
          message: `${recipientName} was prepared for KYC/signing on ${agreement.title || id}.`,
          severity: "success",
          actionLabel: "View Agreements",
          actionUrl: ROUTES.LEGAL_AGREEMENTS,
          entityType: "legal_agreement",
          entityId: String(id),
          targetMode: "smart",
          targetRoleCodes: ["super_admin", "admin", "advocate"],
          context: {
            agreement_no: id,
            recipient_name: recipientName,
            recipient_mobile: recipientMobile,
            public_sign_url: data.publicSignUrl || null
          }
        });
      } catch {}
      result.innerHTML = `
        <li><b>1</b><span><strong>Signing link created</strong><br><a href="${data.publicSignUrl}" target="_blank" rel="noreferrer">${data.publicSignUrl}</a></span></li>
        <li><b>2</b><span><strong>Didit</strong><br><span class="muted">${data.didit?.configured ? "Session created" : "Secrets not configured yet"}</span></span></li>
        <li><b>3</b><span><strong>Twilio WhatsApp</strong><br><span class="muted">${renderTwilioStatus(data.whatsapp)}</span>${data.whatsapp?.sid ? `<br><button class="btn btn-ghost" data-twilio-status="${escapeHtml(data.whatsapp.sid)}" type="button" style="margin-top:.55rem;">Check Twilio Status</button>` : ""}</span></li>
      `;
      document.querySelector("[data-twilio-status]")?.addEventListener("click", async (event) => {
        const statusButton = event.currentTarget;
        const sid = statusButton.dataset.twilioStatus;
        statusButton.disabled = true;
        statusButton.textContent = "Checking...";
        try {
          const latest = await getTwilioMessageStatus(sid);
          const p = latest.payload || {};
          statusButton.insertAdjacentHTML("beforebegin", `<span class="muted"><br>Latest: ${escapeHtml(p.status || "-")}${p.error_code ? ` · ${escapeHtml(p.error_code)}` : ""}${p.error_message ? ` · ${escapeHtml(p.error_message)}` : ""}</span>`);
          showToast("Twilio status checked.", TOAST_TYPES.SUCCESS);
        } catch (error) {
          showToast(error?.message || "Twilio status check failed.", TOAST_TYPES.ERROR);
        } finally {
          statusButton.disabled = false;
          statusButton.textContent = "Check Twilio Status";
        }
      });
      showToast("Signing request prepared.", TOAST_TYPES.SUCCESS);
    } catch (error) {
      result.innerHTML = `<li><b>!</b><span><strong>Send failed</strong><br><span class="muted">${escapeHtml(error?.message || "Unknown error")}</span></span></li>`;
      showToast(error?.message || "Send request failed.", TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
      button.textContent = "Prepare Send Request";
    }
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_SEND,
    pageTitle: "Send To User",
    pageDescription: "Prepare portal release, Didit KYC/sign request and notification",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  let agreements = [];
  try {
    const data = await listLegalData();
    agreements = data?.agreements || [];
  } catch {}
  renderPage(agreements);
}

init();
