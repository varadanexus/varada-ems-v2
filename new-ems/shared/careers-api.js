import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function list(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function publicPayload(input) {
  const status = input.status || "draft";
  const now = new Date().toISOString();
  return {
    title: String(input.title || "").trim(),
    slug: String(input.slug || "").trim().toLowerCase(),
    category: clean(input.category),
    summary: String(input.summary || "").trim(),
    description: String(input.description || "").trim(),
    responsibilities: list(input.responsibilities),
    qualifications: list(input.qualifications),
    skills: list(input.skills),
    employment_type: input.employmentType || "contract",
    workplace_type: input.workplaceType || "remote",
    location_label: String(input.locationLabel || "Remote — India").trim(),
    applicant_countries: list(input.applicantCountries).map((code) => code.toUpperCase()),
    experience_level: clean(input.experienceLevel),
    commitment: clean(input.commitment),
    compensation_min: input.compensationMin === "" || input.compensationMin == null ? null : Number(input.compensationMin),
    compensation_max: input.compensationMax === "" || input.compensationMax == null ? null : Number(input.compensationMax),
    compensation_currency: String(input.compensationCurrency || "USD").trim().toUpperCase(),
    compensation_period: clean(input.compensationPeriod),
    application_email: String(input.applicationEmail || "hr@varadanexus.com").trim().toLowerCase(),
    application_instructions: clean(input.applicationInstructions),
    status,
    featured: Boolean(input.featured),
    date_posted: status === "published" ? (input.datePosted || now.slice(0, 10)) : (input.datePosted || null),
    valid_through: input.validThrough ? new Date(input.validThrough).toISOString() : null,
    published_at: status === "published" ? (input.publishedAt || now) : (input.publishedAt || null),
    seo_title: clean(input.seoTitle),
    seo_description: clean(input.seoDescription)
  };
}

function privatePayload(jobId, input) {
  return {
    job_id: jobId,
    internal_job_id: clean(input.internalJobId),
    client_name: clean(input.clientName),
    source_url: clean(input.sourceUrl),
    referral_url: clean(input.referralUrl),
    interview_url: clean(input.interviewUrl),
    internal_notes: clean(input.internalNotes)
  };
}

export async function listCareerJobs() {
  const { data: jobs, error } = await client
    .from("career_jobs")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!jobs?.length) return [];
  const { data: privateRows, error: privateError } = await client
    .from("career_job_private")
    .select("*")
    .in("job_id", jobs.map((job) => job.id));
  if (privateError) throw privateError;
  const privateByJob = new Map((privateRows || []).map((row) => [row.job_id, row]));
  return jobs.map((job) => ({ ...job, private: privateByJob.get(job.id) || {} }));
}

export async function saveCareerJob(input, id = null) {
  let job;
  if (id) {
    const { data, error } = await client.from("career_jobs").update(publicPayload(input)).eq("id", id).select().single();
    if (error) throw error;
    job = data;
  } else {
    const { data, error } = await client.from("career_jobs").insert(publicPayload(input)).select().single();
    if (error) throw error;
    job = data;
  }
  const { error: privateError } = await client
    .from("career_job_private")
    .upsert(privatePayload(job.id, input), { onConflict: "job_id" });
  if (privateError) throw privateError;
  return job;
}

export async function updateCareerStatus(job, status) {
  const patch = { status };
  if (status === "published") {
    patch.date_posted = job.date_posted || new Date().toISOString().slice(0, 10);
    patch.published_at = job.published_at || new Date().toISOString();
  }
  const { data, error } = await client.from("career_jobs").update(patch).eq("id", job.id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCareerJob(id) {
  const { error } = await client.from("career_jobs").delete().eq("id", id);
  if (error) throw error;
}

export async function listCareerApplications() {
  const { data, error } = await client
    .from("career_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateCareerApplicationStatus(id, status) {
  const { data, error } = await client
    .from("career_applications")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
