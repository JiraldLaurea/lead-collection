import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySmeSchemaToTurso, smeDdl } from "./sme-schema.mjs";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "leads.sqlite");
const db = new DatabaseSync(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  category TEXT,
  formatted_address TEXT,
  phone_number TEXT,
  website_url TEXT,
  google_maps_url TEXT,
  rating REAL,
  review_count INTEGER,
  business_status TEXT,
  opening_hours TEXT,
  search_keyword TEXT NOT NULL,
  search_location TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'serper_places_api',
  collected_at DATETIME NOT NULL,
  last_refreshed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_keyword TEXT NOT NULL,
  search_location TEXT NOT NULL,
  search_type TEXT NOT NULL,
  status TEXT NOT NULL,
  total_found INTEGER DEFAULT 0,
  total_saved INTEGER DEFAULT 0,
  total_duplicates INTEGER DEFAULT 0,
  error_message TEXT,
  started_at DATETIME NOT NULL,
  finished_at DATETIME
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  endpoint TEXT,
  error_code TEXT,
  error_message TEXT,
  request_context TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  error_message TEXT,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  body TEXT,
  provider_message_id TEXT,
  delivery_status TEXT,
  delivery_error TEXT,
  delivery_receipt TEXT,
  delivered_at DATETIME,
  error_message TEXT,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sms_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS csv_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imported_csv_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  client_id TEXT,
  business_name TEXT NOT NULL,
  industry TEXT,
  city_area TEXT,
  priority TEXT,
  lead_source TEXT,
  contact_name TEXT,
  phone_number TEXT,
  email TEXT,
  social_url TEXT,
  status TEXT,
  package_name TEXT,
  estimated_monthly_fee TEXT,
  ad_budget TEXT,
  last_contact TEXT,
  next_follow_up TEXT,
  owner TEXT,
  main_goal TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT imported_csv_leads_import_id_fkey FOREIGN KEY (import_id) REFERENCES csv_imports (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS leads_search_keyword_idx ON leads(search_keyword);
CREATE INDEX IF NOT EXISTS leads_search_location_idx ON leads(search_location);
CREATE INDEX IF NOT EXISTS leads_category_idx ON leads(category);
CREATE INDEX IF NOT EXISTS access_logs_decision_idx ON access_logs(decision);
CREATE INDEX IF NOT EXISTS access_logs_created_at_idx ON access_logs(created_at);
CREATE INDEX IF NOT EXISTS api_error_logs_provider_idx ON api_error_logs(provider);
CREATE INDEX IF NOT EXISTS search_jobs_status_idx ON search_jobs(status);
CREATE INDEX IF NOT EXISTS email_logs_sent_at_idx ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS email_logs_status_idx ON email_logs(status);
CREATE INDEX IF NOT EXISTS sms_logs_sent_at_idx ON sms_logs(sent_at);
CREATE INDEX IF NOT EXISTS sms_logs_status_idx ON sms_logs(status);
CREATE INDEX IF NOT EXISTS csv_imports_imported_at_idx ON csv_imports(imported_at);
CREATE INDEX IF NOT EXISTS imported_csv_leads_import_id_idx ON imported_csv_leads(import_id);
CREATE INDEX IF NOT EXISTS imported_csv_leads_business_name_idx ON imported_csv_leads(business_name);
`);

const leadColumns = new Set(db.prepare("PRAGMA table_info(leads)").all().map((column) => column.name));
const addLeadColumn = (name, definition) => {
  if (!leadColumns.has(name)) {
    db.exec(`ALTER TABLE leads ADD COLUMN ${definition}`);
  }
};

addLeadColumn("email", "email TEXT");
addLeadColumn("email_source", "email_source TEXT");
addLeadColumn("email_status", "email_status TEXT");
addLeadColumn("email_checked_at", "email_checked_at DATETIME");

const smsLogColumns = new Set(db.prepare("PRAGMA table_info(sms_logs)").all().map((column) => column.name));
const addSmsLogColumn = (name, definition) => {
  if (!smsLogColumns.has(name)) {
    db.exec(`ALTER TABLE sms_logs ADD COLUMN ${definition}`);
  }
};

addSmsLogColumn("delivery_status", "delivery_status TEXT");
addSmsLogColumn("delivery_error", "delivery_error TEXT");
addSmsLogColumn("delivery_receipt", "delivery_receipt TEXT");
addSmsLogColumn("delivered_at", "delivered_at DATETIME");
db.exec("CREATE INDEX IF NOT EXISTS sms_logs_delivery_status_idx ON sms_logs(delivery_status)");

// SME Search tables. Additive and idempotent: existing tables and rows are untouched.
for (const statement of smeDdl) {
  db.exec(statement);
}

db.close();
console.log(`SQLite database initialized at ${dbPath}`);

// Hosted environments run on Turso. Without this the local file and the hosted database
// drift, and the SME tables would be missing in production while local tests pass.
const appliedToTurso = await applySmeSchemaToTurso(smeDdl);
console.log(
  appliedToTurso
    ? "SME schema applied to Turso database"
    : "Turso not configured; skipped remote schema apply"
);
