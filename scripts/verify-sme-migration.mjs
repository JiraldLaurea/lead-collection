/**
 * Disposable schema verification for the additive SME tables.
 *
 * It applies the exact base/SME DDL to a new SQLite database, confirms that every
 * SME table exists, rolls only those tables back, and proves the legacy lead tables
 * remain intact. It never opens data/leads.sqlite or the hosted Turso database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { baseColumnUpgrades, baseDdl, basePostUpgradeDdl } from "./base-schema.mjs";
import { smeColumnUpgrades, smeDdl, smeTables } from "./sme-schema.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "qroad-sme-migration-"));
const databasePath = path.join(root, "verification.sqlite");

function applyColumnUpgrades(db, upgrades) {
  for (const upgrade of upgrades) {
    const columns = new Set(db.prepare(`PRAGMA table_info(${upgrade.table})`).all().map((column) => column.name));
    if (!columns.has(upgrade.column)) db.exec(`ALTER TABLE ${upgrade.table} ADD COLUMN ${upgrade.definition}`);
  }
}

try {
  const db = new DatabaseSync(databasePath);
  for (const statement of [...baseDdl, ...smeDdl]) db.exec(statement);
  applyColumnUpgrades(db, [...baseColumnUpgrades, ...smeColumnUpgrades]);
  for (const statement of basePostUpgradeDdl) db.exec(statement);

  const tableExists = (name) => Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name));
  const missingAfterUp = smeTables.filter((table) => !tableExists(table));
  if (missingAfterUp.length) throw new Error(`Migration did not create: ${missingAfterUp.join(", ")}`);

  for (const table of smeTables) db.exec(`DROP TABLE IF EXISTS ${table}`);
  const remainingSmeTables = smeTables.filter((table) => tableExists(table));
  const preservedLegacyTables = ["leads", "email_logs", "sms_logs"].filter(tableExists);
  db.close();

  if (remainingSmeTables.length) throw new Error(`Rollback did not remove: ${remainingSmeTables.join(", ")}`);
  if (preservedLegacyTables.length !== 3) throw new Error("Rollback removed a legacy lead, email, or SMS table.");

  console.log(JSON.stringify({
    verified: true,
    createdSmeTables: smeTables.length,
    rolledBackSmeTables: smeTables.length,
    preservedLegacyTables
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
