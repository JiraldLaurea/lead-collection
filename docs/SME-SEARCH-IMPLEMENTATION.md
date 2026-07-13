# SME Search — Implementation Checklist

Tracks the phased delivery of the SME Search feature defined in
`docs/QROAD_Antigravity_Vibe_Coding_Work_Order_SME_Search_Feature_EN.md`.

Branch: `feature/sme-search-integration`

## Phases

- [x] **Phase 0** — Baseline, branch, feature flag
- [x] **Phase 1** — Google Places (New) adapter + internal search domain
- [x] **Phase 2** — Additive schema, search-zone importer, franchise import template
- [x] **Phase 3** — Name normalization, franchise exclusion, classification, dedupe
- [ ] **Phase 4** — SME Search UI
- [ ] **Phase 5** — Save as lead + existing SMS composer integration
- [ ] **Phase 6** — Lead score, statuses, admin controls
- [ ] **Phase 7** — Stabilization, security review, acceptance

## Feature flag

| Item | Value |
| --- | --- |
| Setting key | `sme_search_enabled` (in `app_settings`) |
| Default | `false` |
| Env override | `SME_SEARCH_ENABLED=true` / `=false` (wins over the setting; leave unset to control from Settings) |
| Read via | `isSmeSearchEnabled()` in `lib/feature-flags.ts` |
| Guards | `requireSmeSearchPage()` / `requireSmeSearchApi()` in `lib/require-auth.ts` |
| Gates | Sidebar nav item, `/sme-search` page, all `/api/sme-search/*` routes |

When the flag is off, the application behaves exactly as it did before this work.

## Google Places API (New)

Provider: **Places API (New)** (`places.googleapis.com/v1`), server-side only, via
`lib/sme/google-places.ts`. The legacy Places API is not used. The existing `/search`
page still uses Serper and is untouched.

Key: `GOOGLE_MAPS_API_KEY` in `.env.local`. Google Cloud project `local-leads-collection`,
key restricted to *Places API (New)* only. Never prefixed `NEXT_PUBLIC_`.

### Field-mask inventory (no wildcards anywhere)

| Stage | Endpoint | Fields |
| --- | --- | --- |
| Discovery (nearby) | `places:searchNearby` | `places.id`, `displayName`, `formattedAddress`, `location`, `primaryType`, `types`, `businessStatus`, `googleMapsUri` |
| Discovery (text) | `places:searchText` | as above, plus `nextPageToken` |
| Contact / qualification | `places/{id}` | discovery fields plus `nationalPhoneNumber`, `internationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount` |

Discovery deliberately omits phone, website, rating and review count: Google bills each
request at the highest SKU tier its field mask touches. Those fields are fetched only at
the details stage, for candidates that survive franchise screening. `reviews`, `photos`
and generative summaries are never requested.

### Live smoke test (13 Jul 2026)

Verified against the real API with the production key:

- `COMMERCIAL_ROAD` (cafe, Aguirre Avenue, BF Homes, Parañaque) → 5 real businesses with
  genuine `ChIJ...` place IDs. Phone, website and rating all came back `null`, confirming
  the discovery mask is honored and the cheap SKU is used.
- `MAP_RADIUS` (restaurant, Makati CBD, 450 m) → Nearby Search with a circle restriction.
- `places/{id}` details on those candidates → phone on 5 of 6, website on 3 of 6.

Observation feeding Phase 3: the "websites" Google returns for these SMEs are frequently
Facebook or Instagram pages, not owned domains. The shared-domain denylist in the
classifier is therefore load-bearing — treating `facebook.com` as a brand domain would
merge unrelated businesses into one phantom chain.

## Database

11 new tables. **No existing table is altered or dropped**, and no column is added to
`leads`. The existing `leads` table remains the lead store: `sme_business_profiles.lead_id`
is a nullable FK to `leads.id`, set only when a user explicitly saves a candidate. Every
existing feature (SMS, email, export, logs) therefore works on a saved SME lead with no
change.

| Table | Purpose |
| --- | --- |
| `sme_search_zones` | City, area, road, coordinates, radius, priority, scan state |
| `sme_search_runs` | One search execution: mode, parameters, counts, errors |
| `sme_place_references` | Google place ID and fetch metadata |
| `sme_business_profiles` | Internal business record, linked to `leads` once saved |
| `sme_classifications` | Auto + effective SME class, confidence, reason codes, override audit |
| `franchise_brands` | Admin-managed blacklist: aliases, domains, classification |
| `sme_lead_scores` | Versioned score, band, per-factor breakdown |
| `lead_lists`, `lead_list_items` | Reusable campaign target lists |
| `contact_activities` | Search, save, SMS, reply, meeting, note history |
| `do_not_contact` | Opt-out / suppression registry |

### Applying and rolling back

```bash
npm run db:push            # additive; safe to re-run (CREATE TABLE IF NOT EXISTS)
npm run db:rollback:sme    # drops ONLY the 11 SME tables
```

The DDL lives in `scripts/sme-schema.mjs` and is shared by both scripts so up and down
cannot drift. `db:push` now loads `.env.local`, and applies the SME schema to **Turso**
as well when `TURSO_DATABASE_URL` is set — previously it only ever wrote the local SQLite
file, so a hosted deployment would have been missing these tables while local tests passed.

⚠️ **The SME tables have not yet been applied to the hosted Turso database.** Run
`npm run db:push` with the hosted credentials as a deploy step before enabling the feature
in production.

### Migration verified (13 Jul 2026)

Up and down were run against a copy of the real `data/leads.sqlite` (309 leads, 81 email
logs, 8 SMS logs, 572 access logs):

- UP added exactly 11 tables; **every existing row preserved**.
- Re-running UP is idempotent.
- The `sme_business_profiles.lead_id` → `leads.id` foreign key resolves.
- DOWN removed all 11 tables, restoring the original schema with **every original row intact**.

### Importers

Both are idempotent and support dry-run; re-importing the same file updates in place
rather than duplicating.

| Import | Template | Key |
| --- | --- | --- |
| Search zones | `docs/templates/search-zones-template.csv` | (city, commercial area, road name) |
| Franchise brands | `docs/templates/franchise-brands-template.csv` | canonical name |

Live-verified: dry run wrote 0 rows; real import created 12 zones and 48 brands;
re-import reported 12/48 unchanged and created nothing.

**The franchise template is a starting point, not an approved blacklist.** Per work order
6.2 no list is seeded silently — an administrator must review it before import. The zone
template's coordinates are approximate and should be verified against the actual
Metro_Manila_Major_Commercial_Roads file when it is provided.

## Classification (Phase 3)

Classes: `INDEPENDENT_SME`, `LOCAL_SME_CHAIN`, `MANUAL_REVIEW`, `LARGE_CHAIN`,
`FRANCHISE_EXCLUDED`, `MANUAL_INCLUDE`, `MANUAL_EXCLUDE`. Only Independent, Local SME Chain
and Manual Include may enter bulk outreach — `MANUAL_REVIEW` is shown but never bulk-contacted
until a human decides.

Thresholds (configurable): 1 observed location = Independent, 2–5 = Local SME Chain,
6–9 = Manual Review, 10+ = Large Chain, blacklist hit = Franchise Excluded.

Every classification carries **reason codes with human-readable evidence**, so an exclusion
is never unexplained, and a manual override records the previous value without overwriting
the automatic one.

### Three things the live data forced into the design

**1. Shared domains cannot imply a shared brand.** A live search of Aguirre Avenue found
three of six independent cafes listing a `facebook.com` or `instagram.com` page as their
"website". Since every Facebook page has the host `facebook.com`, a naive domain-cluster
rule would fuse them into one phantom chain — and at scale, a 10+ location `LARGE_CHAIN`
that gets auto-excluded. These are precisely the SMEs worth contacting: no real website is
a *reason to call*, not a reason to skip. See `lib/sme/shared-domains.ts`.

**2. Suffix stripping alone misses real chains.** A live Makati search returned
"Nihon Cafe - Concept" and "Nihon Cafe Bel Air" as two independents, because "Bel Air" is a
barangay that no static location-word list contained. `resolveBrandAliases` now collapses a
brand candidate onto any *complete token prefix* of itself, which catches Nihon Cafe while
still keeping "Cafe de Lipa" and "Cafe de Manila" apart (neither is a prefix of the other).

**3. Branch counts are evidence, not truth.** We can only count branches a search actually
returned, so `branchCount` is a floor. A single observed location scores low confidence
(65, or 45 when the name carries a branch label) and says so in its reason codes.
`loadPriorBranchCounts` folds in locations already stored from earlier searches.

### Live verification (13 Jul 2026)

Run against the real Google API with the 48 franchise brands loaded in the database:

- **Franchise exclusion:** "Wendy's - Makati Avenue" excluded via alias match on `wendys`,
  with reason shown. **Zero false positives** among the 19 independents kept in the same run.
- **Local chain retained:** "Panco Cafe - Legazpi Makati" + "Panco Cafe - One Ayala" and
  "Nihon Cafe - Concept" + "Nihon Cafe Bel Air" both correctly kept as `LOCAL_SME_CHAIN`,
  not excluded.
- **No false merge:** "Pancho Cafe Makati" stayed separate from "Panco Cafe".
- **No phantom chain:** independents whose only web presence is Instagram/Facebook each
  stayed `INDEPENDENT_SME` with branch count 1.

Dedupe merges automatically on place ID, then normalized phone, then owned domain + brand
name. A near-identical name within 150 m is deliberately **flagged for review, not merged** —
two different tenants would otherwise be silently collapsed, and a merge is far harder to
undo than a review.

## Baseline (recorded before any change, commit `9ea91cc`)

| Check | Committed `HEAD` | Working tree at start of Phase 0 |
| --- | --- | --- |
| `npm run typecheck` | pass | pass |
| `npm run lint` | pass | pass |
| `npm test` | pass (3 tests) | pass (3 tests) |
| `npm run build` | **pass** | **FAILS** |

### Pre-existing build failure (not caused by this work)

`npm run build` fails in the working tree while prerendering `/`:

```
TypeError: Cannot read properties of undefined (reading 'call')
Error occurred prerendering page "/"
```

Confirmed pre-existing by building the committed `HEAD` in a clean worktree, which
succeeds. The failure comes from the uncommitted hosted-deployment work in progress
(`lib/prisma.ts` libSQL/Turso adapter + `next.config.ts` `serverExternalPackages`),
which makes the Prisma client unavailable during static prerender of the dashboard.

Per the work order's safe-change rules, unrelated pre-existing issues are recorded,
not fixed. **This must be resolved before Phase 7 acceptance**, since acceptance
requires a passing build.

## Rollback

Phase 0 adds no user-visible behavior. To roll back:

1. Set `SME_SEARCH_ENABLED=false`, or leave the `sme_search_enabled` setting unset (it defaults to off).
2. To remove the code entirely: `git checkout main` and delete the `feature/sme-search-integration` branch.

No database changes were made in Phase 0.
