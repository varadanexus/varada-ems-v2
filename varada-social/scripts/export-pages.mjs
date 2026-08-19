import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destinationRoot = path.resolve(
  process.argv[2] || path.join(projectRoot, "..", ".pages-dist"),
);
const socialRoot = path.join(destinationRoot, "social-media");
const appOutput = path.join(projectRoot, ".next", "server", "app");
const routes = [
  "dashboard",
  "create",
  "content",
  "calendar",
  "approvals",
  "trends",
  "analytics",
  "instagram",
  "inbox",
  "accounts",
  "campaigns",
  "ads/analytics",
  "settings",
  "audit",
];

await rm(socialRoot, { recursive: true, force: true });
await mkdir(socialRoot, { recursive: true });
await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(socialRoot, "_next", "static"),
  { recursive: true },
);

for (const route of routes) {
  const source = path.join(appOutput, `${route}.html`);
  await copyFile(source, path.join(socialRoot, `${route.replaceAll("/", "-")}.html`));
  const directory = path.join(socialRoot, route);
  await mkdir(directory, { recursive: true });
  await copyFile(source, path.join(directory, "index.html"));
}

await copyFile(
  path.join(appOutput, "dashboard.html"),
  path.join(socialRoot, "index.html"),
);
await copyFile(
  path.join(projectRoot, "app", "favicon.ico"),
  path.join(socialRoot, "favicon.ico"),
);

console.log(`Exported Nexus Social static pages to ${socialRoot}`);
