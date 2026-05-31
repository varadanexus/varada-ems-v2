import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { loginWithPassword, redirectIfAuthenticated } from "./auth.js";
import { initTheme } from "./theme.js";
import { qs, showToast } from "./utils.js";

function debugLog(message, data = null) {
  if (!window.EMS_DEBUG_AUTH_FLOW) return;
  if (data === null) {
    console.info(`[EMS_DEBUG] ${message}`);
    return;
  }
  console.info(`[EMS_DEBUG] ${message}`, data);
}

async function init() {
  initTheme();

  const alreadyLoggedIn = await redirectIfAuthenticated();
  if (alreadyLoggedIn) return;

  const form = qs("#loginForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = qs("#email")?.value?.trim() || "";
    const password = qs("#password")?.value || "";

    if (!email || !password) {
      showToast("Enter email and password", TOAST_TYPES.ERROR);
      return;
    }

    try {
      await loginWithPassword(email, password);
      localStorage.setItem("ems_role", "admin"); // Sprint 1 placeholder role bootstrap.
      debugLog("redirect reason", { reason: "login_success", to: ROUTES.DASHBOARD });
      showToast("Login successful", TOAST_TYPES.SUCCESS);
      window.location.replace(ROUTES.DASHBOARD);
    } catch (error) {
      showToast(error?.message || "Login failed", TOAST_TYPES.ERROR);
    }
  });
}

init();
