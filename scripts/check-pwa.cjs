const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const errors = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) errors.push(message); };

let manifest;
try {
  manifest = JSON.parse(read("new-ems/manifest.webmanifest"));
} catch (error) {
  errors.push(`Manifest is not valid JSON: ${error.message}`);
}

if (manifest) {
  assert(manifest.name === "Varada Nexus EMS", "Manifest name is missing or incorrect.");
  assert(manifest.start_url === "/login.html", "Manifest must start at the canonical login page.");
  assert(manifest.scope === "/", "Manifest scope must include both login and EMS modules.");
  assert(manifest.display === "standalone", "Manifest display must be standalone.");
  assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === "192x192"), "Manifest needs a 192px icon.");
  assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === "512x512"), "Manifest needs a 512px icon.");
}

const expectedIcons = [
  ["new-ems/assets/icons/ems-180.png", 180],
  ["new-ems/assets/icons/ems-192.png", 192],
  ["new-ems/assets/icons/ems-notification-badge.png", 96],
  ["new-ems/assets/icons/notification-transparent.png", 1],
  ["new-ems/assets/icons/ems-512.png", 512],
  ["new-ems/assets/icons/ems-maskable-512.png", 512]
];

for (const [file, expectedSize] of expectedIcons) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing icon: ${file}`);
    continue;
  }
  const png = fs.readFileSync(absolute);
  assert(png.toString("ascii", 1, 4) === "PNG", `${file} is not a PNG.`);
  assert(png.readUInt32BE(16) === expectedSize && png.readUInt32BE(20) === expectedSize, `${file} must be ${expectedSize}x${expectedSize}.`);
  if (file.includes("notification-badge")) {
    assert(png[25] === 6, `${file} must retain an RGBA transparency channel for Android status-bar masking.`);
  }
}

const login = read("login.html");
const runtime = read("new-ems/config/runtime.js");
const serviceWorker = read("sw.js");
const layout = read("new-ems/shared/layout.js");
const pushClient = read("new-ems/shared/push-notifications.js");
const deviceSecurity = read("new-ems/shared/device-security.js");
assert(login.includes('rel="manifest" href="/new-ems/manifest.webmanifest"'), "Canonical login page is missing the manifest link.");
assert(login.includes('name="mobile-web-app-capable" content="yes"'), "Canonical login page is missing the standard mobile web app capability meta tag.");
assert(runtime.includes('navigator.serviceWorker') === false, "Service worker registration should remain isolated in pwa.js.");
assert(read("new-ems/shared/pwa.js").includes('navigator.serviceWorker.register("/sw.js", { scope: "/" })'), "PWA client does not register the root service worker.");
assert(serviceWorker.includes('request.method !== "GET"'), "Service worker must ignore write requests.");
assert(serviceWorker.includes('url.origin !== self.location.origin'), "Service worker must ignore cross-origin API traffic.");
assert(serviceWorker.includes('url.search === ""'), "Service worker must not cache query-string assets.");
assert(serviceWorker.includes('new Response(html'), "Service worker must neutralize clean-URL redirects for the offline fallback.");
assert(serviceWorker.includes("self.skipWaiting()"), "Security service-worker releases must activate without a stale-worker grace period.");
assert(serviceWorker.includes('addEventListener("push"'), "Service worker is missing its Web Push handler.");
assert(serviceWorker.includes('showNotification('), "Push events must display a user-visible notification.");
assert(!serviceWorker.includes('icon: payload.icon'), "Expanded notifications must not duplicate the installed app logo.");
assert(serviceWorker.includes('action: "open"'), "Push notifications should expose an Open EMS action.");
assert(serviceWorker.indexOf("existing.navigate(target)") < serviceWorker.indexOf("existing.focus()"), "Notification clicks must navigate before focusing to avoid the biometric relock race.");
assert(pushClient.includes("userVisibleOnly: true"), "Push subscriptions must require user-visible notifications.");
assert(pushClient.includes("upsert_my_push_subscription"), "Push subscriptions must be bound to the signed-in EMS user.");
assert(deviceSecurity.includes('authenticatorAttachment: "platform"'), "Device lock must use the device platform authenticator.");
assert(deviceSecurity.includes('userVerification: "required"'), "Device lock must require biometric/PIN user verification.");
assert(deviceSecurity.includes("enforceMandatorySecuritySetup"), "Protected EMS users must be gated until device lock and push are enabled.");
assert(layout.includes("if (isMobileSecurityDevice())"), "Mandatory biometric and push setup must remain mobile-only.");
assert(!layout.includes('label.closest(".form-group,.form-field,.field,.input-group,[data-field]") || label.parentElement'), "Financial redaction must never fall back to removing an entire flat form.");

if (errors.length) {
  console.error(`PWA validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("PWA validation passed: install, push, device lock, and safe-cache guards are present.");
