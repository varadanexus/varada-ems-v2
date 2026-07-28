"use client";

import { createClient } from "@/lib/supabase/client";

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!window.__NEXUS_EMS_SESSION__?.accessToken) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 1200);
      window.addEventListener("nexus-session-ready", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
  const bridged = window.__NEXUS_EMS_SESSION__;
  if (bridged?.accessToken) {
    headers.set("Authorization", `Bearer ${bridged.accessToken}`);
    if (bridged.supabaseUrl) headers.set("X-Nexus-Supabase-Url", bridged.supabaseUrl);
    if (bridged.supabaseAnonKey) headers.set("X-Nexus-Supabase-Anon-Key", bridged.supabaseAnonKey);
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(input, { ...init, headers, cache: "no-store" });
  const payload = (await response.json()) as {
    data: T | null;
    error?: { message?: string } | null;
  };
  if (!response.ok || payload.data === null) {
    throw new Error(payload.error?.message || "Request failed.");
  }
  return payload.data;
}

export async function socialEdgeFetch<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!window.__NEXUS_EMS_SESSION__?.accessToken) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 1200);
      window.addEventListener("nexus-session-ready", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
  const session = window.__NEXUS_EMS_SESSION__;
  if (!session?.accessToken || !session.supabaseUrl || !session.supabaseAnonKey) {
    throw new Error("Sign in through EMS to use Nexus Social.");
  }
  const response = await fetch(
    `${session.supabaseUrl.replace(/\/$/, "")}/functions/v1/social-media-integrations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        apikey: session.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
    },
  );
  const result = (await response.json()) as {
    data: T | null;
    error?: { message?: string } | null;
  };
  if (!response.ok || result.data === null) {
    throw new Error(result.error?.message || "Social integration request failed.");
  }
  return result.data;
}
