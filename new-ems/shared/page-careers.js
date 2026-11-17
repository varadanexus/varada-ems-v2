import { MODULES, TOAST_TYPES, WORKSPACES } from "../config/constants.js";
import { PERMISSIONS } from "../config/roles.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { hasCurrentUserPermission } from "./permissions.js";
import { deleteCareerJob, listCareerApplications, listCareerJobs, saveCareerJob, updateCareerApplicationStatus, updateCareerStatus } from "./careers-api.js";
import { showToast } from "./utils.js";

const state = { jobs: [], applications: [], editing: null, mode: "list" };
const TYPES = [
  ["contract", "Contract"], ["full_time", "Full time"], ["part_time", "Part time"],
  ["temporary", "Temporary"], ["internship", "Internship"], ["volunteer", "Volunteer"], ["other", "Other"]
];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function lines(value) { return Array.isArray(value) ? value.join("\n") : (value || ""); }
function slugify(value) { return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function option(value, label, selected) { return `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`; }
function prettyType(value) { return (TYPES.find(([key]) => key === value) || [null, value])[1] || "—"; }
function publicUrl(job) { return `/careers/job/?slug=${encodeURIComponent(job.slug)}`; }
function can(action) { return hasCurrentUserPermission(MODULES.CAREERS, action); }
function expectedPay(application) {
  if (application.expected_pay_min == null && application.expected_pay_max == null) return "Not stated";
  const min = application.expected_pay_min == null ? "" : Number(application.expected_pay_min).toLocaleString();
  const max = application.expected_pay_max == null ? "" : Number(application.expected_pay_max).toLocaleString();
  return `${application.expected_pay_currency} ${min}${min && max ? "–" : ""}${max}/${application.expected_pay_period}`;
}

function renderList() {
  const createButton = can(PERMISSIONS.CREATE) ? '<button class="btn" id="careerNew" type="button">Create job</button>' : "";
  renderModuleContent(`
    <style>
      .career-head{display:flex;gap:1rem;justify-content:space-between;align-items:flex-start}.career-head .muted{max-width:760px}
      .career-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:1rem;margin-top:1rem}
      .career-card{display:flex;flex-direction:column;gap:.8rem}.career-card h3{margin:0}.career-row{display:flex;gap:.55rem;flex-wrap:wrap;align-items:center}
      .career-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:auto;padding-top:.3rem}.career-status{font-weight:700;text-transform:capitalize}
      .career-status--published{color:#42c98a}.career-status--closed,.career-status--archived{color:#ef8d76}.career-empty{text-align:center;padding:3rem 1rem}
      .career-applications{margin-top:1rem}.career-applications select{min-width:135px}.career-applications td{vertical-align:top}
    </style>
    <section class="card career-head">
      <div><h3>Public job publishing</h3><p class="muted">Create a draft, review the public copy, then publish it to varadanexus.com/careers. Internal client, source, referral, and interview details remain restricted to EMS users.</p></div>
      <div class="career-row">${createButton}<a class="btn btn-ghost" href="/careers/" target="_blank" rel="noopener">Open public page</a><a class="btn btn-ghost" href="https://drive.google.com/drive/folders/1et2iXfZr8IgPhy1bAJvZZMQQa9oy3sIi" target="_blank" rel="noopener">Applicant Drive</a></div>
    </section>
    ${state.jobs.length ? `<div class="career-grid">${state.jobs.map((job) => `
      <article class="card career-card">
        <div class="career-row"><span class="meta-pill career-status career-status--${esc(job.status)}">${esc(job.status)}</span>${job.featured ? '<span class="meta-pill">Featured</span>' : ""}</div>
        <div><h3>${esc(job.title)}</h3><p class="muted">${esc(job.summary)}</p></div>
        <div class="career-row"><span class="meta-pill">${esc(prettyType(job.employment_type))}</span><span class="meta-pill">${esc(job.workplace_type)}</span><span class="meta-pill">${esc(job.location_label)}</span></div>
        <small class="muted">Updated ${esc(new Date(job.updated_at).toLocaleString("en-IN"))}</small>
        <div class="career-actions">
          ${can(PERMISSIONS.EDIT) ? `<button class="btn btn-ghost career-edit" data-id="${job.id}" type="button">Edit</button>` : ""}
          ${job.status === "published" ? `<a class="btn btn-ghost" href="${publicUrl(job)}" target="_blank" rel="noopener">View live</a>` : ""}
          ${can(PERMISSIONS.EDIT) && job.status !== "published" ? `<button class="btn career-status-action" data-id="${job.id}" data-status="published" type="button">Publish</button>` : ""}
          ${can(PERMISSIONS.EDIT) && job.status === "published" ? `<button class="btn btn-ghost career-status-action" data-id="${job.id}" data-status="closed" type="button">Close</button>` : ""}
          ${can(PERMISSIONS.DELETE) ? `<button class="btn btn-ghost career-delete" data-id="${job.id}" type="button">Delete</button>` : ""}
        </div>
      </article>`).join("")}</div>` : '<section class="card career-empty"><h3>No jobs yet</h3><p class="muted">Create the first role. It will remain private until you publish it.</p></section>'}
    <section class="card career-applications">
      <h3>Applications (${state.applications.length})</h3>
      <p class="muted">Candidate details and résumé links are private to authorized Careers users.</p>
      <div class="table-shell"><table><thead><tr><th>Candidate</th><th>Role</th><th>Expected pay</th><th>Availability</th><th>Résumé</th><th>Status</th></tr></thead><tbody>
      ${state.applications.map((application) => {
        const job = state.jobs.find((item) => item.id === application.job_id);
        return `<tr><td><strong>${esc(application.full_name)}</strong><br><a href="mailto:${esc(application.email)}">${esc(application.email)}</a><br><span class="muted">${esc(application.contact_number)}</span></td>
          <td>${esc(job?.title || "Unavailable job")}<br><span class="muted">${esc(application.current_location || "")}</span></td>
          <td>${esc(expectedPay(application))}</td><td>${esc(application.available_from || "Not stated")}<br><span class="muted">${application.available_hours_per_week == null ? "" : `${esc(application.available_hours_per_week)} hrs/week`}</span></td>
          <td>${application.drive_web_view_link ? `<a class="btn btn-ghost" href="${esc(application.drive_web_view_link)}" target="_blank" rel="noopener">Open résumé</a>` : "Unavailable"}</td>
          <td>${can(PERMISSIONS.EDIT) ? `<select class="career-application-status" data-id="${application.id}">${["new","under_review","shortlisted","invited","rejected","withdrawn"].map((value) => option(value,value.replaceAll("_"," "),application.status)).join("")}</select>` : esc(application.status)}</td></tr>`;
      }).join("") || '<tr><td colspan="6">No applications received yet.</td></tr>'}
      </tbody></table></div>
    </section>
  `);
  bindList();
}

function renderForm() {
  const j = state.editing || {};
  const p = j.private || {};
  const isEdit = Boolean(j.id);
  renderModuleContent(`
    <style>
      .career-form-head{display:flex;justify-content:space-between;gap:1rem;align-items:center}.career-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
      .career-section{grid-column:1/-1}.career-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem}.career-field{display:flex;flex-direction:column;gap:.35rem}.career-field--wide{grid-column:1/-1}
      .career-field input,.career-field select,.career-field textarea{width:100%}.career-field small{color:var(--muted)}.career-private{border-color:rgba(212,169,72,.35)}
      .career-actions{display:flex;gap:.65rem;justify-content:flex-end;flex-wrap:wrap}.career-check{display:flex;align-items:center;gap:.5rem}.career-check input{width:auto}
      @media(max-width:780px){.career-form,.career-fields{grid-template-columns:1fr}.career-field--wide{grid-column:auto}.career-form-head{align-items:flex-start;flex-direction:column}}
    </style>
    <section class="card career-form-head"><div><h3>${isEdit ? "Edit job" : "Create job"}</h3><p class="muted">Published fields appear on the public website. Fields marked Internal never appear there.</p></div><button class="btn btn-ghost" id="careerBack" type="button">Back to jobs</button></section>
    <form id="careerForm" class="career-form" style="margin-top:1rem">
      <section class="card career-section">
        <h3>Public job information</h3>
        <div class="career-fields">
          <label class="career-field"><span>Job title *</span><input name="title" maxlength="160" value="${esc(j.title)}" required></label>
          <label class="career-field"><span>Public URL slug *</span><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value="${esc(j.slug)}" required><small>Example: medical-ai-trainer-india</small></label>
          <label class="career-field"><span>Category</span><input name="category" value="${esc(j.category)}" placeholder="AI Training, Healthcare, Language"></label>
          <label class="career-field"><span>Status</span><select name="status">${["draft","published","closed","archived"].map((value) => option(value, value[0].toUpperCase() + value.slice(1), j.status || "draft")).join("")}</select></label>
          <label class="career-field career-field--wide"><span>Short summary * (20–500 characters)</span><textarea name="summary" rows="3" maxlength="500" required>${esc(j.summary)}</textarea></label>
          <label class="career-field career-field--wide"><span>Full job description *</span><textarea name="description" rows="8" required>${esc(j.description)}</textarea><small>Use plain text and keep all eligibility, work, and compensation claims accurate.</small></label>
          <label class="career-field"><span>Responsibilities (one per line)</span><textarea name="responsibilities" rows="7">${esc(lines(j.responsibilities))}</textarea></label>
          <label class="career-field"><span>Qualifications (one per line)</span><textarea name="qualifications" rows="7">${esc(lines(j.qualifications))}</textarea></label>
          <label class="career-field career-field--wide"><span>Skills (one per line or comma-separated)</span><textarea name="skills" rows="3">${esc(lines(j.skills))}</textarea></label>
        </div>
      </section>
      <section class="card career-section">
        <h3>Work and eligibility</h3>
        <div class="career-fields">
          <label class="career-field"><span>Employment type *</span><select name="employment_type">${TYPES.map(([value,label]) => option(value,label,j.employment_type || "contract")).join("")}</select></label>
          <label class="career-field"><span>Workplace *</span><select name="workplace_type">${[["remote","Remote"],["hybrid","Hybrid"],["on_site","On site"]].map(([value,label]) => option(value,label,j.workplace_type || "remote")).join("")}</select></label>
          <label class="career-field"><span>Location shown *</span><input name="location_label" value="${esc(j.location_label || "Remote — India")}" required></label>
          <label class="career-field"><span>Eligible country codes *</span><input name="applicant_countries" value="${esc((j.applicant_countries || ["IN"]).join(", "))}" required><small>ISO codes, such as IN or IN, US.</small></label>
          <label class="career-field"><span>Experience level</span><input name="experience_level" value="${esc(j.experience_level)}" placeholder="Entry level, 2+ years"></label>
          <label class="career-field"><span>Time commitment</span><input name="commitment" value="${esc(j.commitment)}" placeholder="10–20 hours per week"></label>
          <label class="career-field"><span>Valid through</span><input name="valid_through" type="datetime-local" value="${esc(j.valid_through ? new Date(j.valid_through).toISOString().slice(0,16) : "")}"></label>
          <label class="career-field career-check"><input name="featured" type="checkbox" ${j.featured ? "checked" : ""}><span>Feature this role on the careers page</span></label>
        </div>
      </section>
      <section class="card career-section">
        <h3>Compensation and application</h3>
        <div class="career-fields">
          <label class="career-field"><span>Minimum compensation</span><input name="compensation_min" type="number" min="0" step="0.01" value="${esc(j.compensation_min)}"></label>
          <label class="career-field"><span>Maximum compensation</span><input name="compensation_max" type="number" min="0" step="0.01" value="${esc(j.compensation_max)}"></label>
          <label class="career-field"><span>Currency</span><input name="compensation_currency" maxlength="3" value="${esc(j.compensation_currency || "USD")}"></label>
          <label class="career-field"><span>Pay period</span><select name="compensation_period"><option value="">Not specified</option>${["hour","day","week","month","year","project"].map((value) => option(value,value,j.compensation_period)).join("")}</select></label>
          <label class="career-field"><span>Application email *</span><input name="application_email" type="email" value="${esc(j.application_email || "hr@varadanexus.com")}" required></label>
          <label class="career-field career-field--wide"><span>Application instructions</span><textarea name="application_instructions" rows="3">${esc(j.application_instructions)}</textarea></label>
        </div>
      </section>
      <section class="card career-section">
        <h3>Search appearance</h3>
        <div class="career-fields">
          <label class="career-field"><span>SEO title</span><input name="seo_title" maxlength="70" value="${esc(j.seo_title)}" placeholder="Defaults to job title | Varada Nexus Careers"></label>
          <label class="career-field"><span>SEO description</span><textarea name="seo_description" maxlength="160" rows="3">${esc(j.seo_description)}</textarea></label>
        </div>
      </section>
      <section class="card career-section career-private">
        <h3>Internal recruiting details — never public</h3>
        <div class="career-fields">
          <label class="career-field"><span>Internal job ID</span><input name="internal_job_id" value="${esc(p.internal_job_id)}"></label>
          <label class="career-field"><span>Client name</span><input name="client_name" value="${esc(p.client_name)}"></label>
          <label class="career-field"><span>Source job URL</span><input name="source_url" type="url" value="${esc(p.source_url)}"></label>
          <label class="career-field"><span>Referral URL</span><input name="referral_url" type="url" value="${esc(p.referral_url)}"></label>
          <label class="career-field"><span>Interview URL</span><input name="interview_url" type="url" value="${esc(p.interview_url)}"></label>
          <label class="career-field career-field--wide"><span>Internal notes</span><textarea name="internal_notes" rows="4">${esc(p.internal_notes)}</textarea></label>
        </div>
      </section>
      <section class="card career-section career-actions"><button class="btn btn-ghost" id="careerCancel" type="button">Cancel</button><button class="btn" type="submit">${isEdit ? "Save changes" : "Create job"}</button></section>
    </form>
  `);
  bindForm();
}

function bindList() {
  document.querySelector("#careerNew")?.addEventListener("click", () => { state.editing = null; state.mode = "form"; renderForm(); });
  document.querySelectorAll(".career-edit").forEach((button) => button.addEventListener("click", () => {
    state.editing = state.jobs.find((job) => job.id === button.dataset.id) || null; state.mode = "form"; renderForm();
  }));
  document.querySelectorAll(".career-status-action").forEach((button) => button.addEventListener("click", async () => {
    const job = state.jobs.find((item) => item.id === button.dataset.id);
    if (!job) return;
    const next = button.dataset.status;
    if (!confirm(`${next === "published" ? "Publish" : "Close"} “${job.title}”?`)) return;
    try { await updateCareerStatus(job, next); showToast(next === "published" ? "Job is now public." : "Job closed and removed from the public list.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (error) { showToast(error?.message || "Status update failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll(".career-delete").forEach((button) => button.addEventListener("click", async () => {
    const job = state.jobs.find((item) => item.id === button.dataset.id);
    if (!job || !confirm(`Permanently delete “${job.title}”?`)) return;
    try { await deleteCareerJob(job.id); showToast("Job deleted.", TOAST_TYPES.SUCCESS); await reload(); }
    catch (error) { showToast(error?.message || "Delete failed.", TOAST_TYPES.ERROR); }
  }));
  document.querySelectorAll(".career-application-status").forEach((select) => select.addEventListener("change", async () => {
    const previous = state.applications.find((application) => application.id === select.dataset.id)?.status;
    try { await updateCareerApplicationStatus(select.dataset.id, select.value); showToast("Application status updated.", TOAST_TYPES.SUCCESS); }
    catch (error) { select.value = previous || "new"; showToast(error?.message || "Could not update application.", TOAST_TYPES.ERROR); }
  }));
}

function bindForm() {
  const back = () => { state.mode = "list"; state.editing = null; renderList(); };
  document.querySelector("#careerBack")?.addEventListener("click", back);
  document.querySelector("#careerCancel")?.addEventListener("click", back);
  const title = document.querySelector('[name="title"]');
  const slug = document.querySelector('[name="slug"]');
  title?.addEventListener("input", () => { if (!state.editing && !slug.dataset.touched) slug.value = slugify(title.value); });
  slug?.addEventListener("input", () => { slug.dataset.touched = "true"; slug.value = slugify(slug.value); });
  document.querySelector("#careerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      title: data.get("title"), slug: data.get("slug"), category: data.get("category"), status: data.get("status"), summary: data.get("summary"), description: data.get("description"),
      responsibilities: data.get("responsibilities"), qualifications: data.get("qualifications"), skills: data.get("skills"), employmentType: data.get("employment_type"), workplaceType: data.get("workplace_type"),
      locationLabel: data.get("location_label"), applicantCountries: data.get("applicant_countries"), experienceLevel: data.get("experience_level"), commitment: data.get("commitment"), validThrough: data.get("valid_through"), featured: data.get("featured") === "on",
      compensationMin: data.get("compensation_min"), compensationMax: data.get("compensation_max"), compensationCurrency: data.get("compensation_currency"), compensationPeriod: data.get("compensation_period"),
      applicationEmail: data.get("application_email"), applicationInstructions: data.get("application_instructions"), seoTitle: data.get("seo_title"), seoDescription: data.get("seo_description"),
      internalJobId: data.get("internal_job_id"), clientName: data.get("client_name"), sourceUrl: data.get("source_url"), referralUrl: data.get("referral_url"), interviewUrl: data.get("interview_url"), internalNotes: data.get("internal_notes"),
      datePosted: state.editing?.date_posted, publishedAt: state.editing?.published_at
    };
    if (payload.status === "published" && !confirm("Publish this job to the public Varada Nexus Careers page now?")) return;
    try { await saveCareerJob(payload, state.editing?.id || null); showToast(payload.status === "published" ? "Job saved and published." : "Job saved.", TOAST_TYPES.SUCCESS); state.mode = "list"; state.editing = null; await reload(); }
    catch (error) { showToast(error?.message || "Could not save the job.", TOAST_TYPES.ERROR); }
  });
}

async function reload() {
  try {
    [state.jobs, state.applications] = await Promise.all([listCareerJobs(), listCareerApplications()]);
    renderList();
  }
  catch (error) { state.jobs = []; state.applications = []; renderList(); showToast(error?.message || "Could not load careers.", TOAST_TYPES.ERROR); }
}

async function init() {
  const boot = await bootstrapProtectedPage({ moduleCode: MODULES.CAREERS, pageTitle: "Careers", pageDescription: "Publish opportunities to the Varada Nexus website", workspace: WORKSPACES.CAREERS });
  if (!boot) return;
  await reload();
}
init();
