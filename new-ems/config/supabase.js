import { APP_NAME } from "./constants.js";

let clientInstance = null;

function getRuntimeConfig() {
  const runtime = window.EMS_RUNTIME_CONFIG || {};
  return {
    supabaseUrl: runtime.supabaseUrl || "",
    supabaseAnonKey: runtime.supabaseAnonKey || ""
  };
}

export function getSupabaseClient() {
  if (clientInstance) return clientInstance;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(`${APP_NAME}: Supabase SDK not loaded`);
  }

  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(`${APP_NAME}: Missing Supabase runtime config`);
  }

  clientInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  return clientInstance;
}
