/**
 * Rollback for the SME Search schema.
 *
 * Drops only the tables listed in scripts/sme-schema.mjs. Existing application tables
 * (leads, search_jobs, email_logs, sms_logs, csv_imports, ...) are never touched, and
 * nothing in `leads` is modified: SmeBusinessProfile.lead_id is the child side of the
 * relation, so dropping it leaves lead rows intact.
 *
 * Usage:
 *   node scripts/rollback-sme.mjs             # local data/leads.sqlite (+ Turso if configured)
 *   node scripts/rollback-sme.mjs --db <path> # a specific SQLite file (used by tests)
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { smeTables } from "./sme-schema.mjs";

const dbFlagIndex = process.argv.indexOf("--db");
const dbPath =
  dbFlagIndex >= 0 && process.argv[dbFlagIndex + 1]
    ? path.resolve(process.argv[dbFlagIndex + 1])
    : path.join(process.cwd(), "data", "leads.sqlite");

if (!fs.existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(1);
}

const dropStatements = smeTables.map((table) => `DROP TABLE IF EXISTS ${table}`);

const db = new DatabaseSync(dbPath);
for (const statement of dropStatements) {
  db.exec(statement);
}
db.close();
console.log(`Dropped ${smeTables.length} SME tables from ${dbPath}`);

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (url && authToken && !url.startsWith("libsql://replace_with")) {
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url, authToken });
  try {
    for (const statement of dropStatements) {
      await client.execute(statement);
    }
    console.log("Dropped SME tables from Turso database");
  } finally {
    client.close();
  }
} else {
  console.log("Turso not configured; skipped remote rollback");
}
