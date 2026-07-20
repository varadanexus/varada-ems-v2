import { MODULES, ROUTES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { escapeHtml, statusPill } from "./legal-workflow-data.js";
import {
  countersignLegalAgreement,
  deleteLegalAgreement,
  downloadExecutedLegalPdf,
  downloadOfflineLegalDraftVersion,
  fetchLegalArchiveFile,
  getLegalAgreement,
  saveLegalDraft,
  uploadManualLegalSigningArtifact,
  uploadOfflineLegalDraftVersion
} from "./legal-api.js?v=legal-agreement-files-1";
import { showToast } from "./utils.js";
import { TOAST_TYPES } from "../config/constants.js";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function detail(label, value) {
  return `<div class="legal-detail-item"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  return value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(value / 1024))} KB`;
}

function artifactLabel(kind) {
  return ({ signed_pdf: "Signed Agreement PDF", acceptance_certificate_pdf: "Signing Certificate PDF", evidence_pdf: "Evidence PDF" })[kind] || kind || "Attachment";
}

async function downloadBlobResult(result, fallbackName) {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.fileName || fallbackName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshAgreementView(agreementId) {
  const refreshed = await getLegalAgreement(agreementId);
  renderAgreement(
    refreshed.agreement,
    refreshed.versions || [],
    refreshed.signatures || [],
    refreshed.documentVersions || [],
    refreshed.archiveFiles || []
  );
}

function signaturePanel(title, signature, role) {
  if (signature) {
    return `<section class="legal-signature-panel is-signed">
      <div class="legal-title-row"><h3>${escapeHtml(title)}</h3>${statusPill("signed")}</div>
      ${detail("Signed by", signature.signer_name)}
      ${detail("Designation", signature.signer_designation || (role === "external_party" ? "External party" : "-"))}
      ${detail("Method", signature.signing_method)}
      ${detail("Signed at", formatDate(signature.signed_at))}
      <p class="muted legal-hash">Signature hash: ${escapeHtml(signature.signature_sha256)}</p>
    </section>`;
  }
  return `<section class="legal-signature-panel">
    <div class="legal-title-row"><h3>${escapeHtml(title)}</h3>${statusPill("pending")}</div>
    <p class="muted">${role === "external_party"
      ? "Waiting for the recipient to complete Didit verification and sign through the secure link."
      : "Available after the external party has signed this agreement version."}</p>
  </section>`;
}

function renderAgreement(agreement, versions, signatures, documentVersions = [], archiveFiles = []) {
  const current = versions.find((version) => version.id === agreement.current_version_id) || versions[0] || {};
  const body = current.body_markdown || "No draft content was saved for this agreement.";
  const externalSignature = signatures.find((item) => item.signer_role === "external_party" && item.agreement_version_id === current.id);
  const companySignature = signatures.find((item) => item.signer_role === "company_authorised_signatory" && item.agreement_version_id === current.id);
  const hasAnySignature = signatures.length > 0 || Boolean(externalSignature) || Boolean(companySignature);
  const canEditDraft = !hasAnySignature && String(agreement.status || "draft").toLowerCase() !== "signed";
  renderModuleContent(`
    <div class="actions" style="margin-bottom:1rem;">
      <a class="btn btn-secondary" href="${ROUTES.LEGAL_AGREEMENTS}">Back to Agreements</a>
      <a class="btn" href="${ROUTES.LEGAL_SEND}?agreement=${encodeURIComponent(agreement.agreement_no)}">Send to User</a>
      <a class="btn btn-secondary" href="${ROUTES.LEGAL_SIGNING}?agreement=${encodeURIComponent(agreement.agreement_no)}">Evidence</a>
      ${canEditDraft ? '<button class="btn" id="editDraftBtn" type="button">Edit Draft</button>' : ""}
      <button class="btn btn-danger" id="deleteAgreementBtn" type="button">Delete Agreement</button>
      ${externalSignature && companySignature ? '<button class="btn" id="downloadExecutedPdfBtn" type="button">Download Executed PDF</button>' : ""}
    </div>
    <section class="card">
      <div class="legal-title-row">
        <div>
          <p class="muted">${escapeHtml(agreement.agreement_no)}</p>
          <h3>${escapeHtml(agreement.title || "Untitled Agreement")}</h3>
        </div>
        ${statusPill(agreement.status || "draft")}
      </div>
      <div class="legal-detail-grid">
        ${detail("Agreement type", agreement.agreement_type)}
        ${detail("Party type", agreement.party_type)}
        ${detail("Party", agreement.party_name)}
        ${detail("Signer", agreement.signer_name)}
        ${detail("Mobile", agreement.signer_mobile)}
        ${detail("Email", agreement.signer_email)}
        ${detail("Risk level", agreement.risk_level)}
        ${detail("Last updated", formatDate(agreement.updated_at))}
      </div>
    </section>
    <section class="card" id="draftCard" style="margin-top:1rem;">
      <div class="legal-title-row">
        <h3>Agreement Draft</h3>
        <span class="meta-pill">Version ${escapeHtml(current.version_no || 1)}</span>
      </div>
      <article class="legal-document">${escapeHtml(body)}</article>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h3>Execution Signatures</h3>
      <p class="muted">Both signatures apply to Version ${escapeHtml(current.version_no || 1)}. The agreement is fully executed only after both are recorded.</p>
      <div class="legal-signature-grid">
        ${signaturePanel("External Party", externalSignature, "external_party")}
        ${signaturePanel("Varada Nexus Private Limited", companySignature, "company_authorised_signatory")}
      </div>
      ${externalSignature && !companySignature ? `
        <form id="companyCountersignForm" class="legal-countersign-form">
          <h3>Company Countersignature</h3>
          <div class="legal-form-grid">
            <label>Authorised signatory name<input id="companySignerName" required /></label>
            <label>Designation<input id="companySignerDesignation" placeholder="Director / Authorised Signatory" required /></label>
          </div>
          <label class="legal-confirm"><input id="companyAuthorityConfirm" type="checkbox" required /> I confirm that I am authorised to sign this agreement for Varada Nexus Private Limited.</label>
          <button class="btn" id="companyCountersignBtn" type="submit">Countersign Agreement</button>
        </form>` : ""}
    </section>
    <section class="card" style="margin-top:1rem;">
      <div class="legal-title-row">
        <div><h3>Editable Word Document Versions</h3><p class="muted">Choose the revised DOCX from your computer. Every upload becomes the next version; previous files remain unchanged in Drive.</p></div>
        <span class="meta-pill">${documentVersions.length} DOCX version${documentVersions.length === 1 ? "" : "s"}</span>
      </div>
      <div class="actions" style="margin:.8rem 0;align-items:center;">
        <input id="agreementDocxVersionFile" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <button class="btn" id="uploadAgreementDocxVersionBtn" type="button">Upload Next DOCX Version</button>
      </div>
      <div class="table-shell">
        <table>
          <thead><tr><th>Version</th><th>File</th><th>Uploaded</th><th>Integrity</th><th>Action</th></tr></thead>
          <tbody>${documentVersions.map((item) => `<tr>
            <td><strong>Version ${escapeHtml(item.version_no)}</strong></td>
            <td>${escapeHtml(item.drive_file_name || "Legal draft.docx")}<br><span class="muted">${escapeHtml(formatFileSize(item.file_size))}</span></td>
            <td>${escapeHtml(formatDate(item.created_at))}</td>
            <td><span class="muted">${escapeHtml(item.file_sha256 ? item.file_sha256.slice(0, 16) + "…" : "Recorded in Drive")}</span></td>
            <td><button class="btn btn-sm btn-secondary" type="button" data-download-docx-version="${escapeHtml(item.id)}">Download</button></td>
          </tr>`).join("") || '<tr><td colspan="5">No DOCX is linked yet. Upload the current editable agreement to create Version 1.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <div class="legal-title-row">
        <div><h3>Post-Signing Documents</h3><p class="muted">Upload the final signed agreement, certificate, and evidence as separate PDFs after signing is complete.</p></div>
        <span class="meta-pill">Private Google Drive archive</span>
      </div>
      <div class="legal-form-grid" style="margin-top:.8rem;">
        <label>Document type<select id="manualArtifactKind"><option value="signed_pdf">Signed Agreement PDF</option><option value="acceptance_certificate_pdf">Signing Certificate PDF</option><option value="evidence_pdf">Evidence PDF</option></select></label>
        <label>PDF file<input id="manualArtifactFile" type="file" accept="application/pdf,.pdf" /></label>
      </div>
      <div class="actions" style="margin:.7rem 0 1rem;"><button class="btn" id="uploadManualArtifactBtn" type="button">Upload to Signed Archive</button></div>
      <div class="table-shell">
        <table>
          <thead><tr><th>Type</th><th>File</th><th>Archived</th><th>Action</th></tr></thead>
          <tbody>${archiveFiles.map((item) => `<tr>
            <td>${escapeHtml(artifactLabel(item.file_kind))}</td>
            <td>${escapeHtml(item.file_name || "Archive file")}</td>
            <td>${escapeHtml(formatDate(item.uploaded_at || item.created_at))}</td>
            <td>${item.drive_file_id ? `<button class="btn btn-sm btn-secondary" type="button" data-download-archive-file="${escapeHtml(item.drive_file_id)}" data-archive-file-name="${escapeHtml(item.file_name || "archive-file")}">Download</button>` : "-"}</td>
          </tr>`).join("") || '<tr><td colspan="4">No signed documents or evidence have been archived yet.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="card" style="margin-top:1rem;">
      <h3>Version History</h3>
      <div class="table-shell">
        <table>
          <thead><tr><th>Version</th><th>Source</th><th>Created</th><th>Content Hash</th></tr></thead>
          <tbody>${versions.map((version) => `<tr>
            <td><strong>Version ${escapeHtml(version.version_no)}</strong>${version.id === agreement.current_version_id ? '<br><span class="muted">Current</span>' : ""}</td>
            <td>${escapeHtml(version.draft_source || "-")}</td>
            <td>${escapeHtml(formatDate(version.created_at))}</td>
            <td><span class="muted">${escapeHtml(version.content_hash || "-")}</span></td>
          </tr>`).join("") || '<tr><td colspan="4">No versions recorded.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `);

  document.querySelectorAll("[data-download-docx-version]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await downloadBlobResult(await downloadOfflineLegalDraftVersion(button.dataset.downloadDocxVersion), "legal-draft.docx");
      } catch (error) {
        showToast(error?.message || "DOCX download failed.", TOAST_TYPES.ERROR);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelector("#uploadAgreementDocxVersionBtn")?.addEventListener("click", async () => {
    const input = document.querySelector("#agreementDocxVersionFile");
    const file = input?.files?.[0];
    if (!file) return showToast("Choose the revised DOCX first.", TOAST_TYPES.ERROR);
    if (!/\.docx$/i.test(file.name)) return showToast("Only modern Word .docx files are supported.", TOAST_TYPES.ERROR);
    if (file.size > 10 * 1024 * 1024) return showToast("The DOCX must be 10 MB or smaller.", TOAST_TYPES.ERROR);
    const button = document.querySelector("#uploadAgreementDocxVersionBtn");
    button.disabled = true;
    button.textContent = "Uploading Next Version...";
    try {
      const result = await uploadOfflineLegalDraftVersion({
        agreementId: agreement.id,
        seriesId: documentVersions[0]?.series_id || agreement.id,
        agreementNo: agreement.agreement_no,
        title: agreement.title,
        fileName: file.name,
        mimeType: file.type,
        base64: arrayBufferToBase64(await file.arrayBuffer())
      });
      showToast(`DOCX Version ${result.version.version_no} archived without changing the file.`, TOAST_TYPES.SUCCESS);
      await refreshAgreementView(agreement.id);
    } catch (error) {
      showToast(error?.message || "DOCX version upload failed.", TOAST_TYPES.ERROR);
      button.disabled = false;
      button.textContent = "Upload Next DOCX Version";
    }
  });

  document.querySelector("#uploadManualArtifactBtn")?.addEventListener("click", async () => {
    const input = document.querySelector("#manualArtifactFile");
    const file = input?.files?.[0];
    const fileKind = document.querySelector("#manualArtifactKind")?.value || "";
    if (!file) return showToast("Choose the PDF to archive.", TOAST_TYPES.ERROR);
    if (!/\.pdf$/i.test(file.name) || file.type && file.type !== "application/pdf") return showToast("Only PDF files are accepted here.", TOAST_TYPES.ERROR);
    if (file.size > 10 * 1024 * 1024) return showToast("The PDF must be 10 MB or smaller.", TOAST_TYPES.ERROR);
    const button = document.querySelector("#uploadManualArtifactBtn");
    button.disabled = true;
    button.textContent = "Archiving PDF...";
    try {
      const result = await uploadManualLegalSigningArtifact({
        agreementId: agreement.id,
        fileKind,
        fileName: file.name,
        base64: arrayBufferToBase64(await file.arrayBuffer())
      });
      showToast(`${artifactLabel(fileKind)} archived in the ${result.driveFolder} folder.`, TOAST_TYPES.SUCCESS);
      await refreshAgreementView(agreement.id);
    } catch (error) {
      showToast(error?.message || "PDF archive upload failed.", TOAST_TYPES.ERROR);
      button.disabled = false;
      button.textContent = "Upload to Signed Archive";
    }
  });

  document.querySelectorAll("[data-download-archive-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await fetchLegalArchiveFile(button.dataset.downloadArchiveFile);
        await downloadBlobResult(result, button.dataset.archiveFileName || "archive-file");
      } catch (error) {
        showToast(error?.message || "Archive download failed.", TOAST_TYPES.ERROR);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelector("#companyCountersignForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#companyCountersignBtn");
    button.disabled = true;
    button.textContent = "Signing...";
    try {
      const result = await countersignLegalAgreement({
        agreementId: agreement.id,
        signerName: document.querySelector("#companySignerName").value.trim(),
        designation: document.querySelector("#companySignerDesignation").value.trim(),
        confirmAuthority: document.querySelector("#companyAuthorityConfirm").checked
      });
      showToast(
        result.archive
          ? `Countersigned and archived to ${result.archive.drivePath}.`
          : `Countersigned, but Drive archive failed: ${result.archiveError || "Unknown error"}`,
        result.archive ? TOAST_TYPES.SUCCESS : TOAST_TYPES.ERROR
      );
      await refreshAgreementView(agreement.id);
    } catch (error) {
      showToast(error.message, TOAST_TYPES.ERROR);
      button.disabled = false;
      button.textContent = "Countersign Agreement";
    }
  });

  document.querySelector("#downloadExecutedPdfBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#downloadExecutedPdfBtn");
    button.disabled = true;
    button.textContent = "Preparing PDF...";
    try {
      const result = await downloadExecutedLegalPdf(agreement.id);
      const binary = atob(result.pdfBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mimeType || "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName || `${agreement.agreement_no}-executed.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Executed PDF archived to ${result.drivePath}.`, TOAST_TYPES.SUCCESS);
    } catch (error) {
      showToast(error.message, TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
      button.textContent = "Download Executed PDF";
    }
  });

  document.querySelector("#editDraftBtn")?.addEventListener("click", () => {
    const card = document.querySelector("#draftCard");
    if (!card) return;
    const nextVersionNo = Number(current.version_no || 1) + 1;
    card.innerHTML = `
      <div class="legal-title-row">
        <h3>Edit Draft</h3>
        <span class="meta-pill">Saves as Version ${nextVersionNo}</span>
      </div>
      <p class="muted" style="margin:.25rem 0 .75rem;">Editing creates a new version; the previous version stays in the history.</p>
      <textarea id="draftEditor" class="legal-document" style="width:100%;min-height:460px;font-family:inherit;font-size:.95rem;line-height:1.5;white-space:pre-wrap;resize:vertical;">${escapeHtml(body)}</textarea>
      <div class="actions" style="margin-top:.75rem;">
        <button class="btn" id="saveDraftEditBtn" type="button">Save as New Version</button>
        <button class="btn btn-secondary" id="cancelDraftEditBtn" type="button">Cancel</button>
      </div>`;
    document.querySelector("#cancelDraftEditBtn")?.addEventListener("click", () => renderAgreement(agreement, versions, signatures, documentVersions, archiveFiles));
    document.querySelector("#saveDraftEditBtn")?.addEventListener("click", async () => {
      const text = document.querySelector("#draftEditor")?.value?.trim() || "";
      if (!text) {
        showToast("Draft cannot be empty.", TOAST_TYPES.ERROR);
        return;
      }
      const button = document.querySelector("#saveDraftEditBtn");
      button.disabled = true;
      button.textContent = "Saving...";
      try {
        await saveLegalDraft({
          agreementNo: agreement.agreement_no,
          title: agreement.title,
          agreementTitle: agreement.title,
          agreementType: agreement.agreement_type,
          partyType: agreement.party_type,
          partyName: agreement.party_name,
          counterpartyName: agreement.party_name,
          signerName: agreement.signer_name,
          signerMobile: agreement.signer_mobile,
          signerEmail: agreement.signer_email,
          riskLevel: agreement.risk_level,
          draftText: text,
          draftSource: "manual"
        });
        showToast("Draft saved as a new version.", TOAST_TYPES.SUCCESS);
        await refreshAgreementView(agreement.id);
      } catch (error) {
        showToast(error?.message || "Draft save failed.", TOAST_TYPES.ERROR);
        button.disabled = false;
        button.textContent = "Save as New Version";
      }
    });
  });

  document.querySelector("#deleteAgreementBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#deleteAgreementBtn");
    const confirmed = window.confirm(`Delete ${agreement.agreement_no} from both EMS and Google Drive? This cannot be undone.`);
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = "Deleting...";
    try {
      const result = await deleteLegalAgreement(agreement.id);
      showToast(
        `Deleted ${agreement.agreement_no}. Removed ${result.deletedDriveFileCount || 0} Drive file(s).`,
        TOAST_TYPES.SUCCESS
      );
      location.href = ROUTES.LEGAL_AGREEMENTS;
    } catch (error) {
      button.disabled = false;
      button.textContent = "Delete Agreement";
      showToast(error.message || "Agreement delete failed.", TOAST_TYPES.ERROR);
    }
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.LEGAL_AGREEMENTS,
    pageTitle: "Agreement Details",
    pageDescription: "Review the saved agreement and its version history",
    workspace: WORKSPACES.LEGAL
  });
  if (!boot) return;

  const agreementId = new URLSearchParams(location.search).get("id");
  if (!agreementId) {
    renderModuleContent('<section class="card"><h3>Agreement not found</h3><p class="muted">No agreement was selected.</p></section>');
    return;
  }

  renderModuleContent('<section class="card"><h3>Loading agreement...</h3></section>');
  try {
    const data = await getLegalAgreement(agreementId);
    renderAgreement(data.agreement, data.versions || [], data.signatures || [], data.documentVersions || [], data.archiveFiles || []);
  } catch (error) {
    renderModuleContent(`<section class="card"><h3>Unable to open agreement</h3><p class="muted">${escapeHtml(error.message)}</p><a class="btn" href="${ROUTES.LEGAL_AGREEMENTS}">Back to Agreements</a></section>`);
  }
}

init();
