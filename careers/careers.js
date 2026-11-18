const runtime = window.EMS_RUNTIME_CONFIG || {};
const client = window.supabase.createClient(runtime.supabaseUrl, runtime.supabaseAnonKey, { auth: { persistSession: false } });
const previewMode = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("preview") === "1";
const previewJobs = [{
  id: "11111111-1111-4111-8111-111111111111", title: "Medical AI Training Specialist", slug: "medical-ai-training-specialist-india", category: "Clinical AI",
  summary: "Apply your medical knowledge to improve next-generation AI systems through flexible, remote project work.",
  description: "We are seeking medical professionals who can evaluate clinical content, identify reasoning gaps, and help improve the quality of AI-generated responses. This is a remote project opportunity coordinated by Varada Nexus for a confidential AI company.",
  responsibilities: ["Review and evaluate medical content for accuracy and clarity", "Provide structured feedback using project guidelines", "Complete assigned work within agreed timelines"],
  qualifications: ["Medical degree or relevant clinical qualification", "Strong written English and attention to detail", "Reliable internet connection and availability for remote work"],
  skills: ["Clinical reasoning", "Medical writing", "AI training"], employment_type: "contract", workplace_type: "remote", location_label: "Remote — India", applicant_countries: ["IN"],
  compensation_min: 18, compensation_max: 30, compensation_currency: "USD", compensation_period: "hour", application_instructions: "Shortlisted applicants may be invited to complete an online AI interview.",
  featured: true, date_posted: "2026-11-15", valid_through: "2026-12-31T23:59:00Z", seo_title: "Remote Medical AI Training Specialist — India", seo_description: "Remote medical AI training project for qualified professionals in India."
}];
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const typeLabel = (value) => ({ full_time: "Full time", part_time: "Part time", contract: "Contract", temporary: "Temporary", internship: "Internship", volunteer: "Volunteer", other: "Other" }[value] || value || "Opportunity");
const employmentSchema = (value) => ({ full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", temporary: "TEMPORARY", internship: "INTERN", volunteer: "VOLUNTEER", other: "OTHER" }[value] || "OTHER");
const paragraphs = (value) => esc(value).split(/\n{2,}/).map((part) => `<p>${part.replaceAll("\n", "<br>")}</p>`).join("");
const list = (items) => (items || []).length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
const jobUrl = (job) => `/careers/job/?slug=${encodeURIComponent(job.slug)}${previewMode ? "&preview=1" : ""}`;

async function fetchJobs() {
  if (previewMode) return previewJobs;
  const { data, error } = await client.from("career_jobs").select("*").order("featured", { ascending: false }).order("date_posted", { ascending: false });
  if (error) throw error;
  return data || [];
}

function renderCards(jobs) {
  const root = $("#careerList");
  if (!root) return;
  if (!jobs.length) { root.innerHTML = '<div class="career-empty"><h3>No open roles right now</h3><p>Please check back soon for new opportunities.</p></div>'; return; }
  root.innerHTML = jobs.map((job) => `<article class="career-card" data-search="${esc([job.title,job.category,job.summary,job.location_label,...(job.skills || [])].join(" ").toLowerCase())}">
    <div class="career-tags">${job.featured ? '<span class="career-tag">Featured</span>' : ""}<span class="career-tag">${esc(typeLabel(job.employment_type))}</span><span class="career-tag">${esc(job.workplace_type === "on_site" ? "On site" : job.workplace_type)}</span></div>
    <div><h3>${esc(job.title)}</h3><p>${esc(job.summary)}</p></div><div class="career-card-actions"><span>${esc(job.location_label)}</span><a class="career-link" href="${jobUrl(job)}">View & apply</a></div></article>`).join("");
}

async function initList() {
  try {
    const jobs = await fetchJobs(); renderCards(jobs);
    $("#careerSearch")?.addEventListener("input", (event) => {
      const query = event.currentTarget.value.trim().toLowerCase();
      document.querySelectorAll(".career-card").forEach((card) => { card.hidden = query && !card.dataset.search.includes(query); });
    });
  } catch { $("#careerList").innerHTML = '<div class="career-error">Current opportunities could not be loaded. Please try again shortly.</div>'; }
}

function updateMetadata(job) {
  const title = job.seo_title || `${job.title} | Varada Nexus Careers`;
  const description = job.seo_description || job.summary;
  const canonical = `https://www.varadanexus.com${jobUrl(job)}`;
  document.title = title;
  $("meta[name='description']")?.setAttribute("content", description);
  $("link[rel='canonical']")?.setAttribute("href", canonical);
  const schema = {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: [job.description, ...(job.responsibilities || []).map((item) => `Responsibility: ${item}`), ...(job.qualifications || []).map((item) => `Qualification: ${item}`)].join("\n"),
    datePosted: job.date_posted, validThrough: job.valid_through || undefined,
    employmentType: employmentSchema(job.employment_type),
    hiringOrganization: { "@type": "Organization", name: "Confidential AI client" },
    jobLocationType: job.workplace_type === "remote" ? "TELECOMMUTE" : undefined,
    applicantLocationRequirements: (job.applicant_countries || []).map((country) => ({ "@type": "Country", name: country })),
    directApply: true, url: canonical
  };
  if (job.compensation_min != null || job.compensation_max != null) schema.baseSalary = { "@type": "MonetaryAmount", currency: job.compensation_currency, value: { "@type": "QuantitativeValue", minValue: job.compensation_min ?? undefined, maxValue: job.compensation_max ?? undefined, unitText: String(job.compensation_period || "HOUR").toUpperCase() } };
  const script = document.createElement("script"); script.type = "application/ld+json"; script.textContent = JSON.stringify(schema); document.head.appendChild(script);
}

function renderDetail(job) {
  updateMetadata(job);
  const pay = job.compensation_min == null && job.compensation_max == null ? "" : `<span class="career-tag">${esc(job.compensation_currency)} ${esc(job.compensation_min ?? "")} ${job.compensation_max != null ? `– ${esc(job.compensation_max)}` : ""}/${esc(job.compensation_period || "period")}</span>`;
  $("#careerDetail").innerHTML = `<div class="career-detail-grid"><article class="career-detail-main"><a class="career-back" href="/careers/">← All opportunities</a><div class="career-tags"><span class="career-tag">${esc(typeLabel(job.employment_type))}</span><span class="career-tag">${esc(job.location_label)}</span>${pay}</div><h1>${esc(job.title)}</h1><p class="career-summary">${esc(job.summary)}</p>
    <section class="career-detail-section"><h2>About this opportunity</h2>${paragraphs(job.description)}</section>
    ${(job.responsibilities || []).length ? `<section class="career-detail-section"><h2>What you will do</h2>${list(job.responsibilities)}</section>` : ""}
    ${(job.qualifications || []).length ? `<section class="career-detail-section"><h2>What we are looking for</h2>${list(job.qualifications)}</section>` : ""}
    ${(job.skills || []).length ? `<section class="career-detail-section"><h2>Skills</h2><div class="career-tags">${job.skills.map((skill) => `<span class="career-tag">${esc(skill)}</span>`).join("")}</div></section>` : ""}
    <section class="career-detail-section"><h2>Before you apply</h2><p>Varada Nexus coordinates recruitment for a third-party company. Applying does not guarantee selection, an interview, or work. Shortlisted applicants may receive a separate assessment or interview invitation. Final eligibility and engagement terms are determined by the hiring company.</p></section></article>
    <aside class="career-apply-panel" id="apply"><span class="eyebrow">Apply now</span><h2>Tell us about yourself</h2><p class="career-summary">Use the same email throughout the assessment process.</p>${applicationForm(job)}</aside></div>`;
  bindApplication(job);
}

function applicationForm(job) {
  const currency = job.compensation_currency || "USD";
  return `<form class="career-form" id="careerApplicationForm"><input type="hidden" name="job_id" value="${esc(job.id)}"><label class="career-honeypot">Company website<input name="company_website" tabindex="-1" autocomplete="off"></label>
    <div class="career-field"><label for="full_name">Full name *</label><input id="full_name" name="full_name" autocomplete="name" required maxlength="160"></div>
    <div class="career-form-row"><div class="career-field"><label for="email">Email *</label><input id="email" name="email" type="email" autocomplete="email" required></div><div class="career-field"><label for="contact_number">Contact number *</label><input id="contact_number" name="contact_number" type="tel" autocomplete="tel" required maxlength="30"></div></div>
    <div class="career-form-row"><div class="career-field"><label for="current_location">Current location *</label><input id="current_location" name="current_location" autocomplete="address-level2" required></div><div class="career-field"><label for="country_code">Country *</label><input id="country_code" name="country_code" value="IN" maxlength="3" required></div></div>
    <div class="career-field"><label for="time_zone">Time zone</label><input id="time_zone" name="time_zone"></div>
    <div class="career-form-row"><div class="career-field"><label for="expected_pay_min">Expected pay *</label><input id="expected_pay_min" name="expected_pay_min" type="number" min="0" step="0.01" required></div><div class="career-field"><label for="expected_pay_max">Maximum expected pay</label><input id="expected_pay_max" name="expected_pay_max" type="number" min="0" step="0.01"></div></div>
    <div class="career-form-row"><div class="career-field"><label for="expected_pay_currency">Currency *</label><input id="expected_pay_currency" name="expected_pay_currency" value="${esc(currency)}" maxlength="3" required></div><div class="career-field"><label for="expected_pay_period">Pay period *</label><select id="expected_pay_period" name="expected_pay_period" required><option value="hour">Per hour</option><option value="day">Per day</option><option value="week">Per week</option><option value="month">Per month</option><option value="year">Per year</option><option value="project">Per project</option></select></div></div>
    <div class="career-form-row"><div class="career-field"><label for="available_from">Available to start *</label><input id="available_from" name="available_from" type="date" required></div><div class="career-field"><label for="available_hours_per_week">Hours available/week *</label><input id="available_hours_per_week" name="available_hours_per_week" type="number" min="1" max="168" step="1" required></div></div>
    <div class="career-field"><label for="linkedin_url">LinkedIn profile</label><input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://linkedin.com/in/..."></div><div class="career-field"><label for="portfolio_url">Portfolio or professional profile</label><input id="portfolio_url" name="portfolio_url" type="url" placeholder="https://"></div>
    <div class="career-field"><label for="cover_note">Brief note</label><textarea id="cover_note" name="cover_note" maxlength="5000" placeholder="Tell us why this role fits your experience."></textarea></div>
    <div class="career-field"><label for="resume">Résumé/CV * (PDF, DOC, or DOCX; max 10 MB)</label><input id="resume" name="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required></div>
    ${job.application_instructions ? `<p class="career-summary">${esc(job.application_instructions)}</p>` : ""}
    <label class="career-checkbox"><input name="consent_checkbox" type="checkbox" required><span>I consent to Varada Nexus processing my application and résumé for recruitment, sharing it with the relevant hiring company, and contacting me about this role under the <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>. *</span></label>
    <div class="career-form-message" id="careerFormMessage" role="status"></div><button class="career-apply-button" type="submit">Submit application</button></form>`;
}

function bindApplication() {
  const form = $("#careerApplicationForm");
  const timeZone = $("#time_zone", form); if (timeZone) timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#careerFormMessage"); const button = $("button[type='submit']", form); const formData = new FormData(form);
    const file = formData.get("resume");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) { message.className = "career-form-message is-error"; message.textContent = "Please attach a résumé no larger than 10 MB."; return; }
    formData.set("consent", form.elements.consent_checkbox.checked ? "true" : "false"); formData.delete("consent_checkbox");
    button.disabled = true; button.textContent = "Submitting…"; message.className = "career-form-message"; message.textContent = "";
    try {
      const response = await fetch(`${runtime.supabaseUrl}/functions/v1/career-applications`, { method: "POST", headers: { apikey: runtime.supabaseAnonKey }, body: formData });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Submission failed.");
      message.className = "career-form-message is-success"; message.textContent = `Application submitted successfully. Reference: ${result.reference}. Please keep using ${formData.get("email")} for this process.`; form.reset(); if (timeZone) timeZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; button.textContent = "Application submitted";
    } catch (error) { message.className = "career-form-message is-error"; message.textContent = error.message || "We could not submit your application. Please try again."; button.disabled = false; button.textContent = "Submit application"; }
  });
}

async function initDetail() {
  const slug = new URLSearchParams(location.search).get("slug"); if (!slug) { $("#careerDetail").innerHTML = '<div class="career-error">This opportunity could not be found. <a href="/careers/">View all jobs</a>.</div>'; return; }
  if (previewMode) { const job = previewJobs.find((item) => item.slug === slug); if (job) { renderDetail(job); return; } }
  const { data: job, error } = await client.from("career_jobs").select("*").eq("slug", slug).single();
  if (error || !job) { $("#careerDetail").innerHTML = '<div class="career-error">This opportunity is unavailable or has closed. <a href="/careers/">View current jobs</a>.</div>'; return; }
  renderDetail(job);
}

if ($("#careerList")) initList();
if ($("#careerDetail")) initDetail();
