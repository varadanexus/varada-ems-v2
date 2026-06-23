import { ROUTES, TOAST_TYPES } from "../config/constants.js";
import { markUserLogin } from "./admin-api.js";
import { loginWithPassword, redirectIfAuthenticated, redirectToResolvedPortal, signOutSessionOnly, validateActiveUnlockedUser } from "./auth.js";
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
    debugLog("login submit payload", {
      email,
      emailLength: email.length,
      passwordLength: password.length,
      activeElementId: document.activeElement?.id || null,
      formPresent: Boolean(form)
    });

    if (!email || !password) {
      showToast("Enter email and password", TOAST_TYPES.ERROR);
      return;
    }

    try {
      debugLog("login step", { step: "before_loginWithPassword" });
      const loginData = await loginWithPassword(email, password);
      debugLog("login step", {
        step: "after_loginWithPassword",
        hasSession: Boolean(loginData?.session),
        userId: loginData?.user?.id || null
      });

      debugLog("login step", { step: "before_validateActiveUnlockedUser" });
      await validateActiveUnlockedUser();
      debugLog("login step", { step: "after_validateActiveUnlockedUser" });

      if (loginData?.user?.id) {
        debugLog("login step", { step: "before_markUserLogin", userId: loginData.user.id });
        await markUserLogin(loginData.user.id);
        debugLog("login step", { step: "after_markUserLogin", userId: loginData.user.id });
      }
      debugLog("redirect reason", { reason: "login_success", to: "resolved_portal" });
      showToast("Login successful", TOAST_TYPES.SUCCESS);
      await redirectToResolvedPortal();
    } catch (error) {
      debugLog("login error", {
        message: error?.message || "Login failed",
        name: error?.name || null,
        details: error?.details || null,
        code: error?.code || null,
        status: error?.status || null
      });
      if (!loginDataIndicatesSuccess(error)) {
        await signOutSessionOnly();
      }
      showToast(error?.message || "Login failed", TOAST_TYPES.ERROR);
    }
  });
}

function loginDataIndicatesSuccess(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("no portal access") || message.includes("portal") || message.includes("role_lookup_unavailable");
}

init();
