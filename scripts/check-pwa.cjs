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
}

const login = read("login.html");
const runtime = read("new-ems/config/runtime.js");
const serviceWorker = read("sw.js");
assert(login.includes('rel="manifest" href="/new-ems/manifest.webmanifest"'), "Canonical login page is missing the manifest link.");
assert(runtime.includes('navigator.serviceWorker') === false, "Service worker registration should remain isolated in pwa.js.");
assert(read("new-ems/shared/pwa.js").includes('navigator.serviceWorker.register("/sw.js", { scope: "/" })'), "PWA client does not register the root service worker.");
assert(serviceWorker.includes('request.method !== "GET"'), "Service worker must ignore write requests.");
assert(serviceWorker.includes('url.origin !== self.location.origin'), "Service worker must ignore cross-origin API traffic.");
assert(serviceWorker.includes('url.search === ""'), "Service worker must not cache query-string assets.");
assert(serviceWorker.includes('new Response(html'), "Service worker must neutralize clean-URL redirects for the offline fallback.");

if (errors.length) {
  console.error(`PWA validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("PWA validation passed: manifest, icons, registration, and safe-cache guards are present.");
