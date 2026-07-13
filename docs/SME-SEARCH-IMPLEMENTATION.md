# SME Search — Implementation Checklist

Tracks the phased delivery of the SME Search feature defined in
`docs/QROAD_Antigravity_Vibe_Coding_Work_Order_SME_Search_Feature_EN.md`.

Branch: `feature/sme-search-integration`

## Phases

- [x] **Phase 0** — Baseline, branch, feature flag
- [x] **Phase 1** — Google Places (New) adapter + internal search domain
- [ ] **Phase 2** — Additive schema, search-zone importer, franchise import template
- [ ] **Phase 3** — Name normalization, franchise exclusion, classification, dedupe
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
