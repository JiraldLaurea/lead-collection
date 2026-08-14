/**
 * Creates or upgrades the database schema.
 *
 * Applies the same statements to the local SQLite file and, when Turso credentials are
 * present, to the hosted database. Previously the base schema was only ever applied locally,
 * so a hosted deployment started with no tables at all.
 *
 * Everything here is additive and idempotent: existing tables and rows are never touched.
 *
 *   npm run db:push      # local, plus Turso if TURSO_* is set in the loaded env file
 *   node --env-file=.env.hosted scripts/init-db.mjs   # push to the hosted database
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { baseColumnUpgrades, baseDdl, basePostUpgradeDdl } from "./base-schema.mjs";
import { smeColumnUpgrades, smeDdl } from "./sme-schema.mjs";

const ddl = [...baseDdl, ...smeDdl];
const columnUpgrades = [...baseColumnUpgrades, ...smeColumnUpgrades];

// ── Local SQLite ────────────────────────────────────────────────────────────
const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "leads.sqlite");
const db = new DatabaseSync(dbPath);

for (const statement of ddl) {
  db.exec(statement);
}

for (const upgrade of columnUpgrades) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${upgrade.table})`).all().map((column) => column.name));
  if (!columns.has(upgrade.column)) {
    db.exec(`ALTER TABLE ${upgrade.table} ADD COLUMN ${upgrade.definition}`);
  }
}

for (const statement of basePostUpgradeDdl) db.exec(statement);

db.close();
console.log(`Local SQLite database initialized at ${dbPath}`);

// ── Hosted (Turso) ──────────────────────────────────────────────────────────
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken || url.startsWith("libsql://replace_with")) {
  console.log("Turso not configured; skipped the hosted database.");
} else {
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url, authToken });

  try {
    for (const statement of ddl) {
      await client.execute(statement);
    }

    for (const upgrade of columnUpgrades) {
      try {
        await client.execute(`ALTER TABLE ${upgrade.table} ADD COLUMN ${upgrade.definition}`);
      } catch (error) {
        // SQLite has no "ADD COLUMN IF NOT EXISTS"; an already-present column is a success.
        if (!/duplicate column/i.test(String(error?.message ?? error))) throw error;
      }
    }

    for (const statement of basePostUpgradeDdl) await client.execute(statement);

    const tables = await client.execute(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    console.log(`Hosted Turso database initialized (${tables.rows[0].n} tables).`);
  } finally {
    client.close();
  }
}
