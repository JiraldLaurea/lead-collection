# SME Search — Manual Test Plan

Maps to the acceptance checklist in
`docs/QROAD_Antigravity_Vibe_Coding_Work_Order_SME_Search_Feature_EN.md` §13.2.

Every step lists what to do and what you should see. If an expected result does not appear,
that item **fails** — record it rather than working around it.

---

## 0. Before you start

| Check | How |
| --- | --- |
| One dev server only | Never run two, and never run `npm run build` while one is up. Both corrupt `.next` and produce a dead UI. If the page stops reacting: stop everything, delete `.next`, restart. |
| Google key present | `GOOGLE_MAPS_API_KEY` in `.env.local` (server-side; never `NEXT_PUBLIC_`). |
| Zones and brands loaded | Settings → SME Search should show *12 commercial roads* and *48 franchise brands*. If not, import the CSVs from `docs/templates/`. |
| **SMS dry-run ON** | Settings → Debug → **SMS dry run**. **Turn this on before any send test.** Otherwise you will send real marketing texts to real businesses and burn provider credits. |

Login: `admin` / `admin`.

> ⚠️ Every search costs real Google Places money. Keep **Max results** at 10–12 while testing.

---

## 1. Feature flag (§13.2: "available only when enabled")

1. Settings → **SME Search** → turn the toggle **off** → Save.
2. Reload any page.

**Expect:** "SME Search" disappears from the sidebar. Visiting `/sme-search` directly returns
**404**. The rest of the app is completely unchanged.

3. Turn it back **on** → Save → reload.

**Expect:** "SME Search" reappears between *Leads* and *CSV Leads*.

---

## 2. Legacy SMS flow is unchanged (§13.2: "existing users can continue")

Do this **before** touching SME Search, so any later breakage is attributable.

1. **Leads** → select a lead with a phone number → **Send SMS** → send (dry-run).
2. **Send SMS** page → type a number → send.
3. **CSV Leads** → select → send.

**Expect:** all three behave exactly as they always did. Check the **SMS Log** — rows appear
with a `dryrun_…` message ID.

---

## 3. Search — all four modes (§13.2: "search by road/city/radius/free text")

Go to **SME Search**.

| # | Mode | Input | Expect |
| --- | --- | --- | --- |
| 3.1 | Commercial road / area | Aguirre Avenue — BF Homes, Paranaque · Cafe · max 12 | ~12 results, summary chips populate |
| 3.2 | City + category | Makati · Cafe · max 12 | Results across Makati |
| 3.3 | Map radius | lat `14.5547`, lng `121.0244`, radius 450, Restaurant | Results around Makati CBD |
| 3.4 | Free text | `independent cafe in Tomas Morato` | Natural-language results |

**Expect on all:** the **Score** column shows a number and band (S/A/B/C/Low), highest first.
Location, rating, and contact indicators are populated.

---

## 4. Franchise exclusion, with a visible reason (§13.2)

1. Mode **Free text** → `fast food and coffee chains in Makati Poblacion` → Search.
2. Untick **SME only** (franchises are hidden by default).
3. Find a chain — e.g. **Starbucks** or **Wendy's** — and click **Details**.

**Expect:**
- Grey **"Franchise"** pill, and it is **not** selectable for outreach.
- Detail drawer shows a reason code such as `FRANCHISE_NAME_PREFIX_MATCH` with plain-English
  evidence: *"Business name matches the franchise 'Starbucks'."*
- **Lead score is 0 / Low** — a franchise never looks like a prospect.

---

## 5. Local chains are kept, not excluded (§13.2)

1. Mode **City + category** → **Makati** → **Cafe** → max 20.
2. Look for a brand appearing twice — e.g. **Nihon Cafe** or **Panco Cafe**.

**Expect:** blue **"Local chain"** pill, still selectable. Detail drawer says the brand appears
at *2 observed locations*, and reasons include `LOCAL_CHAIN_RETAINED`.

> This is the rule that matters commercially: a locally owned 2–5 branch business is a
> **high-value prospect**, not a franchise.

---

## 6. The shared-domain guard (the most valuable behavior to verify)

In the Aguirre Avenue results, open **Details** on a café whose website is a **Facebook or
Instagram** page (e.g. *Sweet Tooth Paranaque*).

**Expect:** reason code **`NO_OWNED_DOMAIN`** — *"Listed website facebook.com is a shared
platform page, so it is not evidence of a brand domain."* The business stays
**Independent**, branch count **1**.

> Without this, every café using a Facebook page as its website would be fused into one
> phantom "chain" and auto-excluded from your outreach. Confirm it holds.

---

## 7. Score breakdown and the honesty rule (§13.2 / work order 9.1)

Open **Details** on the top-scoring lead.

**Expect:** five factors, each with points and evidence:
- SME confidence · Marketing need · Business potential · Contact availability · Commercial area value
- A business with **no website** scores **25/25 marketing need** — a real, observed gap.
- A business **with** a real website has marketing need marked **"partly unknown"** and capped.

**Must NOT appear anywhere:** any claim that a business "posts rarely" or has an "inactive
Instagram". We collect no social data, so we never assert it.

---

## 8. Save as lead — idempotent (§13.2: "duplicates are not repeatedly inserted")

1. Note your current lead count on the **Leads** page.
2. In SME Search, tick 3 results **with phone numbers** → **Save selected**.

**Expect:** toast "3 saved". Their Status column flips to **Saved**.

3. Go to **Leads** — the 3 new businesses are there, as ordinary leads.
4. Return to SME Search, re-run the **same** search, select the **same** 3 → **Save selected**.

**Expect:** "0 saved · 3 already existed". Lead count **does not grow**.

---

## 9. Manual Review cannot be bulk-contacted (§13.2)

If a result shows an amber **"Needs review"** pill, try to select and save it.

**Expect:** it is skipped, with the reason *"Classified MANUAL_REVIEW; review it before
saving."* It never silently enters the outreach list.

---

## 10. Manual override is audited (§13.2)

1. Open **Details** on a **saved** business.
2. Under *Correct this classification*: choose a different class, type a reason, **Apply override**.

**Expect:** the classification changes. Re-open the drawer — the **automatic** class is still
recorded alongside the new one, plus who changed it, when, from what, and why.

*(Overriding requires the business to be saved first — the audit trail needs a record to
attach to.)*

---

## 11. Do Not Contact — the safety-critical test (§13.2)

**This is the one that must not fail.**

1. Add an opt-out. There is no UI for this yet, so insert it directly — use a number from one
   of your saved leads, normalized to `639XXXXXXXXX`.
2. In SME Search, select that lead plus 2 others → **Save & open SMS composer**.

**Expect, before anything is sent:**
- A recipient summary: selected / will receive / excluded counts.
- The opted-out business listed under **"Excluded before sending"** with reason
  *"On the Do Not Contact list"*.
- Landlines listed as *"Not a valid PH mobile number"*.
- The Send button names the exact final count.

3. Send (dry-run on).

**Expect:** only the sendable recipients are sent. Check **SMS Log**.

**Bypass test (the important one):** the same screening runs **inside** the send route, not
just in the composer — so calling the API directly with the opted-out lead still blocks it.
Suppression cannot be bypassed.

---

## 12. Never auto-send (§13.2)

Confirm that **searching** sends nothing, and **saving** sends nothing. SMS only ever leaves
after you press Send in the composer.

---

## 13. Send history links back (§13.2)

After a dry-run send, open **SMS Log**.

**Expect:** the row is linked to the lead (a **View lead** button), uses the same `SmsLog` as
every other send path, and appears with the same provider. There is one SMS integration and
one send history — SME Search did not fork it.

---

## 14. Cost control (§10.2)

1. Click **Search** repeatedly and fast.

**Expect:** the button disables while in flight; repeated clicks do not launch extra searches.

2. Run more than 10 searches within a minute.

**Expect:** *"Too many searches. Try again in N seconds."* (10/min, 100/hour.)

3. Look at an **excluded franchise** in the results.

**Expect:** its phone and website are blank — we never paid Google for the contact details of
a business we were about to discard. That is the staged field mask working.

---

## 15. Admin controls (§13.2)

Settings → **SME Search**:

1. Change a scoring weight so the total is not 100 → Save.
   **Expect:** rejected — *"Scoring weights must add up to 100."*
2. Import a CSV with **Dry run**.
   **Expect:** row-by-row errors reported, and **nothing written**.

---

## 16. Rollback (§13.2: "all migrations are reversible")

Not needed for routine QA, but this is the evidence QROAD asks for:

```bash
npm run db:rollback:sme     # drops ONLY the 11 SME tables
```

Rehearsed against a copy of the production database: every original table survived with
identical row counts (`leads` 315, `email_logs` 81, `sms_logs` 11, …). Saved SME leads live in
the ordinary `leads` table and **survive** the rollback — they simply lose their SME
classification and score.

---

## What is known not to work (be honest about these)

| Issue | Status |
| --- | --- |
| Carrier blocks the promotional SMS copy | **Not a code bug.** 7/7 marketing messages rejected; the plain wording is accepted. Register `QROAD` as a sender ID and pre-approve the template with the carriers. |
| Delivery receipts stay "pending" → "no receipt" | The provider's dashboard shows `submitted`, never `delivered`, DLR 0%. Messages **do** reach the handset. Ask Bliply to re-enable DLRs. The app now holds a persistent SMPP bind, so it will capture them when they resume. |
| No Do Not Contact management UI | Opt-outs must be inserted into the database directly. |
| Branch counts are a floor, not a truth | We can only count branches a search actually returned. |
