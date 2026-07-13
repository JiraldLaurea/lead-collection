# SME Search — Implementation Checklist

Tracks the phased delivery of the SME Search feature defined in
`docs/QROAD_Antigravity_Vibe_Coding_Work_Order_SME_Search_Feature_EN.md`.

Branch: `feature/sme-search-integration`

## Phases

- [x] **Phase 0** — Baseline, branch, feature flag
- [x] **Phase 1** — Google Places (New) adapter + internal search domain
- [x] **Phase 2** — Additive schema, search-zone importer, franchise import template
- [x] **Phase 3** — Name normalization, franchise exclusion, classification, dedupe
- [x] **Phase 4** — SME Search UI
- [x] **Phase 5** — Save as lead + existing SMS composer integration
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

## SME Search UI (Phase 4)

`/sme-search`, feature-flagged, reusing the existing design system (`leads-table`,
`table-frame`, MUI `Checkbox`, `LoadingModal`, `Snackbar`, `TableStatusRow`).

Four modes: commercial road (from imported zones), city + category, map radius, free text.
Filters: rating, review-count range, has phone, has website, SME only, exclude Do Not
Contact, exclude previously contacted. Summary chips show found / qualified / need review /
excluded / already saved / possible duplicates. The detail drawer shows the classification,
confidence, observed locations, matched franchise, and **every reason code with its
evidence**, so no exclusion is a black box.

Repeated clicks cannot spend a second round of API calls (in-flight guard), and starting a
new search aborts the previous one rather than racing it.

### Staged cost control, and the gap live testing exposed

`POST /api/sme-search/runs` screens franchises on **discovery data alone**, then fetches
contact details only for the survivors — Google bills per request, so we must not pay for
the phone number of a McDonald's we are about to discard.

The first live run showed this only half-working. "Starbucks San Antonio Paranaque" was
*not* caught by name (suffix stripping leaves "starbucks san antonio", because "Antonio" is
in no location list), so it survived screening, we paid for its details, and only then did
the `starbucks.ph` domain expose it. Worse, **"Jollibee SM Sucat" would have escaped
entirely** — no website domain, and "Sucat" is in no list either.

Fixed by matching a franchise when its name is a **complete token prefix** of the business
name (`NAME_PREFIX`, confidence 85). Whole-token comparison is what keeps this safe:
"Benchmark Fitness" does not start with the token `bench`, and "Old McDonald's Farm Supply"
does not *start* with `mcdonalds`. Re-ran live: Starbucks is now excluded at the screening
stage with its contact details never fetched.

### Live verification (13 Jul 2026)

Aguirre Avenue, BF Homes, cafés, 500 m — through the real API route as the UI calls it:

- 12 results → **11 qualified, 1 excluded** (Starbucks), 0 needing review.
- Starbucks excluded via `FRANCHISE_NAME_PREFIX_MATCH`, contact details **never fetched**.
- Every independent kept, including those whose only web presence is a Facebook page.
- Flag **off**: `/sme-search` returns 404, `POST /api/sme-search/runs` returns 404, and the
  nav item is absent. The application behaves exactly as before.
- The Google API key appears in **zero** files under `.next/static/` — it never reaches the
  browser.

## Save and SMS (Phase 5)

**One SMS integration, one send history.** SME Search saves selected candidates as ordinary
`leads` rows, then hands those lead IDs to the **existing** `POST /api/leads/send-sms` — the
same route, the same `lib/sms.ts`, the same `SmsLog`. Nothing about the SMS provider or send
history is forked.

Saving is idempotent (keyed on the Google place ID) and **never sends anything**: SMS is
always a separate, explicitly confirmed step. Franchises and unreviewed `MANUAL_REVIEW`
businesses are refused at save time rather than silently entering the lead list.

Google-sourced leads carry a `google:` place-ID prefix, mirroring the existing `serper:`
prefix, so the two discovery paths coexist in one table and a lead's origin is readable
from its key.

### Suppression is enforced on the server

`screenSmsRecipients` runs **inside the send route**, not only in the composer. A check that
lives only in the UI can be bypassed by calling the API directly, and the work order treats
bypassable opt-out as a non-acceptance condition (§20.1).

It excludes: missing phone, non-mobile numbers, duplicates within the batch, Do Not Contact
entries, and numbers that previously hard-failed (`UNDELIV`/`REJECTD`/`EXPIRED` — a carrier
confirmed those undeliverable, and resending burns credits).

**With an empty Do Not Contact list the behavior is identical to before**, so existing sends
are unaffected. `POST /api/leads/sms-screening` is a dry run of the same logic, so the
composer can show who will be excluded and why before the user confirms.

### Live verification (13 Jul 2026)

Aguirre Avenue cafés → save → SMS, against the real database:

- **Save:** 3 leads created (`leads` went 309 → 312), linked to SME profiles with their
  classification and evidence. Re-saving created **0** and linked the same 3 — idempotent.
- **Screening:** of 3 selected, 1 sendable. One blocked as `DO_NOT_CONTACT`, one as
  `INVALID_NUMBER` (a real landline, `(02) 7001 4906` — not an SMS-capable number).
- **Bypass test:** calling `POST /api/leads/send-sms` **directly** with all 3 lead IDs, no UI
  involved, still sent to only 1. The Do Not Contact number was blocked server-side.
- Send recorded in the existing `SmsLog` (lead-linked) and in the new `ContactActivity`
  timeline.

### Bundle regression caught during the build

`/sme-search` first weighed **307 kB** because the composer imported `exclusionLabels` from
`lib/sme/suppression.ts`, which imports Prisma — dragging the database client into the
browser bundle. The client-safe half now lives in `lib/sme/suppression-labels.ts`, and the
page is **7.7 kB**, in line with `/leads`.

Client bundle scanned: zero occurrences of `AIza`, `SMPP_PASSWORD`, `TURSO_AUTH`,
`SESSION_SECRET` or `PrismaClient` under `.next/static/`.

## Baseline (recorded before any change, commit `9ea91cc`)

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass (3 tests at baseline; 112 after Phase 4) |
| `npm run build` | pass |

### Correction: the "pre-existing build failure" was a false alarm

Phase 0 recorded that `npm run build` failed in the working tree while prerendering `/`:

```
TypeError: Cannot read properties of undefined (reading 'call')
```

and attributed it to the uncommitted Turso/libSQL work. **That diagnosis was wrong.**

The real cause is that `next build` and `next dev` share one `.next` directory. Two dev
servers were running during the Phase 0 build, and a build into the same directory clobbers
the webpack runtime chunks — producing exactly this error. The clean-worktree build appeared
to "prove" the theory only because it had its own `.next`.

With every dev server stopped and `.next` removed, `npm run build` **passes**, including
`/sme-search`. There is no pre-existing build failure and nothing to fix before Phase 7.

**Operational note:** do not run `npm run build` while a dev server is running on this
project, and do not run two dev servers from the same directory. Both corrupt `.next` and
produce misleading `Cannot read properties of undefined (reading 'call')` errors at runtime.

## Rollback

Phase 0 adds no user-visible behavior. To roll back:

1. Set `SME_SEARCH_ENABLED=false`, or leave the `sme_search_enabled` setting unset (it defaults to off).
2. To remove the code entirely: `git checkout main` and delete the `feature/sme-search-integration` branch.

No database changes were made in Phase 0.
