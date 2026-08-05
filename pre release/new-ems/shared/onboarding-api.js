// Client wrapper for the Centralised Onboarding integration.
// Everything routes through the `onboarding-integrations` edge function.
// Public (customer) actions run on the anon client; staff actions carry the
// authenticated EMS session automatically.

import { getSupabaseClient } from "../config/supabase.js";

async function onboardingIntegration(action, payload = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("onboarding-integrations", {
    body: { action, ...payload }
  });
  if (error) {
    let message = error.message || "Onboarding request failed.";
    const context = error.context;
    if (context && typeof context.json === "function") {
      const details = await context.json().catch(() => null);
      if (details?.error) message = details.error;
      else if (details?.message) message = details.message;
    } else if (context && typeof context.text === "function") {
      const text = await context.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Staff
export const createOnboardingRequest = (p) => onboardingIntegration("create_request", p);
export const sendOnboardingLink = (p) => onboardingIntegration("send_link", p);
export const listOnboardingRequests = (p) => onboardingIntegration("list_requests", p);
export const getOnboardingSubmission = (p) => onboardingIntegration("get_submission", p);
export const getOnboardingMedia = (p) => onboardingIntegration("get_drive_media", p);
export const approveOnboarding = (p) => onboardingIntegration("approve_request", p);
export const updateOnboardingRequest = (p) => onboardingIntegration("update_request", p);
export const deleteOnboardingRequest = (p) => onboardingIntegration("delete_request", p);

// Public (customer)
export const requestOnboardingOtp = (p) => onboardingIntegration("request_otp", p);
export const verifyOnboardingOtp = (p) => onboardingIntegration("verify_otp", p);
export const getOnboardingContext = (p) => onboardingIntegration("get_context", p);
export const saveOnboardingSubmission = (p) => onboardingIntegration("save_submission", p);
export const uploadOnboardingDocument = (p) => onboardingIntegration("upload_document", p);
export const acceptOnboardingTerms = (p) => onboardingIntegration("accept_terms", p);
