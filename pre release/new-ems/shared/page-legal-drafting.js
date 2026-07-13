import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { generateLegalDraft, reviseLegalDraft, saveLegalDraft } from "./legal-api.js";
import { showToast } from "./utils.js";

function buildGeminiPrompt() {
  const value = (key) => document.querySelector(`[data-draft="${key}"]`)?.value || "";
  const checked = (key) => document.querySelector(`[data-draft="${key}"]`)?.checked ? "Yes" : "No";
  return [
    "Act as a legal drafting assistant for an Indian business agreement.",
    "Prepare a structured, high-quality draft for advocate review. Do not state this is final legal advice.",
    `Agreement type: ${value("type") || "Service Agreement"}`,
    `Internal agreement number/reference: ${value("agreementNo") || "To be generated"}`,
    `Jurisdiction: ${value("jurisdiction") || "Rajamahendravaram, Andhra Pradesh, India"}`,
    `Governing law: ${value("governingLaw") || "Indian law"}`,
    "",
    "DRAFTING PURPOSE",
    `Purpose of agreement: ${value("purpose") || "To be filled"}`,
    `Business background/context: ${value("background") || "To be filled"}`,
    `Risk level: ${value("riskLevel") || "Medium"}`,
    "",
    "COMPANY / FIRST PARTY",
    `Company name: ${value("companyName") || "Varada Nexus Private Limited"}`,
    `Company type/registration: ${value("companyRegistration") || "Private Limited Company"}`,
    `Registered office: ${value("companyAddress") || "Rajamahendravaram, Andhra Pradesh, India"}`,
    `GST/PAN/CIN: ${value("companyTax") || "To be filled"}`,
    `Authorized signatory: ${value("companySigner") || "To be filled"}`,
    `Signatory designation: ${value("companySignerRole") || "To be filled"}`,
    `Company email/mobile: ${value("companyContact") || "To be filled"}`,
    "",
    "COUNTERPARTY / SECOND PARTY",
    `Counterparty name: ${value("counterpartyName") || "To be filled"}`,
    `Counterparty type: ${value("counterpartyType") || "Client"}`,
    `Counterparty address: ${value("counterpartyAddress") || "To be filled"}`,
    `Counterparty GST/PAN/CIN: ${value("counterpartyTax") || "To be filled"}`,
    `Counterparty authorized signer: ${value("counterpartySigner") || "To be filled"}`,
    `Counterparty signer designation: ${value("counterpartySignerRole") || "To be filled"}`,
    `Counterparty email/mobile: ${value("counterpartyContact") || "To be filled"}`,
    "",
    "SCOPE AND DELIVERABLES",
    `Scope of work/services/terms: ${value("scope") || "To be filled"}`,
    `Deliverables / obligations of Varada Nexus: ${value("companyObligations") || "To be filled"}`,
    `Deliverables / obligations of counterparty: ${value("counterpartyObligations") || "To be filled"}`,
    `Exclusions / not included: ${value("exclusions") || "To be filled"}`,
    `Dependencies / client inputs required: ${value("dependencies") || "To be filled"}`,
    "",
    "COMMERCIAL TERMS",
    `Agreement value / fees: ${value("amount") || "To be filled"}`,
    `Taxes: ${value("taxes") || "As applicable under law"}`,
    `Payment schedule: ${value("paymentSchedule") || "To be filled"}`,
    `Due date / credit period: ${value("creditPeriod") || "To be filled"}`,
    `Late payment interest / penalties: ${value("latePenalty") || "To be filled"}`,
    `Security deposit / advance / retention: ${value("securityDeposit") || "Not applicable unless stated"}`,
    "",
    "TERM, TERMINATION AND BREACH",
    `Effective date: ${value("effectiveDate") || "Date of acceptance/signing"}`,
    `Agreement duration: ${value("duration") || "To be filled"}`,
    `Renewal terms: ${value("renewal") || "To be filled"}`,
    `Termination notice period: ${value("terminationNotice") || "To be filled"}`,
    `Breach consequences: ${value("breach") || "To be filled"}`,
    "",
    "CONFIDENTIALITY, DATA AND IP",
    `Confidentiality requirements: ${value("confidentiality") || "Standard mutual confidentiality"}`,
    `Data/privacy requirements: ${value("dataPrivacy") || "To be filled"}`,
    `Intellectual property ownership: ${value("ipOwnership") || "To be filled"}`,
    `Non-solicit / non-compete requirements: ${value("nonSolicit") || "Not applicable unless stated"}`,
    "",
    "E-SIGNING AND LEGAL EVIDENCE",
    `Allow electronic acceptance: ${checked("electronicAcceptance")}`,
    `Require Didit KYC/digital signing: ${checked("diditRequired")}`,
    `Require live photo evidence: ${checked("livePhotoRequired")}`,
    `Require GPS/location evidence: ${checked("gpsRequired")}`,
    `Require IP/device evidence: ${checked("ipDeviceRequired")}`,
    `Block VPN/proxy/Tor if configured: ${checked("vpnBlockRequired")}`,
    `Archive evidence to Google Drive: ${checked("driveArchiveRequired")}`,
    `WhatsApp signing link notification: ${checked("whatsappRequired")}`,
    "",
    "DISPUTE AND COURT DETAILS",
    `Dispute resolution method: ${value("disputeMethod") || "Courts / arbitration to be selected"}`,
    `Court jurisdiction / venue: ${value("courtVenue") || "Rajamahendravaram, Andhra Pradesh, India"}`,
    `Arbitration details if any: ${value("arbitration") || "Not applicable unless stated"}`,
    "",
    "SPECIAL CLAUSES",
    `Special clauses requested: ${value("specialClauses") || "None"}`,
    `Clauses to avoid/exclude: ${value("avoidClauses") || "None"}`,
    `Known negotiation points: ${value("negotiationPoints") || "None"}`,
    "",
    "Draft requirements:",
    "Use clear headings, numbered clauses, definitions where useful, signature/acceptance block, electronic evidence clause, privacy consent, and advocate risk checklist.",
    "End with a risk checklist for the advocate."
  ].join("\n\n");
}

function extractEmail(value = "") {
  return String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function extractMobile(value = "") {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return "";
}

async function generateDraft() {
  const output = document.querySelector("#draftOutput");
  const promptOutput = document.querySelector("#promptOutput");
  const prompt = buildGeminiPrompt();
  promptOutput.value = prompt;
  output.value = "Preparing draft request...";
  try {
    const data = await generateLegalDraft({ prompt, source: "legal-drafting" });
    output.value = data?.draft || prompt;
    showToast("Draft generated for review.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    output.value = "";
    showToast(error?.message || "Gemini not configured. Prompt prepared separately.", TOAST_TYPES.WARNING);
  }
}

function draftSavePayload() {
  const value = (key) => document.querySelector(`[data-draft="${key}"]`)?.value || "";
  const draftText = document.querySelector("#draftOutput")?.value?.trim() || "";
  const counterpartyContact = value("counterpartyContact");
  return {
    agreementNo: value("agreementNo"),
    title: value("purpose") || value("type") || "Legal Draft",
    agreementTitle: value("purpose") || value("type") || "Legal Draft",
    agreementType: value("type"),
    partyType: value("counterpartyType"),
    partyName: value("counterpartyName"),
    counterpartyName: value("counterpartyName"),
    signerName: value("counterpartySigner"),
    signerMobile: extractMobile(counterpartyContact),
    signerEmail: extractEmail(counterpartyContact),
    riskLevel: value("riskLevel"),
    draftText,
    draftSource: "gemini_ai"
  };
}

async function saveDraft() {
  const button = document.querySelector("#saveDraftBtn");
  const output = document.querySelector("#draftOutput");
  const draftText = output?.value?.trim() || "";
  if (!draftText) {
    showToast("Generate or type a draft before saving.", TOAST_TYPES.ERROR);
    return;
  }
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const result = await saveLegalDraft(draftSavePayload());
    showToast(`Draft saved as ${result.agreement?.agreement_no || "agreement"}.`, TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Draft save failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = "Save Draft";
  }
}

async function reviseDraft() {
  const button = document.querySelector("#reviseDraftBtn");
  const instruction = document.querySelector("#revisionPrompt")?.value?.trim() || "";
  const output = document.querySelector("#draftOutput");
  const draftText = output?.value?.trim() || "";
  if (!draftText) {
    showToast("Generate or paste a draft before asking AI to revise.", TOAST_TYPES.ERROR);
    return;
  }
  if (!instruction) {
    showToast("Enter the change you want AI to make.", TOAST_TYPES.ERROR);
    return;
  }
  button.disabled = true;
  button.textContent = "Revising...";
  try {
    const data = await reviseLegalDraft({ draftText, instruction, source: "legal-drafting-revision" });
    output.value = data?.draft || draftText;
    showToast("Draft revised.", TOAST_TYPES.SUCCESS);
  } catch (error) {
    showToast(error?.message || "Draft revision failed.", TOAST_TYPES.ERROR);
  } finally {
    button.disabled = false;
    button.textContent = "Apply AI Changes";
  }
}

function renderPage() {
  renderModuleContent(`
    <style>
      .legal-draft-layout{display:grid;grid-template-columns:minmax(360px,1.05fr) minmax(0,.95fr);gap:1rem;align-items:start}
      .legal-draft-form{display:grid;gap:.85rem}
      .draft-section{border:1px solid rgba(230,200,126,.15);border-radius:14px;background:linear-gradient(145deg,rgba(230,200,126,.035),#07080d 65%);padding:.85rem;display:grid;gap:.7rem}
      .draft-section h4{margin:0;color:#f7f4ec}
      .draft-section p{margin:0}
      .draft-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
      .draft-grid .full{grid-column:1/-1}
      .draft-field{display:grid;gap:.28rem}
      .draft-field label{font-weight:800;color:#c9c5b8;font-size:.84rem}
      .draft-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}
      .draft-checks label{display:grid;grid-template-columns:20px minmax(0,1fr);gap:.45rem;align-items:start;color:#c9c5b8;font-weight:700}
      .legal-draft-form input,.legal-draft-form select,.legal-draft-form textarea,.legal-output{width:100%;min-width:0}
      .legal-output{min-height:520px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
      .prompt-output{min-height:180px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem}
      .revision-box{display:grid;gap:.6rem;margin-top:1rem}
      .legal-checklist{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}
      .legal-checklist li{border:1px solid rgba(230,200,126,.14);border-radius:12px;padding:.65rem;background:#07080d;color:#c9c5b8}
      @media (max-width: 980px){.legal-draft-layout,.draft-grid,.draft-checks{grid-template-columns:1fr}}
    </style>
    <div class="legal-draft-layout">
      <section class="card">
        <h3>Legal Drafting Intake</h3>
        <p class="muted">Answer the questions below. Gemini will prepare a structured draft for advocate review.</p>
        <div class="legal-draft-form">
          <section class="draft-section">
            <h4>1. Agreement Basics</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>What type of agreement is this?</label><select data-draft="type"><option>Service Agreement</option><option>Terms and Conditions</option><option>Vendor Agreement</option><option>Customer Agreement</option><option>NDA</option><option>Payment Undertaking</option><option>Settlement Agreement</option><option>Employment / Consultant Agreement</option><option>Custom Agreement</option></select></div>
              <div class="draft-field"><label>Internal agreement number/reference</label><input data-draft="agreementNo" placeholder="AGR-2026-0001" /></div>
              <div class="draft-field"><label>Jurisdiction</label><input data-draft="jurisdiction" value="Rajamahendravaram, Andhra Pradesh, India" /></div>
              <div class="draft-field"><label>Governing law</label><input data-draft="governingLaw" value="Indian law" /></div>
              <div class="draft-field"><label>Risk level</label><select data-draft="riskLevel"><option>Medium</option><option>Low</option><option>High</option><option>Critical</option></select></div>
              <div class="draft-field full"><label>Why is this agreement being created?</label><textarea data-draft="purpose" rows="3" placeholder="Explain the business purpose of this agreement"></textarea></div>
              <div class="draft-field full"><label>What is the background/context?</label><textarea data-draft="background" rows="3" placeholder="Any previous discussion, project, transaction, or relationship context"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>2. Varada Nexus / First Party Details</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Company name</label><input data-draft="companyName" value="Varada Nexus Private Limited" /></div>
              <div class="draft-field"><label>Registration/type</label><input data-draft="companyRegistration" value="Private Limited Company" /></div>
              <div class="draft-field full"><label>Registered office/address</label><textarea data-draft="companyAddress" rows="2">Rajamahendravaram, Andhra Pradesh, India</textarea></div>
              <div class="draft-field"><label>GST/PAN/CIN</label><input data-draft="companyTax" placeholder="GSTIN / PAN / CIN" /></div>
              <div class="draft-field"><label>Authorized signatory</label><input data-draft="companySigner" placeholder="Name of authorized person" /></div>
              <div class="draft-field"><label>Signatory designation</label><input data-draft="companySignerRole" placeholder="Director / Admin / Manager" /></div>
              <div class="draft-field"><label>Email / mobile</label><input data-draft="companyContact" placeholder="email and mobile" /></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>3. Counterparty Details</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Counterparty/client/vendor name</label><input data-draft="counterpartyName" placeholder="Legal name" /></div>
              <div class="draft-field"><label>Counterparty type</label><select data-draft="counterpartyType"><option>Client</option><option>Vendor</option><option>Employee</option><option>Consultant</option><option>Transporter</option><option>Agent</option><option>Other</option></select></div>
              <div class="draft-field full"><label>Address</label><textarea data-draft="counterpartyAddress" rows="2" placeholder="Full registered/business address"></textarea></div>
              <div class="draft-field"><label>GST/PAN/CIN</label><input data-draft="counterpartyTax" placeholder="GSTIN / PAN / CIN" /></div>
              <div class="draft-field"><label>Authorized signer name</label><input data-draft="counterpartySigner" placeholder="Person who will sign/accept" /></div>
              <div class="draft-field"><label>Signer designation/authority</label><input data-draft="counterpartySignerRole" placeholder="Director / Proprietor / Authorized Partner" /></div>
              <div class="draft-field"><label>Email / mobile</label><input data-draft="counterpartyContact" placeholder="email and WhatsApp mobile" /></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>4. Scope, Deliverables And Obligations</h4>
            <div class="draft-grid">
              <div class="draft-field full"><label>What exactly will be provided/performed?</label><textarea data-draft="scope" rows="4" placeholder="Scope of services, goods, portal access, transport work, consulting, etc."></textarea></div>
              <div class="draft-field full"><label>What are Varada Nexus obligations?</label><textarea data-draft="companyObligations" rows="3" placeholder="Responsibilities, service levels, documents, support, delivery"></textarea></div>
              <div class="draft-field full"><label>What are the counterparty obligations?</label><textarea data-draft="counterpartyObligations" rows="3" placeholder="Payment, cooperation, documents, compliance, approvals"></textarea></div>
              <div class="draft-field"><label>What is excluded?</label><textarea data-draft="exclusions" rows="3" placeholder="Items/services not included"></textarea></div>
              <div class="draft-field"><label>Dependencies/client inputs required</label><textarea data-draft="dependencies" rows="3" placeholder="Documents, approvals, access, information"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>5. Commercial Terms</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Agreement value / fee</label><input data-draft="amount" placeholder="INR amount or pricing method" /></div>
              <div class="draft-field"><label>Taxes</label><input data-draft="taxes" value="Applicable GST/taxes extra as per law" /></div>
              <div class="draft-field full"><label>Payment schedule</label><textarea data-draft="paymentSchedule" rows="3" placeholder="Advance, milestone, monthly, invoice due date, retention"></textarea></div>
              <div class="draft-field"><label>Credit period / due date</label><input data-draft="creditPeriod" placeholder="7 days / 15 days / immediate" /></div>
              <div class="draft-field"><label>Late payment penalty</label><input data-draft="latePenalty" placeholder="Interest %, suspension, recovery charges" /></div>
              <div class="draft-field full"><label>Security deposit / advance / retention</label><input data-draft="securityDeposit" placeholder="If any" /></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>6. Term, Termination And Breach</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Effective date</label><input data-draft="effectiveDate" placeholder="Date of signing / specific date" /></div>
              <div class="draft-field"><label>Duration</label><input data-draft="duration" placeholder="One year / project duration / until completion" /></div>
              <div class="draft-field"><label>Renewal terms</label><input data-draft="renewal" placeholder="Auto-renewal / written renewal / no renewal" /></div>
              <div class="draft-field"><label>Termination notice period</label><input data-draft="terminationNotice" placeholder="15 days / 30 days / immediate for breach" /></div>
              <div class="draft-field full"><label>What happens on breach/default?</label><textarea data-draft="breach" rows="3" placeholder="Suspension, damages, termination, recovery, indemnity"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>7. Confidentiality, Data And IP</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Confidentiality expectations</label><textarea data-draft="confidentiality" rows="3" placeholder="Mutual confidentiality, client data, pricing, documents"></textarea></div>
              <div class="draft-field"><label>Data/privacy requirements</label><textarea data-draft="dataPrivacy" rows="3" placeholder="Portal data, documents, personal data, retention"></textarea></div>
              <div class="draft-field"><label>Intellectual property ownership</label><textarea data-draft="ipOwnership" rows="3" placeholder="Who owns drafts, software, reports, designs, data"></textarea></div>
              <div class="draft-field"><label>Non-solicit / non-compete</label><textarea data-draft="nonSolicit" rows="3" placeholder="If needed"></textarea></div>
            </div>
          </section>

          <section class="draft-section">
            <h4>8. E-Sign, KYC And Evidence Requirements</h4>
            <div class="draft-checks">
              <label><input data-draft="electronicAcceptance" type="checkbox" checked />Allow electronic acceptance</label>
              <label><input data-draft="diditRequired" type="checkbox" checked />Require Didit KYC/digital signing</label>
              <label><input data-draft="livePhotoRequired" type="checkbox" checked />Require live photo evidence</label>
              <label><input data-draft="gpsRequired" type="checkbox" checked />Require GPS/location evidence</label>
              <label><input data-draft="ipDeviceRequired" type="checkbox" checked />Capture IP/device evidence</label>
              <label><input data-draft="vpnBlockRequired" type="checkbox" checked />Block VPN/proxy/Tor if configured</label>
              <label><input data-draft="driveArchiveRequired" type="checkbox" checked />Archive evidence to Google Drive</label>
              <label><input data-draft="whatsappRequired" type="checkbox" checked />Send signing link by WhatsApp</label>
            </div>
          </section>

          <section class="draft-section">
            <h4>9. Dispute, Court And Special Clauses</h4>
            <div class="draft-grid">
              <div class="draft-field"><label>Dispute method</label><select data-draft="disputeMethod"><option>Courts</option><option>Arbitration</option><option>Mediation then Courts</option><option>Mediation then Arbitration</option></select></div>
              <div class="draft-field"><label>Court venue</label><input data-draft="courtVenue" value="Rajamahendravaram, Andhra Pradesh, India" /></div>
              <div class="draft-field full"><label>Arbitration details if applicable</label><textarea data-draft="arbitration" rows="2" placeholder="Seat, language, arbitrator count"></textarea></div>
              <div class="draft-field full"><label>Any special clauses you want included?</label><textarea data-draft="specialClauses" rows="3" placeholder="Custom clauses, operational terms, special protections"></textarea></div>
              <div class="draft-field"><label>Clauses to avoid/exclude</label><textarea data-draft="avoidClauses" rows="3" placeholder="Anything you do not want in the agreement"></textarea></div>
              <div class="draft-field"><label>Known negotiation/dispute points</label><textarea data-draft="negotiationPoints" rows="3" placeholder="Any points likely to be negotiated"></textarea></div>
            </div>
          </section>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;">
          <button class="btn" id="generateDraftBtn" type="button">Generate AI Draft</button>
          <button class="btn btn-ghost" id="saveDraftBtn" type="button">Save Draft</button>
          <button class="btn btn-ghost" id="copyDraftBtn" type="button">Copy Draft</button>
        </div>
      </section>
      <section class="card">
        <h3>Draft Editor</h3>
        <p class="muted">Only the generated or edited draft appears here. The AI prompt is kept separately below.</p>
        <textarea id="draftOutput" class="legal-output" placeholder="Generated draft will appear here. You can edit it before saving."></textarea>
        <div class="revision-box">
          <h3>Ask AI To Make Changes</h3>
          <textarea id="revisionPrompt" rows="4" placeholder="Example: Add stronger payment default clause, reduce liability exposure, and simplify the evidence consent clause."></textarea>
          <button class="btn" id="reviseDraftBtn" type="button">Apply AI Changes</button>
        </div>
        <div class="revision-box">
          <h3>Prompt Preview</h3>
          <textarea id="promptOutput" class="prompt-output" placeholder="The structured prompt sent to Gemini appears here. It is separate from the draft editor."></textarea>
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:1rem;">
      <h3>Before Sending</h3>
      <ul class="legal-checklist">
        <li>Verify party identity, authority, address, GST/PAN and mobile/email.</li>
        <li>Freeze the version before sending. Any change after acceptance must become a new version or amendment.</li>
        <li>Confirm whether Didit KYC/signing is mandatory for the agreement value and risk level.</li>
      </ul>
    </section>
  `);
  document.querySelector("#generateDraftBtn")?.addEventListener("click", generateDraft);
  document.querySelector("#saveDraftBtn")?.addEventListener("click", saveDraft);
  document.querySelector("#reviseDraftBtn")?.addEventListener("click", reviseDraft);
  document.querySelector("#copyDraftBtn")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(document.querySelector("#draftOutput")?.value || "").catch(() => {});
    showToast("Draft copied.", TOAST_TYPES.SUCCESS);
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_DRAFTING,
    pageTitle: "Legal Drafting",
    pageDescription: "Draft agreements and prepare Gemini-assisted clauses",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;
  renderPage();
}

init();
