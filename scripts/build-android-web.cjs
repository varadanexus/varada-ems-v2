const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.resolve(root, "native-www");
if (path.dirname(output) !== root || path.basename(output) !== "native-www") {
  throw new Error(`Refusing to rebuild unexpected Android web directory: ${output}`);
}

const copyTargets = [
  ["assets", "assets"],
  ["images/logo.png", "images/logo.png"],
  ["images/login-command-centre.png", "images/login-command-centre.png"],
  ["new-ems/assets", "new-ems/assets"],
  ["new-ems/config", "new-ems/config"],
  ["new-ems/modules", "new-ems/modules"],
  ["new-ems/shared", "new-ems/shared"],
  ["new-ems/index.html", "new-ems/index.html"],
  ["new-ems/manifest.webmanifest", "new-ems/manifest.webmanifest"],
  ["new-ems/offline.html", "new-ems/offline.html"],
  ["login.html", "login.html"],
  ["terms-mobile.html", "terms-mobile.html"],
  ["favicon.ico", "favicon.ico"]
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const [sourceName, destinationName] of copyTargets) {
  const source = path.resolve(root, sourceName);
  const destination = path.resolve(output, destinationName);
  if (!fs.existsSync(source)) throw new Error(`Missing Android web asset: ${sourceName}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

// Capacitor requires an index.html at webDir root. The canonical browser login
// remains available as /login.html for every existing EMS redirect.
fs.copyFileSync(path.resolve(root, "login.html"), path.resolve(output, "index.html"));

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else files.push(fullPath);
  }
};
walk(output);

const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
console.log(`Android web bundle ready: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
