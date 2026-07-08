const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const canonicalDir = path.join(root, "new-ems", "supabase", "migrations");
const forbiddenDir = path.join(root, "supabase", "migrations");
const errors = [];

if (!fs.existsSync(path.join(root, "new-ems", "supabase", "config.toml"))) {
  errors.push("Missing canonical Supabase config: new-ems/supabase/config.toml");
}

const canonicalFiles = fs.existsSync(canonicalDir)
  ? fs.readdirSync(canonicalDir).filter((name) => name.endsWith(".sql"))
  : [];
const versions = new Map();

for (const name of canonicalFiles) {
  const match = name.match(/^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/);
  if (!match) {
    errors.push(`Invalid canonical migration filename: ${name}`);
    continue;
  }
  const version = match[1];
  const prior = versions.get(version);
  if (prior) errors.push(`Duplicate migration version ${version}: ${prior}, ${name}`);
  versions.set(version, name);
}

const forbiddenFiles = fs.existsSync(forbiddenDir)
  ? fs.readdirSync(forbiddenDir).filter((name) => name.endsWith(".sql"))
  : [];
if (forbiddenFiles.length) {
  errors.push(
    `Inactive supabase/migrations contains SQL: ${forbiddenFiles.join(", ")}`
  );
}

if (errors.length) {
  console.error("Supabase migration guard failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(
  `Supabase migration guard passed: ${canonicalFiles.length} canonical migrations, one active root.`
);
