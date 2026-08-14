/**
 * The application's base schema (everything that existed before SME Search).
 *
 * This used to live as one `db.exec()` string inside init-db.mjs, which meant it was only
 * ever applied to the local SQLite file. The hosted Turso database therefore never received
 * it — a hosted deployment would start with **no tables at all**. Extracting it here lets the
 * same statements be applied to both, so local and hosted cannot drift.
 *
 * Every statement is additive and idempotent.
 */

export const baseTables = [
  "leads",
  "search_jobs",
  "access_logs",
  "api_error_logs",
  "app_settings",
  "email_logs",
  "sms_logs",
  "csv_imports",
  "imported_csv_leads"
];

export const baseDdl = [
  `CREATE TABLE IF NOT EXISTS leads (
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
  )`,

  `CREATE TABLE IF NOT EXISTS search_jobs (
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
  )`,

  `CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS api_error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    endpoint TEXT,
    error_code TEXT,
    error_message TEXT,
    request_context TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS email_logs (
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
    CONSTRAINT email_logs_lead_id_fkey FOREIGN KEY (lead_id)
      REFERENCES leads (id) ON DELETE SET NULL ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS sms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    business_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT,
    body TEXT,
    batch_key TEXT,
    provider_message_id TEXT,
    delivery_status TEXT,
    delivery_error TEXT,
    delivery_receipt TEXT,
    delivered_at DATETIME,
    error_message TEXT,
    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sms_logs_lead_id_fkey FOREIGN KEY (lead_id)
      REFERENCES leads (id) ON DELETE SET NULL ON UPDATE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS csv_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS imported_csv_leads (
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
    CONSTRAINT imported_csv_leads_import_id_fkey FOREIGN KEY (import_id)
      REFERENCES csv_imports (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  `CREATE INDEX IF NOT EXISTS leads_search_keyword_idx ON leads(search_keyword)`,
  `CREATE INDEX IF NOT EXISTS leads_search_location_idx ON leads(search_location)`,
  `CREATE INDEX IF NOT EXISTS leads_category_idx ON leads(category)`,
  `CREATE INDEX IF NOT EXISTS access_logs_decision_idx ON access_logs(decision)`,
  `CREATE INDEX IF NOT EXISTS access_logs_created_at_idx ON access_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS api_error_logs_provider_idx ON api_error_logs(provider)`,
  `CREATE INDEX IF NOT EXISTS search_jobs_status_idx ON search_jobs(status)`,
  `CREATE INDEX IF NOT EXISTS email_logs_sent_at_idx ON email_logs(sent_at)`,
  `CREATE INDEX IF NOT EXISTS email_logs_status_idx ON email_logs(status)`,
  `CREATE INDEX IF NOT EXISTS sms_logs_sent_at_idx ON sms_logs(sent_at)`,
  `CREATE INDEX IF NOT EXISTS sms_logs_status_idx ON sms_logs(status)`,
  `CREATE INDEX IF NOT EXISTS sms_logs_delivery_status_idx ON sms_logs(delivery_status)`,
  `CREATE INDEX IF NOT EXISTS csv_imports_imported_at_idx ON csv_imports(imported_at)`,
  `CREATE INDEX IF NOT EXISTS imported_csv_leads_import_id_idx ON imported_csv_leads(import_id)`,
  `CREATE INDEX IF NOT EXISTS imported_csv_leads_business_name_idx ON imported_csv_leads(business_name)`
];

// These indexes depend on columns that may need to be added to existing tables first.
export const basePostUpgradeDdl = [
  `CREATE INDEX IF NOT EXISTS sms_logs_batch_key_idx ON sms_logs(batch_key)`
];

/**
 * Columns added to base tables after they first shipped. `CREATE TABLE IF NOT EXISTS` is a
 * no-op on an existing table, so these need an explicit additive ALTER.
 */
export const baseColumnUpgrades = [
  { table: "leads", column: "email", definition: "email TEXT" },
  { table: "leads", column: "email_source", definition: "email_source TEXT" },
  { table: "leads", column: "email_status", definition: "email_status TEXT" },
  { table: "leads", column: "email_checked_at", definition: "email_checked_at DATETIME" },
  { table: "sms_logs", column: "delivery_status", definition: "delivery_status TEXT" },
  { table: "sms_logs", column: "delivery_error", definition: "delivery_error TEXT" },
  { table: "sms_logs", column: "delivery_receipt", definition: "delivery_receipt TEXT" },
  { table: "sms_logs", column: "delivered_at", definition: "delivered_at DATETIME" },
  { table: "sms_logs", column: "batch_key", definition: "batch_key TEXT" }
];
