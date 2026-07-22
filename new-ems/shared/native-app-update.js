const RELEASE_API = "https://api.github.com/repos/varadanexus/varada-ems-v2/releases/latest";
const UPDATE_URL = "https://github.com/varadanexus/varada-ems-v2/releases/latest/download/Varada-EMS.apk";
const CACHE_KEY = "ems_native_release_check";
const CACHE_MS = 5 * 60 * 1000;

function versionParts(value) {
  return String(value || "0")
    .replace(/^android-v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0)
    .slice(0, 4);
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function isNativeAndroid() {
  if (!window.Capacitor?.isNativePlatform?.()) return false;
  return String(window.Capacitor?.getPlatform?.() || "android").toLowerCase() === "android";
}

function setPageBlocked(blocked) {
  document.documentElement.classList.toggle("ems-update-blocked", blocked);
  Array.from(document.body?.children || []).forEach((child) => {
    if (child.id === "emsNativeUpdateGate") return;
    if (blocked) child.setAttribute("inert", "");
    else child.removeAttribute("inert");
  });
}

function ensureGate() {
  let gate = document.querySelector("#emsNativeUpdateGate");
  if (gate) return gate;
  gate = document.createElement("section");
  gate.id = "emsNativeUpdateGate";
  gate.className = "ems-native-update";
  gate.setAttribute("role", "alertdialog");
  gate.setAttribute("aria-modal", "true");
  gate.innerHTML = `
    <div class="ems-native-update-card">
      <img src="/new-ems/assets/icons/ems-192.png" alt="Varada Nexus" />
      <span class="ems-native-update-kicker">VARADA NEXUS EMS</span>
      <h1 data-update-title>Checking for updates</h1>
      <p data-update-message>Please wait while EMS verifies the installed application.</p>
      <div class="ems-native-update-versions" data-update-versions hidden></div>
      <div class="ems-native-update-actions"></div>
    </div>`;
  document.body.appendChild(gate);
  setPageBlocked(true);
  return gate;
}

function showGate({ title, message, installedVersion = "", latestVersion = "", mode }) {
  const gate = ensureGate();
  gate.querySelector("[data-update-title]").textContent = title;
  gate.querySelector("[data-update-message]").textContent = message;
  const versions = gate.querySelector("[data-update-versions]");
  versions.hidden = !(installedVersion || latestVersion);
  versions.textContent = installedVersion && latestVersion
    ? `Installed ${installedVersion} · Required ${latestVersion}`
    : "";
  const actions = gate.querySelector(".ems-native-update-actions");
  actions.replaceChildren();

  if (mode === "update") {
    const update = document.createElement("button");
    update.type = "button";
    update.className = "ems-native-update-primary";
    update.textContent = "Update now";
    update.addEventListener("click", () => openUpdateDownload());
    actions.appendChild(update);
  }

  if (mode === "retry" || mode === "update") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "ems-native-update-secondary";
    retry.textContent = mode === "update" ? "Check again" : "Retry";
    retry.addEventListener("click", () => {
      sessionStorage.removeItem(CACHE_KEY);
      enforceNativeAppUpdate({ force: true });
    });
    actions.appendChild(retry);
  }
}

function clearGate() {
  document.querySelector("#emsNativeUpdateGate")?.remove();
  setPageBlocked(false);
}

async function openUpdateDownload() {
  const nativeDevice = window.Capacitor?.Plugins?.NativeDevice;
  try {
    if (!nativeDevice?.openExternal) throw new Error("Native browser bridge unavailable");
    await nativeDevice.openExternal({ url: UPDATE_URL });
  } catch (error) {
    console.warn("Could not open the Android update download.", error);
    showGate({
      title: "Update required",
      message: "Open www.varadanexus.com/install-android.html in your browser to install the required update.",
      mode: "update"
    });
  }
}

async function installedVersion() {
  const info = await window.Capacitor?.Plugins?.App?.getInfo?.();
  const version = String(info?.version || "").trim();
  if (!version) throw new Error("Installed app version is unavailable");
  return version;
}

async function latestReleaseVersion({ force = false } = {}) {
  if (!force) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached?.version && Date.now() - Number(cached.checkedAt || 0) < CACHE_MS) return cached.version;
    } catch (_) {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${RELEASE_API}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Update service returned ${response.status}`);
    const release = await response.json();
    const version = String(release?.tag_name || "").replace(/^android-v/i, "").trim();
    const hasSignedApk = Array.isArray(release?.assets) && release.assets.some((asset) => asset?.name === "Varada-EMS.apk");
    if (!version || !hasSignedApk) throw new Error("Latest signed Android release is unavailable");
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version, checkedAt: Date.now() }));
    return version;
  } finally {
    window.clearTimeout(timeout);
  }
}

let activeCheck = null;

export async function enforceNativeAppUpdate(options = {}) {
  if (!isNativeAndroid()) return true;
  if (activeCheck && !options.force) return activeCheck;

  activeCheck = (async () => {
    showGate({
      title: "Checking for updates",
      message: "Please wait while EMS verifies the installed application.",
      mode: "checking"
    });
    try {
      const [installed, latest] = await Promise.all([
        installedVersion(),
        latestReleaseVersion(options)
      ]);
      if (compareVersions(installed, latest) < 0) {
        showGate({
          title: "Update available",
          message: "This EMS version is no longer supported. Install the latest signed update to continue.",
          installedVersion: installed,
          latestVersion: latest,
          mode: "update"
        });
        return false;
      }
      clearGate();
      return true;
    } catch (error) {
      console.warn("Mandatory Android update verification failed.", error);
      showGate({
        title: "Connection required",
        message: "EMS must verify that this app is up to date. Check your internet connection and try again.",
        mode: "retry"
      });
      return false;
    } finally {
      activeCheck = null;
    }
  })();

  return activeCheck;
}
