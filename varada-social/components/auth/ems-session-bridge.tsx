"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function isAllowedParent(origin: string): boolean {
  const configured = (process.env.NEXT_PUBLIC_EMS_PARENT_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured.length) return configured.includes(origin);
  try {
    const url = new URL(origin);
    return [
      "localhost",
      "127.0.0.1",
      "::1",
      "varadanexus.com",
      "www.varadanexus.com",
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

export function EmsSessionBridge() {
  const router = useRouter();
  useEffect(() => {
    if (window.parent === window) return;
    let readyTimer: number | null = null;
    const parentOrigin = (() => {
      try {
        return document.referrer ? new URL(document.referrer).origin : "*";
      } catch {
        return "*";
      }
    })();
    const announceReady = () => {
      window.parent.postMessage({ type: "VARADA_SOCIAL_READY" }, parentOrigin);
    };
    const handler = async (event: MessageEvent) => {
      if (event.source !== window.parent || !isAllowedParent(event.origin)) return;
      const payload = event.data as {
        type?: string;
        route?: string;
        accessToken?: string;
        refreshToken?: string;
        supabaseUrl?: string;
        supabaseAnonKey?: string;
      };
      if (payload.type === "VARADA_EMS_NAVIGATE") {
        const allowedRoutes = new Set([
          "/dashboard", "/create", "/content", "/calendar", "/approvals",
          "/trends", "/analytics", "/instagram", "/inbox", "/accounts",
          "/campaigns", "/ads/create", "/ads/analytics", "/settings", "/audit",
        ]);
        if (payload.route && allowedRoutes.has(payload.route)) router.push(payload.route);
        return;
      }
      if (
        payload.type !== "VARADA_EMS_SESSION" ||
        !payload.accessToken
      ) {
        return;
      }
      try {
        if (readyTimer !== null) {
          window.clearInterval(readyTimer);
          readyTimer = null;
        }
        window.__NEXUS_EMS_SESSION__ = {
          accessToken: payload.accessToken,
          supabaseUrl: payload.supabaseUrl || "",
          supabaseAnonKey: payload.supabaseAnonKey || "",
        };
        window.dispatchEvent(new Event("nexus-session-ready"));
        if (
          payload.refreshToken &&
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ) {
          const supabase = createClient();
          await supabase.auth.setSession({
            access_token: payload.accessToken,
            refresh_token: payload.refreshToken,
          });
        }
      } catch {
        // Local demo mode has no Supabase browser credentials.
      }
    };
    window.addEventListener("message", handler);
    announceReady();
    readyTimer = window.setInterval(announceReady, 500);
    const stopTimer = window.setTimeout(() => {
      if (readyTimer !== null) window.clearInterval(readyTimer);
      readyTimer = null;
    }, 10_000);
    return () => {
      window.removeEventListener("message", handler);
      if (readyTimer !== null) window.clearInterval(readyTimer);
      window.clearTimeout(stopTimer);
    };
  }, [router]);

  return null;
}

declare global {
  interface Window {
    __NEXUS_EMS_SESSION__?: {
      accessToken: string;
      supabaseUrl: string;
      supabaseAnonKey: string;
    };
  }
}
