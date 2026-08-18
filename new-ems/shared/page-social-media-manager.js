import { MODULES, WORKSPACES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { getSession } from "./auth.js";
import { getSupabaseAccessToken } from "../config/supabase.js";

function safeModuleUrl(view) {
  const configured = String(window.EMS_RUNTIME_CONFIG?.socialMediaManagerUrl || "").trim();
  const fallback = "http://localhost:3000/dashboard?embedded=1";
  const routes = new Set([
    "dashboard", "create", "content", "calendar", "approvals",
    "trends", "analytics", "instagram", "inbox", "accounts", "campaigns",
    "ads-create", "ads-analytics", "settings", "audit"
  ]);

  try {
    const url = new URL(configured || fallback, window.location.origin);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    const route = view === "overview" ? "dashboard" : routes.has(view) ? view : "dashboard";
    const routePath = route
      .replace("ads-create", "ads/create")
      .replace("ads-analytics", "ads/analytics");
    url.pathname = url.pathname.replace(/\/(dashboard|create|content|calendar|approvals|trends|analytics|instagram|inbox|accounts|campaigns|ads\/create|ads\/analytics|settings|audit)\/?$/, `/${routePath}`);
    url.search = "embedded=1&build=nexus-social-ads-section-20260818";
    return url.href;
  } catch {
    return fallback;
  }
}

function syncSidebarActiveState(destination) {
  const current = new URL(destination, window.location.origin);
  document.querySelectorAll("#appSidebar a.nav-link[href]").forEach((link) => {
    const item = new URL(link.href, window.location.origin);
    const sameSocialRoute = item.pathname === current.pathname &&
      item.pathname.includes("/modules/social-media-manager/") &&
      (item.searchParams.get("view") || "overview") === (current.searchParams.get("view") || "overview");
    const active = sameSocialRoute || (item.pathname === current.pathname && item.search === current.search);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll("#appSidebar details.nav-section").forEach((section) => {
    if (section.querySelector("a.nav-link.active")) section.open = true;
  });
}

function renderLauncher(moduleUrl, session, accessToken) {
  renderModuleContent(`
    <style>
      .page-head { display: none; }
      .page-content {
        width: 100%;
        max-width: none;
        padding: 0;
      }
      .nexus-social-host {
        position: relative;
        min-height: calc(100vh - 64px);
        overflow: hidden;
        background: #070b12;
      }
      .nexus-social-frame {
        display: block;
        width: 100%;
        min-height: calc(100vh - 64px);
        border: 0;
        background: #070b12;
      }
      @media (max-width: 720px) {
        .nexus-social-host,
        .nexus-social-frame { min-height: calc(100vh - 56px); }
      }
    </style>
    <section class="nexus-social-host" aria-label="Nexus Social workspace">
      <iframe
        class="nexus-social-frame"
        id="nexusSocialFrame"
        src="${moduleUrl.replaceAll('"', "&quot;")}"
        title="Nexus Social AI Social Media Manager"
        allow="clipboard-write"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </section>
  `);

  syncSidebarActiveState(window.location.href);

  const frame = document.querySelector("#nexusSocialFrame");
  const targetOrigin = new URL(moduleUrl, window.location.origin).origin;
  const postSession = async () => {
    const refreshedAccessToken = await getSupabaseAccessToken().catch(() => "");
    const currentAccessToken =
      refreshedAccessToken || accessToken || session?.access_token || "";
    if (!currentAccessToken) return;
    frame.contentWindow?.postMessage(
      {
        type: "VARADA_EMS_SESSION",
        accessToken: currentAccessToken,
        refreshToken: session?.refresh_token || null,
        expiresAt: session?.expires_at || null,
        supabaseUrl: window.EMS_RUNTIME_CONFIG?.supabaseUrl || "",
        supabaseAnonKey: window.EMS_RUNTIME_CONFIG?.supabaseAnonKey || ""
      },
      targetOrigin
    );
  };
  frame?.addEventListener("load", () => {
    postSession();
    window.setTimeout(postSession, 250);
  });
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    try {
      const destination = new URL(link.href, window.location.origin);
      if (destination.origin !== window.location.origin) return;
      if (!destination.pathname.includes("/modules/social-media-manager/")) return;
      const view = destination.searchParams.get("view") || "overview";
      const route = view === "overview"
        ? "/dashboard"
        : view === "ads-create"
          ? "/ads/create"
          : view === "ads-analytics"
            ? "/ads/analytics"
            : `/${view}`;
      event.preventDefault();
      document.body.classList.remove("page-transition-active");
      try { sessionStorage.removeItem("ems_nav_pending"); } catch {}
      window.history.replaceState(null, "", destination.href);
      syncSidebarActiveState(destination);
      frame?.contentWindow?.postMessage({ type: "VARADA_EMS_NAVIGATE", route }, targetOrigin);
    } catch {
      // Preserve normal navigation when a sidebar destination is malformed.
    }
  });
  window.addEventListener("message", (event) => {
    if (event.source !== frame?.contentWindow || event.origin !== targetOrigin) return;
    if (event.data?.type === "VARADA_SOCIAL_READY") {
      postSession();
      return;
    }
    if (event.data?.type === "VARADA_SOCIAL_NAVIGATE") {
      try {
        const destination = new URL(String(event.data.url || ""));
        const allowed =
          destination.protocol === "https:" &&
          (destination.hostname === "www.facebook.com" ||
            destination.hostname === "facebook.com");
        if (!allowed) throw new Error("Navigation target is not allowed");
        window.location.assign(destination.href);
      } catch {
        // Ignore malformed or untrusted navigation requests from embedded content.
      }
    }
  });
}

async function init() {
  const view = new URLSearchParams(window.location.search).get("view") || "overview";
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.SOCIAL_MEDIA_MANAGER,
    pageTitle: "Nexus Social",
    pageDescription: "AI research, content creation, approvals, publishing, and analytics",
    sidebarless: false,
    workspace: WORKSPACES.SOCIAL_MEDIA
  });
  if (!boot) return;

  const session = await getSession().catch(() => null);
  const accessToken = await getSupabaseAccessToken().catch(() => "");
  renderLauncher(safeModuleUrl(view), session, accessToken);
}

init();
