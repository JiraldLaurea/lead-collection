# Gap Analysis — QROAD Metro Manila SME Sales Intelligence System (Work Order v1.0, 13 Jul 2026)

Compares the current codebase (office-LAN lead collection + outreach tool) against the updated work order.

## Summary

The current app covers **discovery (via the wrong provider)** and **outreach (which is out of MVP scope in the new work order)**. Nearly everything the work order treats as the core value — search zones, franchise exclusion, enrichment, AI audit, lead scoring, CRM pipeline, RBAC, compliance controls — does not exist yet.

| Work order section | Status |
| --- | --- |
| 5. Seed data & search zones | Missing |
| 6. Google Places API (New) integration | **Conflict** — uses Serper, not Google |
| 7. Discovery & enrichment workflow | Partial (discovery only, no states, no enrichment beyond email lookup) |
| 8. Franchise / chain exclusion | Missing |
| 9. Database design | Missing (~3 of 18 required tables exist, on SQLite not PostgreSQL) |
| 10. Digital audit + AI | Missing |
| 11. Lead scoring & service recommendation | Missing |
| 12. Sales CRM | Missing |
| 13. UI (dashboard, map, lead list, review queues) | Partial (basic dashboard + lead list) |
| 14. Background jobs | Partial (single automation tick for email) |
| 15. Security / privacy / compliance | Partial (auth + IP allowlist; no RBAC, no DNC, no audit log) |
| 16. Logging, monitoring, cost control | Partial (error log; no budgets, no API cost tracking) |
| 17. API standards (`/api/v1`, OpenAPI) | Missing |
| 18. Testing & QA | Partial (2 test files) |

---

## 1. Blocking conflicts (decide before any build work)

### 1.1 Data provider: Serper vs Google Places API (New)
[lib/places.ts](../lib/places.ts) calls `https://google.serper.dev/places`. The work order mandates Places API (New) (`places:searchNearby`, `places:searchText`, `places:get`) with a Google Cloud project, restricted credentials, and staged field masks (§6). Non-acceptance condition §20.1 explicitly fails a build that uses scraped Google Maps content instead of approved APIs — Serper is a third-party Google SERP scraper and will not pass.

Consequences: Serper returns no real Google `place_id` (the code synthesizes `serper:<sha1>` fallbacks), which breaks the work order's primary durable key, the idempotent upsert requirement, and the 0% duplicate acceptance target.

### 1.2 Database: SQLite vs PostgreSQL + PostGIS
[prisma/schema.prisma](../prisma/schema.prisma) is `provider = "sqlite"`. Work order §4.1 requires PostgreSQL, with PostGIS for road geometry, search points, radius checks, and proximity-based dedupe. SQLite cannot do the spatial work at all.

### 1.3 Missing infrastructure: Redis, job queue, object storage
No Redis (rate limiting, job locks), no queue (BullMQ/Celery — §14 requires idempotency keys, backoff, dead-letter queues, resumable jobs), no S3-compatible storage (imports, exports, audit artifacts). Today the only background work is a single `/api/automation/tick` cron for auto-email.

### 1.4 Product scope inversion
Email/SMS/SMPP outreach is the bulk of the current codebase. The work order puts automated mass messaging **out of MVP scope** (§2.2) and requires opt-out/DNC enforcement (§15.3) before any outbound. The existing outreach features are not credit toward this MVP and currently violate §20.1 (DNC controls missing or bypassable).

---

## 2. Missing features by section

### §5 Seed data and search-zone management — none
- Excel importer for `Metro_Manila_Major_Commercial_Roads_EN.xlsx` (city, road, commercial area, priority) — the file itself isn't in the repo.
- `search_zones` and `search_points` tables; geometry (LineString/Polygon); per-zone `search_interval_m` / `search_radius_m` with admin override.
- Search-point generation from road geometry by density tier (200–300 m / 300–500 m / 500–800 m).
- Coverage tracking, re-scan/incremental refresh, pause/resume/cancel/retry, pre-run API call estimate.
- Current search is a free-text keyword + city box ([components/SearchForm.tsx](../components/SearchForm.tsx)) with no geography model.

### §6 Google integration — none of the required controls
- Staged field masks (Stage 1 IDs → Stage 2 basics → Stage 3 contact → Stage 4 scoring) with per-request logging of field mask and estimated SKU/billing category.
- `nextPageToken` pagination for Text Search; `maxResultCount` / `rankPreference` (DISTANCE vs POPULARITY) for Nearby Search.
- `google_place_references` with `google_last_fetched_at`, `source_method`, `source_request_id`, `field_mask`, `refresh_due_at`.
- Google attribution, caching-policy compliance, data-origin labels (Google-derived vs QROAD-generated).
- Optional Places Aggregate API for density.

### §7 Workflow & enrichment — mostly missing
- The 11-state lead lifecycle (`DISCOVERED` → … → `READY_FOR_SALES`). Current `Lead` has no lifecycle field at all.
- Website canonicalization, social account discovery (Facebook / Instagram / TikTok / Messenger), contact-form detection.
- Confidence model (`Verified` / `High` / `Medium` / `Low`) with `source_url`, `collected_at`, `verified_at`, `verification_method`.
- Duplicate consolidation with merge history (name+address, domain+proximity, phone+proximity, near-name distance threshold).
- Only [lib/email-discovery.ts](../lib/email-discovery.ts) exists — a single email lookup with no confidence, source URL, or verification record.

### §8 Franchise / large-chain exclusion — none
- `franchise_brands` master table (canonical name, aliases, official domains, category, classification, country scope) — **admin-editable, not hard-coded** (hard-coding is a §20.1 non-acceptance condition).
- Business-name normalization producing `normalized_name`, `brand_candidate_name`, `branch_label`.
- Branch-count estimation and the 1 / 2–5 / 6–9 / 10+ classification thresholds, configurable.
- Manual-review queue and reversible batch reclassification.
- Note: the current `excludedLeadCategories` list in [lib/places.ts](../lib/places.ts) is a hard-coded *category* filter (parks, schools, churches) — unrelated to chain exclusion.

### §9 Database — 15 of 18 tables missing
Existing: `leads`, `search_jobs`, `access_logs`, `api_error_logs`, `app_settings`, `email_logs`, `sms_logs`, `csv_imports`, `imported_csv_leads`.

Required and absent: `search_zones`, `search_points`, `discovery_runs`, `discovery_requests`, `google_place_references`, `businesses`, `business_locations`, `business_categories`, `franchise_brands`, `contacts`, `social_accounts`, `websites`, `digital_audits`, `lead_scores`, `service_recommendations`, `crm_activities`, `opportunities`, `do_not_contact`, `audit_logs`.

Also missing: the business/location split (one canonical business, N branch locations), classification fields (`sme_classification`, `estimated_branch_count`, `classification_confidence`, `classification_reason`), `data_quality_score`, `assigned_owner_id`, and the §9.4 provenance fields on every data point.

### §10 Digital marketing audit + AI — none
No OpenAI integration exists anywhere. Required: rule-based audit (website / Facebook / Instagram / TikTok / local visibility / conversion / content, each 0–5), AI structured JSON output validated against a versioned schema, storage of model name + prompt version + input hash + tokens/cost, evidence citation, low-confidence → manual review, and human approve/edit/reject/regenerate without overwriting the AI original.

### §11 Lead scoring — none
100-point model (SME confidence 25 / digital need 25 / business potential 20 / contact availability 20 / area value 10), S/A/B/C priority bands, QROAD service mapping (Voucher Hunt, loyalty, Meta ads, influencer, e-commerce, etc.), `score_model_version` with recalculation creating new records rather than overwriting, and a per-factor UI explanation.

### §12 Sales CRM — none
13-stage pipeline (`NEW` → … → `WON`/`LOST`/`NURTURE`/`DO_NOT_CONTACT`), lead ownership/assignment, activity timeline (call, email, DM, contact form, meeting, proposal, note, status change), follow-ups with SLA (S = 1 business day, A = 2), overdue dashboard, opportunities with value/probability/win-loss reason, and audited exports with filter summary. Current export ([lib/export.ts](../lib/export.ts)) writes CSV/XLSX with no audit entry, no suppression filter, and no permission gate.

### §13 UI — dashboard and lead list only
Missing: map + search-zone screen (roads, zones, points, radii, coverage, pre-run cost estimate), manual review queues (duplicates, uncertain chains, conflicting identity, low-confidence contacts, AI review, failed jobs), and lead-list columns for score/priority, SME classification, digital need, contact coverage, pipeline status, owner/next action, last verified.

### §15 Security, privacy, compliance — the big legal gap
- **RBAC**: [lib/auth.ts](../lib/auth.ts) is a single shared `ADMIN` account from env vars. The work order requires 6 roles (Super Admin, Data Manager, Sales Manager, Sales Rep, Researcher, Read-Only Executive), a real `users` table, and per-permission gating of bulk export / deletion / API credentials / scoring rules.
- **Immutable audit log** of all material user actions — none exists.
- **Do Not Contact / suppression list** at business and contact level, opt-out recording (date, channel, source message, reason), and hard blocking of future automated outreach. Currently `/api/leads/send-email` and `/api/leads/send-sms` will send to anyone with no suppression check — this is an explicit §20.1 failure and a PH NPC right-to-object exposure.
- Secrets manager (currently plain env vars), MFA for admins, retention/deletion workflow, privacy-notice versioning.

### §16 Cost control — none
Admin-configurable daily/monthly Google API budgets, warnings at 50/75/90/100%, automatic pause of discovery at the hard limit, per-environment/per-stage budgets, pre-run cost estimate, and API cost dashboards by endpoint/field-mask stage. Today there is no notion of API spend anywhere.

### §17 API standards
No `/api/v1` versioning, no OpenAPI spec, no consistent error envelope (code/message/trace ID), no idempotency keys on job-creation endpoints, no standard pagination/sorting/field-selection contract.

### §18 Testing
Two test files ([tests/access-control.test.ts](../tests/access-control.test.ts), [tests/csv-import.test.ts](../tests/csv-import.test.ts)). The work order requires unit tests for normalization / dedupe / chain thresholds / scoring / permissions / status transitions, integration + contract tests against the Google client, the full end-to-end scenario, plus performance, security, data-quality, and recovery tests — and 12 named business scenarios with measurable acceptance targets (≥95% franchise detection, ≥90% classification precision, ≤3% contact false-match, ≥99% audit JSON validity).

### §21 Handover deliverables
Missing: ERD + data dictionary, OpenAPI docs, Docker + CI/CD deployment package with rollback, admin guide, operations guide, sales user guide, security/privacy guide, QA report, production handover (credentials inventory, backup, monitoring, support contacts). Existing docs cover the old LAN product only.

---

## 3. What is reusable

- Next.js 15 + TypeScript + Prisma + Zod skeleton, ESLint/Vitest/CI setup.
- Auth/session and IP access-control scaffolding — as a base to extend into RBAC, not as-is.
- CSV/XLSX export plumbing ([lib/export.ts](../lib/export.ts)) — needs audit logging and suppression filtering.
- Philippine location data ([lib/philippines-locations.ts](../lib/philippines-locations.ts)).
- Email/SMS/SMPP stack — park it. Valuable later for §12 activity logging, but only behind DNC/opt-out enforcement, and it is not MVP scope.

## 4. Recommended sequence

The work order's phases (§19) map to a near-rewrite of the data layer:

1. **Phase 0** — decide Serper→Google Places (New) and SQLite→PostgreSQL/PostGIS; get the Google Cloud project, billing alerts, and restricted keys; obtain `Metro_Manila_Major_Commercial_Roads_EN.xlsx`; confirm legal basis for outreach.
2. **Phase 1** — PostgreSQL schema + migrations, users/RBAC, audit log, Excel import, zones/points, categories.
3. **Phase 2** — Google discovery engine with staged field masks, job queue, budget guardrails, map coverage.
4. **Phase 3** — normalization, dedupe/merge, franchise master, branch counting, review queues.
5. **Phase 4** — website/contact/social enrichment, rule-based audit, AI structured audit.
6. **Phase 5** — scoring, service recommendations, CRM pipeline, activities, dashboard, audited export.
7. **Phase 6** — QA against the §18 targets, security review, docs, production deployment.

## 5. Open questions for QROAD

1. Is Serper acceptable as a fallback anywhere, or is Google Places API (New) mandatory everywhere? (Work order reads as mandatory.)
2. Is the existing email/SMS/SMPP outreach retained as a Phase 2 feature, or dropped?
3. Where is `Metro_Manila_Major_Commercial_Roads_EN.xlsx`?
4. Target deployment: Vercel (current direction, per `vercel.json`) does not fit long-running workers + Redis + PostGIS well. Confirm cloud target.
5. Who performs the §15.3 legal review (lawful basis, privacy notice, retention) before outbound is enabled?
