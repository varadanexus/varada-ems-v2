import { acceptAdvocateTerms, getAdvocateTermsStatus } from "./legal-advocate-api.js";
import { advocatePortalLogout } from "./legal-advocate-portal-auth.js";

const DEVICE_KEY = "ems_advocate_terms_device_v1";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = `ems-advocate-device-v1:${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function normalized(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function advocatePracticeLabel(profile) {
  const firm = String(profile?.firm || "").trim();
  return firm && firm.toLowerCase() !== "internal" ? firm : "Advocate";
}

function renderGate(status) {
  const profile = status.profile || {};
  const sections = Array.isArray(status.sections) ? status.sections : [];
  const app = document.getElementById("app");
  app.classList.remove("page-enter-active");
  app.style.animation = "none";
  app.style.transition = "none";
  app.style.opacity = "1";
  app.style.transform = "none";
  app.innerHTML = `
    <main class="adv-terms-shell" role="dialog" aria-modal="true" aria-labelledby="advTermsTitle">
      <section class="adv-terms-card">
        <header class="adv-terms-heading">
          <div class="adv-terms-title-row">
            <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" />
            <div><span>VARADA NEXUS · ADVOCATE PORTAL</span><h1 id="advTermsTitle">${esc(status.title)}</h1><p>Version ${esc(status.version)} · Effective ${esc(new Date(status.effective_at).toLocaleDateString("en-IN", { dateStyle: "long" }))} · Read the complete undertaking to continue.</p></div>
          </div>
          <button class="adv-terms-decline" id="advTermsDecline" type="button">Decline and Logout</button>
          <div class="adv-terms-party"><span>ACCESS ASSIGNED TO</span><strong>${esc(profile.name)}</strong><p>${esc(advocatePracticeLabel(profile))} · ${esc(profile.email || "No email recorded")}${profile.bar_council_number ? ` · Enrolment ${esc(profile.bar_council_number)}` : ""}</p></div>
        </header>
        <div class="adv-terms-document" id="advTermsDocument" tabindex="0" aria-label="Advocate undertaking; scroll to the end">
          <div class="adv-terms-warning"><strong>Mandatory advocate undertaking</strong><span>This is separate from the regular EMS terms. Legal documents remain locked until this version is accepted.</span></div>
          ${sections.map((section) => `<article><h2>${esc(section.heading)}</h2><p>${esc(section.body)}</p></article>`).join("")}
          <div class="adv-terms-end" id="advTermsEnd">END OF UNDERTAKING · REVIEW THE DECLARATIONS BELOW</div>
        </div>
        <form class="adv-terms-accept" id="advTermsForm">
          <div class="adv-terms-lock" id="advTermsLock">Scroll through the complete undertaking to unlock acceptance.</div>
          <label class="adv-terms-check"><input name="identityConfirmed" type="checkbox" disabled><span>I confirm I am the named advocate or expressly authorised legal professional, and these credentials are used only by me.</span></label>
          <label class="adv-terms-check"><input name="confidentialityConfirmed" type="checkbox" disabled><span>I accept the strict confidentiality, privilege, document-control, security, incident-reporting and audit obligations above.</span></label>
          <label class="adv-terms-check"><input name="professionalDutiesConfirmed" type="checkbox" disabled><span>I will comply with applicable law and Bar Council duties, conduct conflict checks and preserve independent professional judgment.</span></label>
          <div class="adv-terms-fields"><label>Type full name exactly as shown<input name="confirmationName" autocomplete="off" placeholder="${esc(profile.name)}" disabled required></label><label>Advocate enrolment / Bar Council number<input name="barCouncilNumber" autocomplete="off" placeholder="Enter current enrolment number" disabled required></label></div>
          <label class="adv-terms-final"><input name="finalAcceptance" type="checkbox" disabled><span>${esc(status.acceptance_label)}</span></label>
          <div class="adv-terms-actions"><p>Your acceptance records the current terms, timestamp, account, session, browser identifier and server-observed network information.</p><button id="advTermsAccept" type="submit" disabled>Accept and Continue</button></div>
          <p class="adv-terms-error" id="advTermsError" role="alert"></p>
        </form>
      </section>
    </main>`;
}

export async function ensureAdvocateTermsAccepted(sessionToken) {
  const status = await getAdvocateTermsStatus(sessionToken);
  if (status.accepted) return true;
  renderGate(status);

  const documentPane = document.getElementById("advTermsDocument");
  const form = document.getElementById("advTermsForm");
  const fields = [...form.querySelectorAll("input")];
  const submit = document.getElementById("advTermsAccept");
  const errorBox = document.getElementById("advTermsError");
  let readToEnd = false;

  const validate = () => {
    if (!readToEnd) return false;
    const values = new FormData(form);
    const nameMatches = normalized(values.get("confirmationName")) === normalized(status.profile?.name);
    const enrolment = String(values.get("barCouncilNumber") || "").trim();
    const stored = String(status.profile?.bar_council_number || "").replace(/\s+/g, "").toUpperCase();
    const enrolmentMatches = enrolment.length >= 4 && (!stored || enrolment.replace(/\s+/g, "").toUpperCase() === stored);
    submit.disabled = !(nameMatches && enrolmentMatches && values.get("identityConfirmed") && values.get("confidentialityConfirmed") && values.get("professionalDutiesConfirmed") && values.get("finalAcceptance"));
    return !submit.disabled;
  };

  const unlock = () => {
    if (readToEnd || documentPane.scrollTop + documentPane.clientHeight < documentPane.scrollHeight - 12) return;
    readToEnd = true;
    fields.forEach((field) => { field.disabled = false; });
    document.getElementById("advTermsLock").textContent = "Complete every declaration and identity field to continue.";
    document.getElementById("advTermsLock").classList.add("unlocked");
    validate();
  };
  documentPane.addEventListener("scroll", unlock, { passive: true });
  window.setTimeout(unlock, 0);
  form.addEventListener("input", validate);
  document.getElementById("advTermsDecline").addEventListener("click", advocatePortalLogout);

  return new Promise((resolve) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validate()) return;
      const values = Object.fromEntries(new FormData(form));
      submit.disabled = true;
      submit.textContent = "Recording secure acceptance…";
      errorBox.textContent = "";
      try {
        await acceptAdvocateTerms(sessionToken, {
          version: status.version,
          confirmationName: values.confirmationName,
          barCouncilNumber: values.barCouncilNumber,
          identityConfirmed: Boolean(values.identityConfirmed),
          confidentialityConfirmed: Boolean(values.confidentialityConfirmed),
          professionalDutiesConfirmed: Boolean(values.professionalDutiesConfirmed),
          deviceId: deviceId()
        });
        resolve(true);
      } catch (error) {
        errorBox.textContent = error.message || "The undertaking could not be accepted.";
        submit.textContent = "Accept and Continue";
        validate();
      }
    });
  });
}
