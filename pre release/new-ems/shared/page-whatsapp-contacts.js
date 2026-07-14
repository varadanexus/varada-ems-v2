import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { deleteWhatsAppContact, listWhatsAppContacts, saveWhatsAppContact } from "./whatsapp-api.js";
import { showToast } from "./utils.js";

const state = { contacts: [], editingId: "" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function render() {
  renderModuleContent(`
    <style>
      .wa-contacts-layout{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(0,1.1fr);gap:1rem}
      .wa-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
      .wa-form input,.wa-form textarea{width:100%;border:1px solid rgba(225,189,104,.22);background:#080909;color:#f3efe6;border-radius:10px;padding:.7rem .8rem}
      .wa-form textarea{min-height:110px;resize:vertical}
      @media(max-width:1040px){.wa-contacts-layout,.wa-field-grid{grid-template-columns:1fr}}
    </style>
    <section class="card">
      <h3>WhatsApp Contacts</h3>
      <p class="muted">Maintain a reusable contact book for transporters, clients, vendors, legal recipients, and portal users.</p>
    </section>
    <section class="wa-contacts-layout" style="margin-top:1rem;">
      <article class="card wa-form">
        <h3>${state.editingId ? "Edit Contact" : "Add Contact"}</h3>
        <input id="waContactId" type="hidden" value="${escapeHtml(state.editingId)}" />
        <div class="wa-field-grid">
          <input id="waContactName" placeholder="Full name" value="${escapeHtml(state.contacts.find((row) => row.id === state.editingId)?.full_name || "")}" />
          <input id="waContactPhone" placeholder="Phone number" value="${escapeHtml(state.contacts.find((row) => row.id === state.editingId)?.phone || "")}" />
        </div>
        <div class="wa-field-grid" style="margin-top:.75rem;">
          <input id="waContactEmail" placeholder="Email address" value="${escapeHtml(state.contacts.find((row) => row.id === state.editingId)?.email || "")}" />
          <input id="waContactCompany" placeholder="Company name" value="${escapeHtml(state.contacts.find((row) => row.id === state.editingId)?.company_name || "")}" />
        </div>
        <div class="wa-field-grid" style="margin-top:.75rem;">
          <input id="waContactTag" placeholder="Tag, e.g. transporter, legal, vendor" value="${escapeHtml(state.contacts.find((row) => row.id === state.editingId)?.contact_tag || "")}" />
          <div></div>
        </div>
        <textarea id="waContactNotes" placeholder="Notes">${escapeHtml(state.contacts.find((row) => row.id === state.editingId)?.notes || "")}</textarea>
        <div style="margin-top:.75rem;">
          <button class="btn" id="waContactSaveBtn" type="button">${state.editingId ? "Update Contact" : "Save Contact"}</button>
          ${state.editingId ? `<button class="btn btn-ghost" id="waContactCancelBtn" type="button" style="margin-left:.5rem;">Cancel</button>` : ""}
        </div>
      </article>
      <article class="card">
        <h3>Contact Register</h3>
        <div class="table-shell">
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Company</th><th>Tag</th><th>Action</th></tr></thead>
            <tbody>
              ${state.contacts.map((row) => `
                <tr>
                  <td><strong>${escapeHtml(row.full_name)}</strong><br><span class="muted">${escapeHtml(row.email || "-")}</span></td>
                  <td>${escapeHtml(row.phone || "-")}</td>
                  <td>${escapeHtml(row.company_name || "-")}</td>
                  <td><span class="meta-pill">${escapeHtml(row.contact_tag || "-")}</span></td>
                  <td>
                    <button class="btn btn-sm" type="button" data-contact-edit="${escapeHtml(row.id)}">Edit</button>
                    <button class="btn btn-danger btn-sm" type="button" data-contact-delete="${escapeHtml(row.id)}">Delete</button>
                  </td>
                </tr>
              `).join("") || '<tr><td colspan="5">No contacts saved yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `);
  bind();
}

async function load() {
  const data = await listWhatsAppContacts();
  state.contacts = data.contacts || [];
  render();
}

function bind() {
  document.querySelector("#waContactSaveBtn")?.addEventListener("click", async () => {
    const button = document.querySelector("#waContactSaveBtn");
    button.disabled = true;
    button.textContent = "Saving...";
    try {
      await saveWhatsAppContact({
        id: document.querySelector("#waContactId")?.value?.trim() || "",
        fullName: document.querySelector("#waContactName")?.value?.trim() || "",
        phone: document.querySelector("#waContactPhone")?.value?.trim() || "",
        email: document.querySelector("#waContactEmail")?.value?.trim() || "",
        companyName: document.querySelector("#waContactCompany")?.value?.trim() || "",
        contactTag: document.querySelector("#waContactTag")?.value?.trim() || "",
        notes: document.querySelector("#waContactNotes")?.value?.trim() || ""
      });
      state.editingId = "";
      showToast("Contact saved.", TOAST_TYPES.SUCCESS);
      await load();
    } catch (error) {
      showToast(error.message || "Contact save failed.", TOAST_TYPES.ERROR);
    } finally {
      button.disabled = false;
      button.textContent = state.editingId ? "Update Contact" : "Save Contact";
    }
  });
  document.querySelector("#waContactCancelBtn")?.addEventListener("click", async () => {
    state.editingId = "";
    render();
  });
  document.querySelectorAll("[data-contact-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = button.getAttribute("data-contact-edit") || "";
      render();
    });
  });
  document.querySelectorAll("[data-contact-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this contact?")) return;
      try {
        await deleteWhatsAppContact(button.getAttribute("data-contact-delete"));
        if (state.editingId === button.getAttribute("data-contact-delete")) state.editingId = "";
        showToast("Contact deleted.", TOAST_TYPES.SUCCESS);
        await load();
      } catch (error) {
        showToast(error.message || "Contact delete failed.", TOAST_TYPES.ERROR);
      }
    });
  });
}

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.WHATSAPP_CONTACTS,
    pageTitle: "WhatsApp Contacts",
    pageDescription: "Maintain saved contact records for WhatsApp delivery workflows",
    workspace: WORKSPACES.WHATSAPP
  });
  if (!boot) return;
  await load();
}

init();
