const LOCK_PREFIX = "ems_device_lock_v1:";
const UNLOCK_PREFIX = "ems_device_unlock_v1:";
const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
let hiddenAt = 0;

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

function unlockKey(appUser) {
  return `${UNLOCK_PREFIX}${appUser.id}`;
}

function readEnrollment(appUser) {
  try { return JSON.parse(localStorage.getItem(userKey(appUser)) || "null"); } catch { return null; }
}

export function deviceLockSupport() {
  const supported = window.isSecureContext && "PublicKeyCredential" in window && Boolean(navigator.credentials);
  return { supported, reason: supported ? "" : "Device biometric/PIN unlock is not supported by this browser." };
}

export function getDeviceLockStatus(appUser) {
  const support = deviceLockSupport();
  return { ...support, enabled: Boolean(appUser?.id && readEnrollment(appUser)) };
}

export async function enableDeviceLock(appUser) {
  const support = deviceLockSupport();
  if (!support.supported) throw new Error(support.reason);
  if (!appUser?.id) throw new Error("A signed-in user is required.");
  const credential = await navigator.credentials.create({
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
  if (!credential) throw new Error("Device lock setup was cancelled.");
  localStorage.setItem(userKey(appUser), JSON.stringify({
    credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    enabledAt: new Date().toISOString(),
    device: navigator.userAgent.slice(0, 250)
  }));
  sessionStorage.setItem(unlockKey(appUser), String(Date.now() + UNLOCK_WINDOW_MS));
  return getDeviceLockStatus(appUser);
}

export function disableDeviceLock(appUser) {
  if (!appUser?.id) return;
  localStorage.removeItem(userKey(appUser));
  sessionStorage.removeItem(unlockKey(appUser));
}

async function verifyDevice(appUser) {
  const enrollment = readEnrollment(appUser);
  if (!enrollment?.credentialId) return true;
  const assertion = await navigator.credentials.get({
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
  if (!assertion) throw new Error("Device verification was cancelled.");
  sessionStorage.setItem(unlockKey(appUser), String(Date.now() + UNLOCK_WINDOW_MS));
  return true;
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
    unlock.addEventListener("click", async () => {
      unlock.disabled = true;
      error.textContent = "";
      try {
        await verifyDevice(appUser);
        overlay.remove();
        resolve(true);
      } catch (cause) {
        error.textContent = cause?.name === "NotAllowedError" ? "Unlock was cancelled or timed out." : (cause?.message || "Could not verify this device.");
        unlock.disabled = false;
      }
    });
    overlay.querySelector(".ems-device-signout").addEventListener("click", async () => {
      await onSignOut?.();
      resolve(false);
    });
  });
}

export async function enforceDeviceUnlock(appUser, onSignOut) {
  const enrollment = readEnrollment(appUser);
  if (!enrollment) return true;
  const unlockedUntil = Number(sessionStorage.getItem(unlockKey(appUser)) || 0);
  if (unlockedUntil > Date.now()) return true;
  return lockOverlay(appUser, onSignOut);
}

export async function verifyDeviceLockNow(appUser) {
  return verifyDevice(appUser);
}

export function installDeviceRelock(appUser) {
  if (!readEnrollment(appUser) || document.documentElement.dataset.emsRelockBound === "true") return;
  document.documentElement.dataset.emsRelockBound = "true";
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > 60_000) {
      sessionStorage.removeItem(unlockKey(appUser));
      location.reload();
    }
    hiddenAt = 0;
  });
}
