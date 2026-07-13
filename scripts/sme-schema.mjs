/**
 * SME Search schema, shared by scripts/init-db.mjs (up) and scripts/rollback-sme.mjs (down)
 * so the two can never drift apart.
 *
 * Every statement is additive and idempotent. No existing table is altered or dropped.
 * Mirrors the SME models in prisma/schema.prisma.
 */

export const smeTables = [
  // Child tables first: rollback drops in this order, so foreign keys never dangle.
  "contact_activities",
  "lead_list_items",
  "lead_lists",
  "sme_lead_scores",
  "sme_classifications",
  "sme_business_profiles",
  "sme_place_references",
  "sme_search_runs",
  "sme_search_zones",
  "franchise_brands",
  "do_not_contact"
];

export const smeDdl = [
  `CREATE TABLE IF NOT EXISTS sme_search_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    commercial_area TEXT NOT NULL,
    road_name TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    radius_meters INTEGER NOT NULL DEFAULT 500,
    priority TEXT NOT NULL DEFAULT 'B',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_scanned_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sme_search_zones_city_area_road_key
    ON sme_search_zones(city, commercial_area, road_name)`,
  `CREATE INDEX IF NOT EXISTS sme_search_zones_enabled_idx ON sme_search_zones(enabled)`,

  `CREATE TABLE IF NOT EXISTS sme_search_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    parameters TEXT NOT NULL,
    status TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0,
    qualified_count INTEGER NOT NULL DEFAULT 0,
    manual_review_count INTEGER NOT NULL DEFAULT 0,
    excluded_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    started_at DATETIME NOT NULL,
    completed_at DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS sme_search_runs_status_idx ON sme_search_runs(status)`,
  `CREATE INDEX IF NOT EXISTS sme_search_runs_started_at_idx ON sme_search_runs(started_at)`,

  `CREATE TABLE IF NOT EXISTS sme_place_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'google_places',
    provider_place_id TEXT NOT NULL UNIQUE,
    source_query TEXT,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at DATETIME
  )`,

  `CREATE TABLE IF NOT EXISTS sme_business_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_place_id TEXT NOT NULL UNIQUE,
    lead_id INTEGER,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    brand_candidate_name TEXT,
    branch_label TEXT,
    internal_category TEXT,
    primary_type TEXT,
    city TEXT,
    commercial_area TEXT,
    formatted_address TEXT,
    latitude REAL,
    longitude REAL,
    phone_number TEXT,
    website_url TEXT,
    website_host TEXT,
    rating REAL,
    review_count INTEGER,
    business_status TEXT,
    google_maps_url TEXT,
    details_fetched INTEGER NOT NULL DEFAULT 0,
    data_source TEXT NOT NULL DEFAULT 'google_places',
    source_query TEXT,
    collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sme_business_profiles_lead_id_fkey FOREIGN KEY (lead_id)
      REFERENCES leads (id) ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS sme_business_profiles_lead_id_idx ON sme_business_profiles(lead_id)`,
  `CREATE INDEX IF NOT EXISTS sme_business_profiles_normalized_name_idx ON sme_business_profiles(normalized_name)`,
  `CREATE INDEX IF NOT EXISTS sme_business_profiles_phone_number_idx ON sme_business_profiles(phone_number)`,
  `CREATE INDEX IF NOT EXISTS sme_business_profiles_website_host_idx ON sme_business_profiles(website_host)`,

  `CREATE TABLE IF NOT EXISTS sme_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL UNIQUE,
    auto_class TEXT NOT NULL,
    effective_class TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    reason_codes TEXT NOT NULL DEFAULT '[]',
    branch_count INTEGER,
    matched_brand_id INTEGER,
    previous_class TEXT,
    override_by TEXT,
    override_reason TEXT,
    overridden_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sme_classifications_business_id_fkey FOREIGN KEY (business_id)
      REFERENCES sme_business_profiles (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS sme_classifications_effective_class_idx ON sme_classifications(effective_class)`,

  `CREATE TABLE IF NOT EXISTS franchise_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT NOT NULL UNIQUE,
    normalized_name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '',
    normalized_aliases TEXT NOT NULL DEFAULT '',
    official_domains TEXT NOT NULL DEFAULT '',
    category TEXT,
    scope TEXT NOT NULL DEFAULT 'PH',
    classification TEXT NOT NULL DEFAULT 'KNOWN_FRANCHISE',
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS franchise_brands_active_idx ON franchise_brands(active)`,
  `CREATE INDEX IF NOT EXISTS franchise_brands_normalized_name_idx ON franchise_brands(normalized_name)`,

  `CREATE TABLE IF NOT EXISTS sme_lead_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    total INTEGER NOT NULL,
    band TEXT NOT NULL,
    factors TEXT NOT NULL DEFAULT '{}',
    calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sme_lead_scores_business_id_fkey FOREIGN KEY (business_id)
      REFERENCES sme_business_profiles (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS sme_lead_scores_business_id_idx ON sme_lead_scores(business_id)`,
  `CREATE INDEX IF NOT EXISTS sme_lead_scores_calculated_at_idx ON sme_lead_scores(calculated_at)`,

  `CREATE TABLE IF NOT EXISTS lead_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS lead_list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    lead_id INTEGER,
    business_id INTEGER,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lead_list_items_list_id_fkey FOREIGN KEY (list_id)
      REFERENCES lead_lists (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT lead_list_items_lead_id_fkey FOREIGN KEY (lead_id)
      REFERENCES leads (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT lead_list_items_business_id_fkey FOREIGN KEY (business_id)
      REFERENCES sme_business_profiles (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS lead_list_items_list_id_lead_id_key ON lead_list_items(list_id, lead_id)`,
  `CREATE INDEX IF NOT EXISTS lead_list_items_list_id_idx ON lead_list_items(list_id)`,

  `CREATE TABLE IF NOT EXISTS contact_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    business_id INTEGER,
    type TEXT NOT NULL,
    channel TEXT,
    status TEXT,
    note TEXT,
    metadata TEXT,
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT contact_activities_lead_id_fkey FOREIGN KEY (lead_id)
      REFERENCES leads (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT contact_activities_business_id_fkey FOREIGN KEY (business_id)
      REFERENCES sme_business_profiles (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS contact_activities_lead_id_idx ON contact_activities(lead_id)`,
  `CREATE INDEX IF NOT EXISTS contact_activities_business_id_idx ON contact_activities(business_id)`,
  `CREATE INDEX IF NOT EXISTS contact_activities_occurred_at_idx ON contact_activities(occurred_at)`,

  `CREATE TABLE IF NOT EXISTS do_not_contact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    normalized_contact TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'sms',
    reason TEXT,
    source TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS do_not_contact_contact_channel_key
    ON do_not_contact(normalized_contact, channel)`,
  `CREATE INDEX IF NOT EXISTS do_not_contact_active_idx ON do_not_contact(active)`
];

/** Applies the SME schema to a Turso/libSQL database when one is configured. */
export async function applySmeSchemaToTurso(statements) {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken || url.startsWith("libsql://replace_with")) return false;

  const { createClient } = await import("@libsql/client");
  const client = createClient({ url, authToken });
  try {
    for (const statement of statements) {
      await client.execute(statement);
    }
  } finally {
    client.close();
  }
  return true;
}
