import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const localPath = path.join(root, ".env.local");
const hostedPath = path.join(root, ".env.hosted");
const workerPath = path.join(root, ".env.smpp-worker");

function parseEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function shouldReplace(value) {
  return !value || value.includes("replace_with_");
}

function setValue(source, key, value, { overwrite = true } = {}) {
  if (!value || value.startsWith("replace_with_")) return source;
  const expression = new RegExp(`^${key}=.*$`, "m");
  const existing = source.match(expression)?.[0]?.slice(key.length + 1);
  if (existing !== undefined && !overwrite && !shouldReplace(existing)) return source;
  return expression.test(source) ? source.replace(expression, `${key}=${value}`) : `${source.trimEnd()}\n${key}=${value}\n`;
}

function randomSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

if (!existsSync(localPath) || !existsSync(hostedPath)) {
  throw new Error("Both .env.local and .env.hosted must exist.");
}

const local = parseEnv(await readFile(localPath, "utf8"));
let hosted = await readFile(hostedPath, "utf8");

for (const key of [
  "SERPER_API_KEY",
  "SERPER_PLACES_MAX_PAGES",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_FROM_NAME",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN"
]) {
  hosted = setValue(hosted, key, local.get(key));
}

for (const key of ["SESSION_SECRET", "CRON_SECRET", "SMPP_WORKER_API_TOKEN", "SMPP_WORKER_CALLBACK_SECRET"]) {
  const current = parseEnv(hosted).get(key);
  if (shouldReplace(current)) hosted = setValue(hosted, key, randomSecret());
}

await writeFile(hostedPath, hosted, "utf8");

const hostedValues = parseEnv(hosted);
const workerLines = [
  "# Static-IP SMPP worker configuration. Keep this file off Vercel and out of Git.",
  "NODE_ENV=production",
  "SMPP_WORKER_PORT=8080",
  `SMPP_WORKER_API_TOKEN=${hostedValues.get("SMPP_WORKER_API_TOKEN")}`,
  `SMPP_WORKER_CALLBACK_SECRET=${hostedValues.get("SMPP_WORKER_CALLBACK_SECRET")}`,
  `SMPP_DLR_CALLBACK_URL=${hostedValues.get("SMPP_DLR_CALLBACK_URL")}`,
  ...[
    "SMPP_HOST", "SMPP_PORT", "SMPP_SYSTEM_ID", "SMPP_PASSWORD", "SMPP_BIND_TYPE",
    "SMPP_SOURCE_ADDR", "SMPP_SOURCE_ADDR_SMART", "SMPP_SOURCE_ADDR_GLOBE",
    "SMPP_SOURCE_ADDR_TON", "SMPP_SOURCE_ADDR_NPI", "SMPP_DEST_ADDR_TON",
    "SMPP_DEST_ADDR_NPI", "SMPP_REGISTERED_DELIVERY", "SMPP_TPS"
  ].map((key) => `${key}=${local.get(key) || "replace_with_worker_value"}`),
  ""
];
await writeFile(workerPath, workerLines.join("\n"), "utf8");

const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "BLOB_READ_WRITE_TOKEN", "ADMIN_PASSWORD_HASH"]
  .filter((key) => shouldReplace(hostedValues.get(key)));
console.log(`Hosted environment prepared. Missing values: ${missing.join(", ") || "none"}`);
