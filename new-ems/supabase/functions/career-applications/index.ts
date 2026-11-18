// @ts-nocheck
// Public careers intake. Validates an active role, stores the resume in the
// private Varada Nexus Drive hierarchy, then records the application for EMS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_CAREERS_DRIVE_FOLDER = "1et2iXfZr8IgPhy1bAJvZZMQQa9oy3sIi";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://www.varadanexus.com",
  "https://varadanexus.com",
  "http://localhost:5501",
  "http://127.0.0.1:5501"
]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function env(name: string, fallback = "") { return Deno.env.get(name) || fallback; }
function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.varadanexus.com",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
function text(value: FormDataEntryValue | null, max = 1000) { return String(value || "").trim().slice(0, max); }
function nullableNumber(value: string) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function safeSegment(value: string, fallback: string) {
  const cleaned = String(value || "").normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 100);
}
function validUrl(value: string) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}

function base64url(input: ArrayBuffer | string) {
  let raw = "";
  if (typeof input === "string") raw = btoa(input);
  else {
    const bytes = new Uint8Array(input);
    for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
    raw = btoa(raw);
  }
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
let cachedToken: { value: string; exp: number } | null = null;
async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Google Drive service account is not configured.");
  const serviceAccount = JSON.parse(raw);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(serviceAccount.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google Drive authentication failed.");
  cachedToken = { value: payload.access_token, exp: now + Number(payload.expires_in || 3600) };
  return cachedToken.value;
}
async function driveRequest(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const body = await response.text();
  let payload: any = null;
  try { payload = body ? JSON.parse(body) : null; } catch { payload = { message: body }; }
  if (!response.ok) throw new Error(payload?.error?.message || `Google Drive request failed (${response.status}).`);
  return payload;
}
function escapeQuery(value: string) { return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
async function ensureFolder(token: string, parentId: string, name: string) {
  const query = `name='${escapeQuery(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveRequest(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`, token);
  if (found?.files?.[0]?.id) return found.files[0].id;
  const created = await driveRequest("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  return created.id;
}
async function uploadResume(token: string, folderId: string, file: File, fileName: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const boundary = `vncareer${crypto.randomUUID().replaceAll("-", "")}`;
  const encoder = new TextEncoder();
  const before = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`);
  const after = encoder.encode(`\r\n--${boundary}--`);
  const requestBody = new Uint8Array(before.length + bytes.length + after.length);
  requestBody.set(before, 0); requestBody.set(bytes, before.length); requestBody.set(after, before.length + bytes.length);
  return await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,size", token, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: requestBody
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed." }, 403, origin);

  try {
    const form = await request.formData();
    if (text(form.get("company_website"), 200)) return json({ ok: true }, 200, origin);
    const jobId = text(form.get("job_id"), 80);
    const fullName = text(form.get("full_name"), 160);
    const email = text(form.get("email"), 320).toLowerCase();
    const contactNumber = text(form.get("contact_number"), 30);
    const currentLocation = text(form.get("current_location"), 200);
    const countryCode = text(form.get("country_code"), 3).toUpperCase();
    const consent = text(form.get("consent"), 10) === "true";
    const resume = form.get("resume");
    if (!jobId || !fullName || !email.includes("@") || contactNumber.length < 7 || !currentLocation || countryCode.length !== 2 || !consent) return json({ error: "Please complete all required fields and consent to processing." }, 400, origin);
    if (!(resume instanceof File) || !resume.size) return json({ error: "Please attach your résumé." }, 400, origin);
    if (resume.size > MAX_RESUME_BYTES) return json({ error: "Résumé must be 10 MB or smaller." }, 400, origin);
    const resumeExtension = resume.name.toLowerCase().split(".").pop() || "";
    const mimeByExtension: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    const resumeMime = ALLOWED_MIME.has(resume.type) ? resume.type : mimeByExtension[resumeExtension];
    if (!resumeMime) return json({ error: "Résumé must be a PDF, DOC, or DOCX file." }, 400, origin);
    const resumeBytes = new Uint8Array(await resume.arrayBuffer());
    const isPdf = resumeMime === "application/pdf" && new TextDecoder().decode(resumeBytes.slice(0, 5)) === "%PDF-";
    const isDocx = resumeMime.includes("openxmlformats") && resumeBytes[0] === 0x50 && resumeBytes[1] === 0x4b;
    const oleSignature = [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
    const isDoc = resumeMime === "application/msword" && oleSignature.every((byte, index) => resumeBytes[index] === byte);
    if (!isPdf && !isDocx && !isDoc) return json({ error: "The résumé file content does not match its PDF, DOC, or DOCX format." }, 400, origin);

    const expectedPayMin = nullableNumber(text(form.get("expected_pay_min"), 30));
    const expectedPayMax = nullableNumber(text(form.get("expected_pay_max"), 30));
    const expectedPayCurrency = text(form.get("expected_pay_currency"), 3).toUpperCase();
    const expectedPayPeriod = text(form.get("expected_pay_period"), 20);
    const availableFrom = text(form.get("available_from"), 20);
    const availableHours = nullableNumber(text(form.get("available_hours_per_week"), 20));
    if (expectedPayMin == null || expectedPayMin < 0) return json({ error: "Please enter your expected pay." }, 400, origin);
    if (expectedPayMax != null && expectedPayMax < expectedPayMin) return json({ error: "Maximum expected pay cannot be lower than minimum expected pay." }, 400, origin);
    if (!/^[A-Z]{3}$/.test(expectedPayCurrency) || !["hour","day","week","month","year","project"].includes(expectedPayPeriod)) return json({ error: "Please enter a valid expected pay currency and period." }, 400, origin);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom) || availableHours == null || availableHours < 1 || availableHours > 168) return json({ error: "Please enter a valid start date and weekly availability." }, 400, origin);

    const admin = adminClient();
    const { data: job, error: jobError } = await admin.from("career_jobs").select("id,title,slug,status,published_at,valid_through,deleted_at").eq("id", jobId).single();
    const active = job && job.status === "published" && !job.deleted_at && job.published_at && new Date(job.published_at) <= new Date() && (!job.valid_through || new Date(job.valid_through) > new Date());
    if (jobError || !active) return json({ error: "This job is no longer accepting applications." }, 409, origin);

    const { data: duplicate } = await admin.from("career_applications").select("id").eq("job_id", job.id).ilike("email", email).neq("status", "withdrawn").maybeSingle();
    if (duplicate) return json({ error: "An application for this role has already been submitted with this email address." }, 409, origin);

    const applicationId = crypto.randomUUID();
    const { data: privateJob } = await admin.from("career_job_private").select("internal_job_id").eq("job_id", job.id).maybeSingle();
    const rootFolderId = env("CAREERS_DRIVE_ROOT_FOLDER_ID", DEFAULT_CAREERS_DRIVE_FOLDER);
    const token = await googleToken();
    const jobFolderName = safeSegment(privateJob?.internal_job_id || job.slug || job.id, `Job ${job.id.slice(0, 8)}`);
    const jobFolderId = await ensureFolder(token, rootFolderId, jobFolderName);
    const applicantFolderName = safeSegment(`${fullName} - ${applicationId.slice(0, 8)}`, applicationId.slice(0, 8));
    const applicantFolderId = await ensureFolder(token, jobFolderId, applicantFolderName);
    const extension = resume.name.includes(".") ? `.${resume.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5)}` : "";
    const storedName = `Resume - ${safeSegment(fullName, "Applicant")}${extension}`;
    const resumeForUpload = new File([resumeBytes], resume.name, { type: resumeMime });
    const uploaded = await uploadResume(token, applicantFolderId, resumeForUpload, storedName);
    const application = {
      id: applicationId, job_id: job.id, full_name: fullName, email, contact_number: contactNumber,
      current_location: currentLocation,
      country_code: countryCode,
      time_zone: text(form.get("time_zone"), 100) || null,
      expected_pay_min: expectedPayMin, expected_pay_max: expectedPayMax,
      expected_pay_currency: expectedPayCurrency,
      expected_pay_period: expectedPayPeriod,
      available_from: availableFrom,
      available_hours_per_week: availableHours,
      linkedin_url: validUrl(text(form.get("linkedin_url"), 1000)),
      portfolio_url: validUrl(text(form.get("portfolio_url"), 1000)),
      cover_note: text(form.get("cover_note"), 5000) || null,
      resume_file_name: storedName, resume_mime_type: resumeMime, resume_file_size: resume.size,
      drive_file_id: uploaded.id, drive_folder_id: applicantFolderId, drive_web_view_link: uploaded.webViewLink || null,
      consent_at: new Date().toISOString()
    };
    const { error: insertError } = await admin.from("career_applications").insert(application);
    if (insertError) {
      await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}?supportsAllDrives=true`, token, { method: "DELETE" }).catch(() => null);
      if (insertError.code === "23505") return json({ error: "An application for this role has already been submitted with this email address." }, 409, origin);
      throw insertError;
    }
    return json({ ok: true, reference: applicationId.slice(0, 8).toUpperCase() }, 201, origin);
  } catch (error) {
    console.error("career application failed", error);
    return json({ error: "We could not submit your application right now. Please try again later." }, 500, origin);
  }
});
