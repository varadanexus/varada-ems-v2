import { initLiveChat } from "./live-chat.js?v=sprint15-chat-2";

function shouldBootChat() {
  const path = window.location.pathname || "";
  if (!path.startsWith("/new-ems/modules/")) return false;
  if (path.includes("/login/")) return false;
  if (path.includes("portal-login")) return false;
  return true;
}

function boot() {
  if (!shouldBootChat()) return;
  if (window.__EMS_LIVE_CHAT_BOOTED__) return;
  window.__EMS_LIVE_CHAT_BOOTED__ = true;
  initLiveChat().catch((error) => {
    window.__EMS_LIVE_CHAT_BOOTED__ = false;
    if (window.EMS_DEBUG_AUTH_FLOW) console.warn("[EMS_CHAT_AUTOBOOT_SKIPPED]", error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 300), { once: true });
} else {
  setTimeout(boot, 300);
}

