import { enablePushNotifications, getPushNotificationStatus, pushSupport } from "./push-notifications.js";

const LOCK_PREFIX = "ems_device_lock_v1:";
const INTERNAL_NAV_PREFIX = "ems_device_internal_nav_v1:";
const INTERNAL_NAV_WINDOW_MS = 10 * 1000;
let hiddenAt = 0;
let authenticatorActive = false;
let internalNavigationUntil = 0;
let securitySetupActive = false;
let activeAppUserId = "";

function nativeDevicePlugin() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  return window.Capacitor?.Plugins?.NativeDevice || null;
}

function bytesToBase64Url(bytes) {
  let value = "";
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function randomChallenge() {
  return crypto.getRandomValues(new Uint8Array(32));
}

function userKey(appUser) {
  return `${LOCK_PREFIX}${appUser.id}`;
}

function internalNavigationKey(appUser) {
  return `${INTERNAL_NAV_PREFIX}${appUser.id}`;
}

function readEnrollment(appUser) {
  try { return JSON.parse(localStorage.getItem(userKey(appUser)) || "null"); } catch { return null; }
}

export function deviceLockSupport() {
  if (nativeDevicePlugin()) return { supported: true, reason: "" };
  const supported = window.isSecureContext && "PublicKeyCredential" in window && Boolean(navigator.credentials);
  return { supported, reason: supported ? "" : "Device biometric/PIN unlock is not supported by this browser." };
}

export function isMobileSecurityDevice() {
  if (window.Capacitor?.isNativePlatform?.()) return true;
  if (navigator.userAgentData?.mobile === true) return true;
  const ua = navigator.userAgent || "";
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return true;
  // iPadOS can identify itself as macOS when desktop-class browsing is enabled.
  if (/macintosh/i.test(ua) && Number(navigator.maxTouchPoints || 0) > 1) return true;

  // Never treat a touch-enabled Windows PC or Chromebook as a mobile app.
  if (/windows nt|cros/i.test(ua)) return false;

  // Installed mobile PWAs can inherit a desktop user-agent when the browser's
  // "Desktop site" option is enabled. Touch input and a phone/tablet-sized
  // display recover those devices even when their primary pointer is reported
  // as fine (some Android launchers and desktop modes do this).
  const hasTouch = Number(navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  const shortestScreenSide = Math.min(Number(window.screen?.width || 0), Number(window.screen?.height || 0));
  return hasTouch && shortestScreenSide > 0 && shortestScreenSide <= 1024;
}

export function getDeviceLockStatus(appUser) {
  const support = deviceLockSupport();
  return { ...support, enabled: Boolean(appUser?.id && readEnrollment(appUser)) };
}

export async function enableDeviceLock(appUser) {
  const support = deviceLockSupport();
  if (!support.supported) throw new Error(support.reason);
  if (!appUser?.id) throw new Error("A signed-in user is required.");
  const nativeDevice = nativeDevicePlugin();
  if (nativeDevice) {
    await nativeDevice.authenticate({ reason: "Confirm your identity to secure Varada EMS" });
    localStorage.setItem(userKey(appUser), JSON.stringify({
      native: true,
      enabledAt: new Date().toISOString(),
      device: "Android native app"
    }));
    installDeviceRelock(appUser);
    return getDeviceLockStatus(appUser);
  }
  authenticatorActive = true;
  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Varada Nexus EMS", id: location.hostname },
        user: {
          id: new TextEncoder().encode(appUser.id),
          name: appUser.email || appUser.id,
          displayName: appUser.display_name || appUser.full_name || appUser.email || "EMS User"
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "discouraged",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    });
  } finally {
    authenticatorActive = false;
    hiddenAt = 0;
  }
  if (!credential) throw new Error("Device lock setup was cancelled.");
  localStorage.setItem(userKey(appUser), JSON.stringify({
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    enabledAt: new Date().toISOString(),
    device: navigator.userAgent.slice(0, 250)
  }));
  installDeviceRelock(appUser);
  return getDeviceLockStatus(appUser);
}

export function disableDeviceLock(appUser) {
  if (!appUser?.id) return;
  localStorage.removeItem(userKey(appUser));
  sessionStorage.removeItem(internalNavigationKey(appUser));
}

async function verifyDevice(appUser) {
  const enrollment = readEnrollment(appUser);
  if (!enrollment) return true;
  const nativeDevice = nativeDevicePlugin();
  if (enrollment?.native && nativeDevice) {
    await nativeDevice.authenticate({ reason: "Unlock Varada EMS" });
    return true;
  }
  if (!enrollment?.credentialId) return true;
  authenticatorActive = true;
  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: location.hostname,
        allowCredentials: [{
          type: "public-key",
          id: base64UrlToBytes(enrollment.credentialId),
          transports: ["internal"]
        }],
        userVerification: "required",
        timeout: 60000
      }
    });
  } finally {
    authenticatorActive = false;
    hiddenAt = 0;
  }
  if (!assertion) throw new Error("Device verification was cancelled.");
  return true;
}

function consumeInternalNavigation(appUser) {
  let allowedUntil = 0;
  try {
    allowedUntil = Number(sessionStorage.getItem(internalNavigationKey(appUser)) || 0);
    sessionStorage.removeItem(internalNavigationKey(appUser));
  } catch {}
  return allowedUntil >= Date.now();
}

function lockOverlay(appUser, onSignOut) {
  document.querySelector(".ems-device-lock")?.remove();
  const overlay = document.createElement("section");
  overlay.className = "ems-device-lock";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="ems-device-lock-card">
      <img src="/new-ems/assets/icons/ems-192.png" alt="" />
      <span class="ems-device-lock-kicker">VARADA NEXUS EMS</span>
      <h1>App locked</h1>
      <p>Use this device's fingerprint, face recognition, or screen PIN to continue.</p>
      <button class="ems-device-unlock" type="button">Unlock EMS</button>
      <button class="ems-device-signout" type="button">Sign out instead</button>
      <small class="ems-device-lock-error" role="alert"></small>
    </div>`;
  document.body.appendChild(overlay);
  return new Promise((resolve) => {
    const unlock = overlay.querySelector(".ems-device-unlock");
    const error = overlay.querySelector(".ems-device-lock-error");
    let attemptActive = false;
    const attemptUnlock = async () => {
      if (attemptActive) return;
      attemptActive = true;
      unlock.disabled = true;
      error.textContent = "";
      try {
        await verifyDevice(appUser);
        overlay.remove();
        resolve(true);
      } catch (cause) {
        error.textContent = cause?.name === "NotAllowedError" ? "Unlock was cancelled or timed out. Tap Unlock EMS to try again." : (cause?.message || "Could not verify this device.");
        unlock.disabled = false;
      } finally {
        attemptActive = false;
      }
    };
    unlock.addEventListener("click", attemptUnlock);
    overlay.querySelector(".ems-device-signout").addEventListener("click", async () => {
      await onSignOut?.();
      resolve(false);
    });
    // Invoke the native biometric/PIN sheet as soon as an enrolled mobile app
    // is relaunched. Browsers that require a user gesture fall back to the
    // visible Unlock EMS button without allowing access to the protected page.
    requestAnimationFrame(() => attemptUnlock());
  });
}

export async function enforceDeviceUnlock(appUser, onSignOut) {
  const enrollment = readEnrollment(appUser);
  if (!enrollment) return true;
  // A token is issued only for one deliberate in-app page transition. A PWA
  // relaunch has no token and therefore always requires device verification.
  if (consumeInternalNavigation(appUser)) return true;
  return lockOverlay(appUser, onSignOut);
}

export async function verifyDeviceLockNow(appUser) {
  return verifyDevice(appUser);
}

export async function enforceMandatorySecuritySetup(appUser, onSignOut) {
  if (!appUser?.id) return false;
  let lockStatus = getDeviceLockStatus(appUser);
  let pushStatus;
  try {
    pushStatus = await getPushNotificationStatus();
  } catch (error) {
    pushStatus = { ...pushSupport(), enabled: false, reason: error?.message || "Could not verify notification status." };
  }
  if (lockStatus.enabled && pushStatus.enabled) return true;

  securitySetupActive = true;
  document.querySelector(".ems-security-setup")?.remove();
  const overlay = document.createElement("section");
  overlay.className = "ems-security-setup";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="ems-security-setup-card">
      <img src="/new-ems/assets/icons/ems-192.png" alt="" />
      <span class="ems-device-lock-kicker">REQUIRED SECURITY SETUP</span>
      <h1>Secure this device</h1>
      <p class="ems-security-intro">Biometric/PIN unlock and notifications are mandatory for every EMS user on each device.</p>
      <div class="ems-security-requirement" data-security-lock>
        <div><strong>Device biometric/PIN</strong><span></span></div>
        <button type="button">Turn On</button>
      </div>
      <div class="ems-security-requirement" data-security-push>
        <div><strong>Push notifications</strong><span></span></div>
        <button type="button">Turn On</button>
      </div>
      <div class="ems-security-error" role="alert"></div>
      <button class="ems-device-signout" type="button">Sign out instead</button>
    </div>`;
  document.body.appendChild(overlay);

  const lockRow = overlay.querySelector("[data-security-lock]");
  const pushRow = overlay.querySelector("[data-security-push]");
  const lockButton = lockRow.querySelector("button");
  const pushButton = pushRow.querySelector("button");
  const errorBox = overlay.querySelector(".ems-security-error");

  const render = () => {
    lockRow.classList.toggle("is-complete", Boolean(lockStatus.enabled));
    lockRow.querySelector("span").textContent = lockStatus.enabled ? "Enabled on this device" : (lockStatus.reason || "Use fingerprint, face recognition, or device PIN.");
    lockButton.textContent = lockStatus.enabled ? "Enabled" : "Turn On";
    lockButton.disabled = Boolean(lockStatus.enabled) || lockStatus.supported === false;

    pushRow.classList.toggle("is-complete", Boolean(pushStatus.enabled));
    pushRow.querySelector("span").textContent = pushStatus.enabled ? "Enabled on this device" : (pushStatus.reason || "Required for operational and security alerts.");
    pushButton.textContent = pushStatus.enabled ? "Enabled" : "Turn On";
    pushButton.disabled = Boolean(pushStatus.enabled) || pushStatus.supported === false;
  };
  render();

  return new Promise((resolve) => {
    const finishIfComplete = () => {
      render();
      if (!lockStatus.enabled || !pushStatus.enabled) return false;
      securitySetupActive = false;
      overlay.remove();
      resolve(true);
      return true;
    };

    const turnOnLock = async () => {
      lockButton.disabled = true;
      errorBox.textContent = "";
      try {
        lockStatus = await enableDeviceLock(appUser);
        return finishIfComplete();
      } catch (error) {
        errorBox.textContent = error?.name === "NotAllowedError" ? "Biometric/PIN setup was cancelled or timed out." : (error?.message || "Could not enable device unlock.");
        render();
        return false;
      }
    };

    const turnOnPush = async () => {
      pushButton.disabled = true;
      errorBox.textContent = "";
      try {
        pushStatus = await enablePushNotifications();
        return finishIfComplete();
      } catch (error) {
        errorBox.textContent = error?.message || "Could not enable notifications. Allow notifications in this device's browser settings, then try again.";
        render();
        return false;
      }
    };

    lockButton.addEventListener("click", turnOnLock);
    pushButton.addEventListener("click", turnOnPush);

    overlay.querySelector(".ems-device-signout").addEventListener("click", async () => {
      securitySetupActive = false;
      await onSignOut?.();
      resolve(false);
    });

    if (nativeDevicePlugin()) {
      requestAnimationFrame(async () => {
        if (!lockStatus.enabled) await turnOnLock();
        if (lockStatus.enabled && !pushStatus.enabled) await turnOnPush();
      });
    }
  });
}

export function allowDeviceInternalNavigation() {
  internalNavigationUntil = Date.now() + INTERNAL_NAV_WINDOW_MS;
  if (!activeAppUserId) return;
  try {
    sessionStorage.setItem(`${INTERNAL_NAV_PREFIX}${activeAppUserId}`, String(internalNavigationUntil));
  } catch {}
}

export function installDeviceRelock(appUser) {
  activeAppUserId = appUser?.id || "";
  if (!readEnrollment(appUser) || document.documentElement.dataset.emsRelockBound === "true") return;
  document.documentElement.dataset.emsRelockBound = "true";
  document.addEventListener("visibilitychange", () => {
    if (!readEnrollment(appUser)) return;
    if (document.hidden) {
      if (securitySetupActive) return;
      if (internalNavigationUntil > Date.now()) {
        internalNavigationUntil = 0;
        hiddenAt = 0;
        return;
      }
      hiddenAt = Date.now();
      // Remove any unused navigation exception synchronously. Mobile operating
      // systems may kill a closed PWA immediately after this event.
      sessionStorage.removeItem(internalNavigationKey(appUser));
      return;
    }
    if (authenticatorActive) {
      hiddenAt = 0;
      return;
    }
    if (hiddenAt) {
      hiddenAt = 0;
      location.reload();
    }
  });
}
