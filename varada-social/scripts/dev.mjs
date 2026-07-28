import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const emsRuntime = readFileSync(resolve(moduleRoot, "..", "new-ems", "config", "runtime.js"), "utf8");
const url = emsRuntime.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
const runtimeAnon = emsRuntime.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
if (!url || !runtimeAnon) {
  throw new Error("The EMS Supabase runtime configuration is incomplete.");
}
const projectRef = new URL(url).hostname.split(".")[0];
let anonKey = runtimeAnon;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!serviceRoleKey) {
  try {
    const executable = process.platform === "win32" ? "supabase.cmd" : "supabase";
    const output = execFileSync(
      executable,
      ["projects", "api-keys", "--project-ref", projectRef, "--reveal", "--output", "json"],
      {
        encoding: "utf8",
        windowsHide: true,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const keys = JSON.parse(output);
    anonKey = keys.find((item) => item.name === "anon")?.api_key || anonKey;
    serviceRoleKey = keys.find((item) => item.name === "service_role")?.api_key || "";
  } catch {
    console.warn("Nexus Social: Supabase service access was not resolved. Configure SUPABASE_SERVICE_ROLE_KEY for server features.");
  }
}

const stableLocalSecret = serviceRoleKey
  ? createHash("sha256").update(`${serviceRoleKey}:varada-social-local`).digest("hex")
  : process.env.APP_ENCRYPTION_KEY || "";
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY || stableLocalSecret,
  CRON_SECRET: process.env.CRON_SECRET || stableLocalSecret,
  WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET || stableLocalSecret,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, ["run", "dev:next"], {
  cwd: moduleRoot,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
  windowsHide: true,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
