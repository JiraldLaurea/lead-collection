# SME Search — Operator Guide

How to run, configure, and roll back the SME Search feature. For the implementation record
and phase-by-phase evidence, see [SME-SEARCH-IMPLEMENTATION.md](SME-SEARCH-IMPLEMENTATION.md).

---

## What it does

Finds independent and local businesses in Metro Manila through Google Places, excludes large
franchises, scores each lead, saves the good ones into the existing **Leads** table, and hands
them to the existing SMS composer.

It does **not** send anything by itself. Searching and saving never message anyone; SMS is
always a separate step that you confirm.

---

## Turning it on and off

**Settings → SME Search → "Show SME Search in the sidebar"**.

When it is off, the application behaves exactly as it did before this feature existed: no nav
item, `/sme-search` returns 404, and the search API returns 404. That is the rollback switch.

An `SME_SEARCH_ENABLED=true|false` environment variable overrides the setting if you need to
force it in a particular environment. Leave it unset to control the feature from Settings.

---

## Before the first run

1. **Google Cloud** — a project with billing enabled, **Places API (New)** enabled (not the
   legacy "Places API"), and an API key restricted to Places API (New).
2. **`.env.local`** — `GOOGLE_MAPS_API_KEY=AIza…`. Never `NEXT_PUBLIC_`-prefixed; the key is
   server-side only and must never reach the browser.
3. **A budget alert** in Google Cloud Billing. Every search costs real money.
4. **Commercial roads** — Settings → SME Search → import `docs/templates/search-zones-template.csv`.
5. **Franchise blacklist** — import `docs/templates/franchise-brands-template.csv`. **Review it
   first.** An over-broad brand rule silently excludes real prospects, and that failure is
   invisible: the business simply never appears.

Use **Dry run** on both imports first. It reports row-by-row errors and writes nothing.

---

## Running a search

| Mode | Use it for |
| --- | --- |
| Commercial road / area | A configured road, e.g. Aguirre Avenue, BF Homes. The most precise mode. |
| City + category | Sweeping a whole city for one category. |
| Map radius | A circle around a coordinate you paste in. |
| Free text | A natural-language query, e.g. "independent cafe in Tomas Morato". |

Then: review → tick the ones you want → **Save selected**, or **Save & open SMS composer**.

### Reading the results

- **Score / band** — S (80+), A (65+), B (50+), C (35+), Low. Highest first.
- **SME status** — Independent, Local chain, Needs review, Large chain, Franchise.
- **Details** — shows *why*: every classification reason and every score factor, with its
  evidence. If an exclusion looks wrong, this tells you what triggered it, and you can
  override it.

### What "SME only" hides

Franchises, large chains and manual exclusions. Untick it to see what was filtered out and
why. Businesses marked **Needs review** are shown but **cannot be bulk-contacted** until a
human classifies them.

---

## Correcting a classification

Open **Details** on a **saved** business → *Correct this classification* → choose the class,
give a reason, apply.

The automatic classification is never overwritten. Who changed it, when, from what, and why
are all recorded. A business must be saved first, because the override needs a record to
attach its audit trail to.

---

## Do Not Contact

Suppression is enforced **on the server, inside every send route** — the Leads composer, the
CSV Leads composer, and manual Send SMS. It cannot be bypassed by calling the API directly,
and it applies whether or not the SME Search feature is enabled.

A recipient is refused if they have: no phone, a non-mobile number, a duplicate number in the
same batch, a Do Not Contact entry, or a number a carrier already reported undeliverable
(`UNDELIV` / `REJECTD` / `EXPIRED`).

The composer shows the exclusions and reasons **before** you send. Phone-number CSV exports
exclude suppressed numbers too — once that file leaves the app there is no second chance to
filter it.

Adding an opt-out today is a database insert into `do_not_contact` (`normalized_contact` in
`639XXXXXXXXX` form, `channel = 'sms'`, `active = 1`). A UI for this is a known gap.

---

## Cost control

Every search spends money at Google. The protections:

- **Staged retrieval.** Discovery asks only for id, name, address, location, type and status.
  Phone, website and rating cost more and are fetched **only** for businesses that survive
  franchise screening. A Starbucks branch is discarded before we pay for its phone number.
- **Rate limit.** 10 searches per minute, 100 per hour.
- **Duplicate-click guard.** Repeated clicks cannot start a second search; a new search
  cancels the previous one.
- **Max results** caps how many businesses get a details lookup. Keep it modest.

A 12-result search costs roughly 1 discovery request plus one details request per surviving
candidate.

---

## Scoring

100 points: SME confidence 25, marketing need 25, business potential 20, contact availability
20, commercial area value 10. Editable in Settings; must total 100.

**The model never claims something it did not observe.** We collect no social-media data, so
it will never tell you a business "posts rarely" or has an "inactive Instagram". A business
with a real website has its marketing-need factor marked *unknown* rather than *weak* —
because an owned site does not mean the marketing is good, it means we cannot tell.

A franchise scores **0 / Low**, not a flattering number, so it can never look like a prospect.

Changing the weights affects the **next** search. Saved scores are never rewritten; each
recalculation inserts a new row stamped with its model version.

---

## Rollback

| Level | Action |
| --- | --- |
| Hide the feature | Settings → turn off the toggle. Instant; no data touched. |
| Remove the code | `git checkout main` |
| Remove the tables | `npm run db:rollback:sme` — drops only the 11 SME tables. |

`db:rollback:sme` was rehearsed against a copy of the production database: all 11 SME tables
were dropped, and every original table (`leads`, `sms_logs`, `email_logs`, …) survived with
identical row counts. Saved SME leads live in the `leads` table and **survive the rollback** —
they simply lose their SME classification and score.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Google rejected the request" | Places API (New) not enabled, or the key is restricted to the wrong API. Check you enabled **Places API (New)**, not legacy "Places API". |
| "Google Maps API key is not configured" | `GOOGLE_MAPS_API_KEY` missing from `.env.local`. |
| "Too many searches" | Rate limit. Wait the stated number of seconds. |
| No results on a road search | The zone has no coordinates, or the category is wrong for the area. Try City + category, or widen the radius. |
| A real business is missing | It may have been classified as a franchise. Untick **SME only** to see the exclusions and their reasons. |
| A franchise slipped through | Add it to the blacklist (Settings → franchise CSV) with its aliases and official domain. |
| `Cannot read properties of undefined (reading 'call')` | Two dev servers, or a build running alongside a dev server, sharing one `.next`. Stop them all, delete `.next`, restart. |

---

## Known limitations

1. **Branch counts are a floor, not a truth.** We can only count branches that searches have
   actually returned. A single observed location means "one we have seen", not "one that
   exists" — the score reflects this with lower confidence, and says so.
2. **No social-media data.** Marketing need is scored only from whether a real website exists.
   Instagram/Facebook activity, content quality and booking flows are not assessed.
3. **The rate limit is per process.** It lives in memory. If the app is ever run as multiple
   instances behind a load balancer, each gets its own counter and the effective limit
   multiplies. Move it to a shared store at that point.
4. **No Do Not Contact management UI.** Opt-outs must be inserted into the database directly.
5. **Franchise matching is name- and domain-based.** A franchise trading under an unlisted
   name, with no website, will not be caught until someone adds it to the blacklist.
6. **No per-user rate limits or roles.** The app has a single shared admin account; the work
   order's RBAC section was explicitly out of scope for this system.
7. **Zone coordinates in the template are approximate** and should be checked against the real
   Metro Manila commercial-roads source file when it is provided.
