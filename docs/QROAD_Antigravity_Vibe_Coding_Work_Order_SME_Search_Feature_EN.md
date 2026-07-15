**QROAD**

# **ANTIGRAVITY VIBE-CODING** **DEVELOPMENT WORK ORDER**

## ***SME Search Feature Enhancement for the Existing Google Maps API \+ SMS Sending Application***

| Implementation Principle Inspect first. Preserve the current system. Add the feature incrementally. Reuse the existing SMS module. Verify every change. |
| :---: |

**Prepared for:** QROAD Development Team  
**Development Environment:** Google Antigravity / Agentic Vibe Coding  
**Document Type:** Existing-System Feature Enhancement Work Order  
**Version:** 1.0  
**Date:** July 13, 2026

CONFIDENTIAL – Internal Development Use Only

# **DOCUMENT MAP**

| Section | Contents |
| :---- | :---- |
| 1 | Project Objective and Current-System Context |
| 2 | Non-Negotiable Development Rules |
| 3 | Target User Flow and Functional Scope |
| 4 | Search Screen and UI/UX Requirements |
| 5 | Google Places API Integration Requirements |
| 6 | SME Qualification and Franchise Exclusion Logic |
| 7 | Database and Data Migration Requirements |
| 8 | Integration with the Existing SMS Module |
| 9 | Lead Scoring, Search Results, and CRM Status |
| 10 | Security, Cost Control, and Data Governance |
| 11 | Antigravity Master Prompt |
| 12 | Phase-by-Phase Antigravity Prompts |
| 13 | Testing, Stabilization, and Acceptance Criteria |
| 14 | Required Deliverables and Handover |
| Appendix A | Suggested Data Model |
| Appendix B | API Examples and Field Masks |
| Appendix C | Official Technical References |

| How to Use This Document Open the existing application repository in Antigravity. Paste the Master Prompt first. Then execute the phase prompts in order. Do not ask the agent to implement all phases in one uncontrolled step. Require a plan, file-change list, tests, and evidence after each phase. |
| :---- |

# **1\. PROJECT OBJECTIVE AND CURRENT-SYSTEM CONTEXT**

The current application already integrates with Google Maps API and includes an SMS sending function. This project is not a new application build. The objective is to enhance the existing application by adding an SME discovery and search workflow that allows users to find independent and local businesses, exclude large franchises, save qualified businesses as leads, and use the existing SMS sending module to contact selected businesses.

## **1.1 Existing System Assumptions**

• The existing project can already run in its current development environment.

• Google Maps or Google Places related credentials and configuration already exist in the project.

• An SMS provider, sender configuration, message composer, and sending history already exist.

• The actual frontend, backend, database, framework, and deployment stack may differ from assumptions; Antigravity must inspect and adapt to the real repository.

• Existing production behavior must remain operational throughout the enhancement.

## **1.2 Business Objective**

| Objective | Required Outcome |
| :---- | :---- |
| SME discovery | Find marketing-prospect businesses by city, commercial area, road, category, keyword, and map radius. |
| Franchise exclusion | Automatically exclude known national/global chains while retaining independent SMEs and promising local multi-branch businesses. |
| Lead qualification | Show business identity, category, location, rating, review count, contact channels, SME classification, and marketing opportunity indicators. |
| Lead storage | Allow selected results to be saved to the existing contact/lead database without duplicates. |
| SMS activation | Send single or bulk SMS to selected, qualified leads through the existing SMS module. |
| Operational control | Track source, search date, contact status, opt-out status, and sending history. |

| Primary Success Condition A user can search a target commercial area, review SME candidates, exclude franchises, select qualified businesses, save them as leads, and send SMS without leaving the existing application. |
| :---- |

# **2\. NON-NEGOTIABLE DEVELOPMENT RULES**

☐ DO NOT rebuild the application from scratch.

☐ DO NOT create a separate replacement project unless the current repository is proven unrecoverable and explicit approval is given.

☐ DO NOT remove, rename, or bypass the existing SMS sending flow.

☐ DO NOT expose Google Maps API keys, SMS credentials, database credentials, or other secrets in frontend code, commits, screenshots, logs, or documentation.

☐ DO NOT change existing environment-variable names unless backward compatibility is preserved.

☐ DO NOT perform destructive database migrations. Every migration must be additive, reversible, and tested.

☐ DO NOT change existing routes, response formats, database columns, or shared components without impact analysis.

☐ DO NOT use wildcard Google Places field masks in production.

☐ DO NOT send an SMS automatically as a side effect of searching or saving a lead.

☐ DO NOT contact entries marked Opted Out, Do Not Contact, Invalid Number, or Blocked.

☐ DO NOT mark the task complete without automated tests, manual verification, and a changed-file summary.

## **2.1 Required Safe-Change Workflow**

**1\.** Run the existing application before changing code and record the baseline behavior.

**2\.** Inspect the repository architecture, package manager, environment files, database, API conventions, UI design system, authentication, and SMS implementation.

**3\.** Create a dedicated feature branch, for example: feature/sme-search-integration.

**4\.** Create a written implementation plan and list the files expected to change.

**5\.** Implement one phase at a time with small, reviewable commits.

**6\.** Run existing tests after every phase and add new tests for new behavior.

**7\.** Keep all new search functionality behind a feature flag until final acceptance.

**8\.** Provide screenshots or browser evidence for every completed UI flow.

**9\.** Provide rollback instructions and database migration rollback steps.

# **3\. TARGET USER FLOW AND FUNCTIONAL SCOPE**

LOGIN  
  ↓  
OPEN EXISTING SMS / CONTACT APPLICATION  
  ↓  
CLICK “SME SEARCH” OR OPEN SEARCH TAB  
  ↓  
SELECT SEARCH MODE  
  ├─ Commercial Road / Area Search  
  ├─ City \+ Category Search  
  ├─ Map Radius Search  
  └─ Free-Text Business Search  
  ↓  
RUN GOOGLE PLACES SEARCH  
  ↓  
NORMALIZE \+ DEDUPLICATE \+ CLASSIFY  
  ↓  
EXCLUDE LARGE FRANCHISES  
  ↓  
DISPLAY QUALIFIED SME CANDIDATES  
  ↓  
REVIEW / FILTER / SELECT  
  ↓  
SAVE AS LEAD OR ADD TO CONTACT LIST  
  ↓  
OPEN EXISTING SMS COMPOSER  
  ↓  
PREVIEW → CONFIRM → SEND  
  ↓  
STORE SEND RESULT AND CONTACT HISTORY

## **3.1 Search Modes**

| Mode | Input | Expected Behavior |
| :---- | :---- | :---- |
| Commercial Road / Area | City, commercial area, road, category, search radius | Use configured road/area coordinates or geocoded points to run targeted searches along known commercial corridors. |
| City \+ Category | City, business category, optional keyword | Run text-based or location-biased search for the selected city. |
| Map Radius | Map center or dropped pin, radius, category | Run Nearby Search using a circle restriction. |
| Free Text | Natural-language query | Run Text Search for queries such as “independent cafe in Tomas Morato Quezon City”. |

## **3.2 Initial Business Categories**

| Priority | Categories |
| :---- | :---- |
| A | Restaurant, Cafe, Bakery, Beauty Salon, Hair Salon, Spa, Skin Care Clinic, Dental Clinic, Veterinary Clinic, Gym / Fitness Center |
| B | Boutique, Pet Shop, Boutique Hotel, Tutorial Center, Language School, Auto Detailing, Car Repair, Event Supplier, Photography Studio, Furniture / Interior Store |
| C | Accounting Firm, Law Office, Property Broker, Recruitment Agency, Small BPO, Business Consulting |

## **3.3 Required Search Filters**

• City

• Commercial area

• Road name

• Business category

• Custom keyword

• Search radius

• Minimum rating

• Minimum and maximum review count

• Business status

• Has phone number

• Has website

• SME classification

• Franchise exclusion status

• Lead status

• Previously contacted / not contacted

• Do Not Contact exclusion

# **4\. SEARCH SCREEN AND UI/UX REQUIREMENTS**

The new feature must visually follow the existing application. Reuse the current layout, components, spacing, typography, buttons, modals, table patterns, notifications, and responsive behavior. Do not introduce a separate visual style.

## **4.1 Recommended Navigation**

| Location | Requirement |
| :---- | :---- |
| Primary navigation | Add “SME Search” or “Business Search” next to the existing contacts/SMS functions. |
| Mobile navigation | Use the current responsive navigation pattern. Do not hide essential search controls. |
| Permission control | Reuse existing role/permission architecture. Add a permission only if the current system already supports granular permissions. |
| Feature flag | Display the menu only when the SME Search feature flag is enabled. |

## **4.2 Search Page Layout**

┌────────────────────────────────────────────────────────────┐  
│ SME BUSINESS SEARCH                                       │  
├────────────────────────────────────────────────────────────┤  
│ Search Mode  \[Road/Area ▼\]                                │  
│ City \[Makati ▼\]  Area \[Poblacion ▼\]  Road \[Makati Ave ▼\] │  
│ Category \[Restaurant ▼\]  Radius \[500 m ▼\]                │  
│ Keyword \[\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\] \[SEARCH\]                │  
├────────────────────────────────────────────────────────────┤  
│ Quick Filters: \[SME Only\] \[Has Phone\] \[Not Contacted\]     │  
│ Results: 126 | Qualified: 83 | Excluded: 29 | Review: 14 │  
├────────────────────────────────────────────────────────────┤  
│ □ | Business | Category | Area | Rating | SME | Contact   │  
│ □ | Sample A | Cafe     | ...  | 4.6    | High| Phone     │  
│ □ | Sample B | Salon    | ...  | 4.2    | High| Website   │  
├────────────────────────────────────────────────────────────┤  
│ \[SAVE SELECTED\] \[ADD TO LIST\] \[OPEN SMS COMPOSER\]         │  
└────────────────────────────────────────────────────────────┘

## **4.3 Result Columns**

| Column | Requirement |
| :---- | :---- |
| Selection | Checkbox with select-all for the currently filtered page only. |
| Business | Display name and normalized name where useful. |
| Category | Primary type and mapped internal category. |
| Location | City, commercial area/road, formatted address. |
| Rating | Rating plus user rating count; support missing values. |
| Contact | Phone, website availability, and contact status icons. |
| SME Status | Independent, Local SME Chain, Manual Review, Large Chain, Excluded. |
| Lead Score | 0–100 with S/A/B/C/Low band. |
| Status | New, Saved, Contacted, Replied, Meeting, Proposal, Won, Lost, DNC. |
| Actions | View details, save, add to list, open SMS, exclude, correct classification. |

## **4.4 Result Detail Drawer / Modal**

• Business name and Google Maps link

• Address and map preview

• Category and business status

• Phone and website

• Rating and review count

• SME classification and reason codes

• Detected branch count

• Franchise match details

• Search source and date

• Existing lead/contact match

• Lead score breakdown

• Manual override controls

• Open existing SMS composer button

# **5\. GOOGLE PLACES API INTEGRATION REQUIREMENTS**

| Implementation Rule Use the current project’s Google integration pattern where possible. If the project uses a legacy Places endpoint, do not silently mix old and new response models. Create an adapter layer and document whether the implementation remains on Legacy temporarily or migrates to Places API (New). New development should prefer Places API (New) when compatible. |
| :---- |

## **5.1 API Selection Logic**

| Use Case | Preferred API | Reason |
| :---- | :---- | :---- |
| Natural-language road/area query | Text Search (New) | Supports text queries and pagination. |
| Category around a coordinate | Nearby Search (New) | Supports place types within a circle restriction. |
| Fetch selected business detail | Place Details (New) | Fetch only required detail fields for qualified candidates. |
| User input assistance | Autocomplete (New), optional | Use only if the existing UI benefits from address/place suggestions. |
| Map rendering | Existing Maps JavaScript integration | Reuse current map component and key restrictions. |

## **5.2 Staged Data Retrieval**

**1\.** Discovery stage: request the minimum fields needed to identify and classify results.

**2\.** Qualification stage: request business identity, address, type, business status, and map link only when needed.

**3\.** Contact stage: request phone, website, rating, and rating count only for businesses that pass SME filters or when the user explicitly opens details.

**4\.** Never request photos, reviews, generative summaries, or other high-cost fields unless separately approved.

## **5.3 Recommended Production Field Masks**

Text Search / Nearby Search discovery:  
places.id,places.displayName,places.formattedAddress,places.location,  
places.primaryType,places.types,places.businessStatus,places.googleMapsUri,nextPageToken

Place Details qualification/contact:  
id,displayName,formattedAddress,location,primaryType,types,businessStatus,  
googleMapsUri,nationalPhoneNumber,internationalPhoneNumber,websiteUri,  
rating,userRatingCount

## **5.4 Search Service Requirements**

• Create a server-side Google Places service wrapper. No browser-to-Places-Web-Service call with a secret key.

• Centralize request construction, field masks, timeout, retry, error mapping, logging, quota handling, and metrics.

• Use exponential backoff with jitter for retryable errors only.

• Do not retry invalid requests, permission errors, or quota errors indefinitely.

• Normalize all external responses into an internal SearchResult DTO so the rest of the app is not coupled to Google response structure.

• Support cancellation/abort when a user leaves the page or starts a new search.

• Persist a search-run record with parameters, status, result count, cost-related metadata where available, and error details.

• Use idempotency or search-run identifiers to avoid duplicate imports from repeated requests.

## **5.5 Commercial Road Search**

Import the previously prepared Metro Manila commercial-road dataset or create an equivalent search-zone configuration. Each road/area should support one or more search points, a default radius, priority, and enabled business categories.

| Field | Example |
| :---- | :---- |
| city | Parañaque |
| commercial\_area | BF Homes |
| road\_name | Aguirre Avenue |
| latitude / longitude | Configured search point |
| default\_radius\_m | 500 |
| priority | A+ |
| enabled | true |
| last\_scanned\_at | Timestamp |

## **5.6 Road Segmentation Rules**

| Area Density | Search Point Spacing | Typical Radius |
| :---- | :---- | :---- |
| Very dense CBD / premium commercial area | 200–300 m | 250–400 m |
| Dense restaurant / lifestyle district | 300–500 m | 400–600 m |
| General commercial corridor | 500–800 m | 500–800 m |

# **6\. SME QUALIFICATION AND FRANCHISE EXCLUSION LOGIC**

The system must not treat every Google result as an SME. Classification must combine a maintained franchise blacklist, normalized business names, observed branch counts, website-domain matching, and manual review.

## **6.1 Classification Values**

| Value | Meaning | Default Action |
| :---- | :---- | :---- |
| INDEPENDENT\_SME | One apparent location; no chain/franchise evidence | Include |
| LOCAL\_SME\_CHAIN | Small local brand, normally 2–5 observed locations | Include and prioritize |
| MANUAL\_REVIEW | Uncertain classification or approximately 6–9 observed locations | Show but do not bulk-contact until reviewed |
| LARGE\_CHAIN | Large multi-location brand without confirmed franchise-list match | Exclude by default |
| FRANCHISE\_EXCLUDED | Matched blacklist or confirmed national/global franchise | Exclude |
| MANUAL\_INCLUDE | User-approved exception | Include |
| MANUAL\_EXCLUDE | User-excluded business | Exclude |

## **6.2 Franchise Blacklist**

• Create an admin-managed franchise\_brand table.

• Support canonical brand name, aliases, normalized aliases, official domains, category, country scope, status, and notes.

• Preload a starter list only after review. Do not hard-code the entire blacklist in application logic.

• Support CSV import/export and manual correction.

• Keep a match reason and confidence score for auditability.

## **6.3 Business Name Normalization**

Input examples:  
ABC Café – BGC  
ABC Cafe Makati Branch  
ABC CAFE \- SM North

Normalized candidate:  
abc cafe

Normalization steps:  
1\. Unicode normalize  
2\. Lowercase  
3\. Remove punctuation and duplicate whitespace  
4\. Normalize “&” and common abbreviations consistently  
5\. Remove configurable branch/location suffixes  
6\. Remove “branch”, “store”, “outlet” only as separate tokens  
7\. Preserve the original name separately  
8\. Never overwrite a user-approved canonical name

## **6.4 Branch and Domain Heuristics**

| Observed Locations | Default Classification |
| :---- | :---- |
| 1 | Independent SME |
| 2–5 | Local SME Chain |
| 6–9 | Manual Review |
| 10+ | Large Chain Candidate |
| Confirmed franchise match | Franchise Excluded |

Domain matching must be treated as supporting evidence, not absolute truth. Shared mall, marketplace, directory, social-network, link-in-bio, or hosting domains must not be interpreted as a shared business brand domain.

## **6.5 Manual Override**

• Authorized users can mark Include, Exclude, Local SME Chain, or Franchise.

• Manual decisions override automated classification until explicitly reset.

• Every override must store user, timestamp, previous value, new value, and reason.

• Bulk SMS must respect the final effective classification.

# **7\. DATABASE AND DATA MIGRATION REQUIREMENTS**

| Migration Safety The agent must inspect the current database and ORM before writing schemas. The names below are conceptual. Adapt them to existing naming conventions. Use additive migrations and preserve all current records. |
| :---- |

## **7.1 Required New Entities**

| Entity | Purpose |
| :---- | :---- |
| search\_zone | City, commercial area, road, coordinates, radius, priority, and scan settings. |
| search\_run | One user/API search execution, parameters, status, counts, and errors. |
| place\_reference | Google place ID reference and source metadata. |
| business\_profile | Internal business record independent from transient API payloads. |
| business\_place\_link | Link internal business to a place reference. |
| franchise\_brand | Blacklist and alias/domain rules. |
| business\_classification | Automated and manual SME/franchise classification. |
| business\_contact | Phone, website, verified source, validity, and permission status. |
| lead | Sales lead and pipeline status. |
| lead\_list / lead\_list\_item | Reusable target lists for campaigns. |
| lead\_score | Score total, band, factors, and calculation version. |
| contact\_activity | Search, save, SMS, response, meeting, proposal, and notes. |
| do\_not\_contact | Opt-out and blocked-contact registry. |
| sms\_recipient\_link | Link existing SMS send/history records to a business/lead. |

## **7.2 Deduplication Keys**

• Google place ID: strongest external identity key.

• Normalized phone number: secondary duplicate signal.

• Normalized website host \+ normalized business name: supporting signal.

• Normalized name \+ approximate location: review signal only; do not auto-merge aggressively.

• Manual merge and unmerge must be available to administrators if the current data model supports it.

## **7.3 Data Storage Rules**

• Store Google place IDs as stable references and refresh stale IDs according to the current Google guidance.

• Store internally generated fields, user-entered notes, classification decisions, lead status, SMS history links, and source metadata in the application database.

• Do not create a permanent uncontrolled mirror of all Google response content.

• Every external-data field displayed from cache must record source and last-fetched time.

• Provide a refresh action for selected businesses and an automatic stale-data policy.

# **8\. INTEGRATION WITH THE EXISTING SMS MODULE**

The existing SMS sender is the authoritative sending implementation. The new feature must call or navigate into the existing composer and send workflow. Do not create a second SMS provider integration or parallel send-history system.

## **8.1 Required Actions from Search Results**

| Action | Behavior |
| :---- | :---- |
| Save selected | Create or link lead/contact records. Do not send. |
| Add to lead list | Add selected qualified leads to a reusable list. |
| Open SMS composer | Pass selected lead IDs or resolved contact IDs to the existing composer. |
| Send single SMS | Use the existing preview, validation, confirmation, provider call, and result handling. |
| Send bulk SMS | Use existing bulk rules, throttling, balance check, and send history. |
| View history | Show existing SMS records linked to the selected lead/business. |

## **8.2 Recipient Validation**

• Normalize Philippine numbers consistently, for example \+63 format internally if compatible with the provider.

• Do not invent a phone number when Google data is missing.

• Detect duplicates within the selected batch.

• Exclude Do Not Contact, opted-out, invalid, blocked, or previously hard-failed numbers.

• Display an exclusion summary before sending.

• Require explicit user confirmation for every bulk send.

• Never auto-send immediately after search, save, or import.

## **8.3 SMS Composer Context**

• Optional template variables: business name, city, commercial area, business category, and contact name if independently stored.

• Preview the final rendered message and character count before sending.

• Preserve existing SMS length, encoding, segmentation, and cost display logic.

• Allow the user to remove individual recipients before confirmation.

• Write the send result back to contact\_activity and the existing SMS history linkage.

# **9\. LEAD SCORING, SEARCH RESULTS, AND CRM STATUS**

Lead scoring is a prioritization aid, not an automatic decision to contact. The score must be explainable and versioned.

## **9.1 Initial 100-Point Model**

| Factor | Maximum | Example Inputs |
| :---- | :---- | :---- |
| SME confidence | 25 | Independent/local-chain status, no franchise evidence |
| Marketing need | 25 | No website, inactive social presence, no booking, weak digital footprint when independently assessed |
| Business potential | 20 | Priority category, commercial zone priority, business activity indicators |
| Contact availability | 20 | Valid public business phone, official website/contact channel |
| Commercial area value | 10 | A+/A/B zone priority |

## **9.2 Score Bands**

| Score | Band | Default Sales Action |
| :---- | :---- | :---- |
| 80–100 | S | Immediate personalized review and proposal |
| 65–79 | A | Priority outreach |
| 50–64 | B | Standard outreach or nurture list |
| 35–49 | C | Long-term nurture |
| 0–34 | Low | Hold / low priority |

## **9.3 Lead Status Values**

NEW → QUALIFIED → READY\_TO\_CONTACT → CONTACTED → REPLIED  
    → MEETING → PROPOSAL\_SENT → NEGOTIATING → WON  
    → LOST / NURTURE / DO\_NOT\_CONTACT

# **10\. SECURITY, COST CONTROL, AND DATA GOVERNANCE**

## **10.1 API Security**

• Use server-side credentials for Places Web Service calls.

• Apply API key restrictions by API and deployment environment where supported.

• Keep development, staging, and production credentials separate.

• Mask secrets in logs and error reports.

• Do not print full provider responses if they may contain sensitive configuration or excessive data.

## **10.2 Cost Control**

• Require explicit field masks and centralize them in configuration/constants.

• Use staged data retrieval; do not fetch contact fields for excluded businesses.

• Cache internal search-run processing only in a policy-compliant manner and record fetch timestamps.

• Add per-user and global search rate limits.

• Add daily/monthly internal usage counters if the current application has admin metrics.

• Prevent repeated accidental searches with disabled buttons, request state, and optional confirmation for large scans.

• Log API endpoint, result count, response status, latency, and field-mask profile without logging keys.

## **10.3 Contact Governance**

• Prioritize publicly listed business contact channels.

• Record the source URL/system and collection date.

• Support Opt Out and Do Not Contact statuses.

• Provide suppression-list checks before every send.

• Retain an audit trail of classification overrides and contact-status changes.

• Do not bypass the existing application’s consent, privacy, or messaging rules.

# **11\. ANTIGRAVITY MASTER PROMPT**

| Paste This First Paste the complete prompt below into Antigravity while the existing repository is open. Require the agent to stop after the discovery report and plan. Do not allow implementation before reviewing the plan. |
| :---- |

You are working inside an EXISTING production-oriented application that already integrates with Google Maps/Places functionality and already has an SMS sending module.

Your task is to enhance this existing application by adding an SME Business Search feature. The feature must discover businesses through Google Places, exclude large franchises, classify likely SMEs, save qualified businesses as leads/contacts, and pass selected recipients into the EXISTING SMS composer and send workflow.

NON-NEGOTIABLE RULES  
1\. Do not rebuild the application from scratch.  
2\. Do not create a separate replacement app.  
3\. Preserve all current routes, UI behavior, database records, SMS provider integration, SMS composer behavior, send history, authentication, permissions, and deployment behavior unless a change is strictly required.  
4\. Inspect the actual repository and adapt to its real technology stack. Do not assume React, Next.js, Node.js, Python, PostgreSQL, or any other stack until verified.  
5\. Do not change code yet. First produce a Repository Discovery Report and an Implementation Plan.  
6\. Identify the current frontend, backend, database/ORM, API architecture, environment handling, authentication, UI component system, Google integration, SMS integration, tests, CI/CD, and deployment structure.  
7\. Run the existing application and existing tests before modification. Record any pre-existing errors separately.  
8\. Identify the safest integration points for:  
   \- SME Search navigation/page  
   \- Google Places server-side service  
   \- search zones/commercial roads  
   \- search runs and result normalization  
   \- franchise exclusion and SME classification  
   \- lead/contact persistence  
   \- integration with the existing SMS composer  
   \- send-history linkage  
9\. Propose additive, reversible database changes only.  
10\. Keep all new functionality behind a feature flag until final acceptance.  
11\. Never expose API keys or SMS credentials in client-side code or logs.  
12\. Never auto-send SMS after search, save, or import. Sending must always use the existing preview and explicit confirmation flow.  
13\. Use Google Places field masks and staged retrieval to minimize API cost.  
14\. Preserve Google data source and refresh metadata. Store Place IDs as references and do not create an uncontrolled permanent mirror of all Google response content.  
15\. Every phase must include tests, changed-file summary, verification evidence, and rollback notes.

FIRST RESPONSE REQUIRED — DO NOT IMPLEMENT YET  
Provide:  
A. Repository architecture summary  
B. Current Google integration flow  
C. Current SMS flow from UI to provider and history  
D. Current database entities relevant to contacts/leads/SMS  
E. Current test and run commands  
F. Risks and compatibility concerns  
G. Proposed file-by-file implementation plan  
H. Proposed additive migration plan  
I. Proposed feature flag strategy  
J. Questions that can be answered from the repository itself — investigate them instead of asking me  
K. Only truly blocking questions, if any

Stop after the report and wait for approval before editing files.

# **12\. PHASE-BY-PHASE ANTIGRAVITY PROMPTS**

Execute the prompts below in order. At the start of every phase, tell Antigravity to review the previous implementation and current git diff. At the end of every phase, require tests and evidence.

## **PHASE 0 – BASELINE, BRANCH, AND SAFETY GATE**

Proceed with Phase 0 only.

1\. Create or confirm a dedicated feature branch named feature/sme-search-integration, using the repository’s existing branch conventions if different.  
2\. Run the current application, existing tests, lint, type checks, and build commands.  
3\. Record baseline behavior and pre-existing failures without fixing unrelated issues.  
4\. Confirm the current Google API integration and current SMS end-to-end flow.  
5\. Create a short implementation checklist in the repository using the project’s existing documentation convention. Do not add unnecessary documentation frameworks.  
6\. Define the feature flag for SME Search using the current configuration pattern. Default it OFF in production unless the project’s deployment convention requires otherwise.  
7\. Make no user-visible functional changes yet.

Deliver:  
\- baseline command results  
\- branch name  
\- feature flag name and location  
\- current architecture summary  
\- exact files changed  
\- rollback instructions  
Stop after Phase 0\.

## **PHASE 1 – INTERNAL SEARCH DOMAIN AND SAFE GOOGLE SERVICE ADAPTER**

Proceed with Phase 1 only. Review the current diff first.

Goal: add the internal search domain and a server-side Google Places adapter without adding the full UI yet.

Requirements:  
1\. Reuse the existing Google client/configuration if appropriate. If the current code is tightly coupled to UI or legacy response structures, create a thin adapter instead of rewriting unrelated code.  
2\. Add internal request/response types for SearchRequest, SearchRun, SearchResult, BusinessCandidate, SearchMode, and SearchFilters, following current code conventions.  
3\. Support these modes:  
   \- COMMERCIAL\_ROAD  
   \- CITY\_CATEGORY  
   \- MAP\_RADIUS  
   \- FREE\_TEXT  
4\. Add Text Search and/or Nearby Search calls according to the mode. Use Places API (New) when compatible with the current stack. If migration from Legacy is too risky, isolate the legacy implementation behind the same interface and document a later migration path.  
5\. Centralize production field masks. Do not use '\*'.  
6\. Add timeout, retry with exponential backoff and jitter for retryable failures, cancellation where supported, structured error mapping, and secret-safe logging.  
7\. Normalize Google responses into internal DTOs. The UI must not depend directly on the external response shape.  
8\. Add unit tests with mocked API responses for success, no results, pagination, timeout, quota error, invalid request, partial/missing fields, and closed business.  
9\. Do not call the SMS module in this phase.

Deliver:  
\- implementation summary  
\- API compatibility decision  
\- field masks used  
\- test results  
\- exact changed files  
\- known limitations  
\- rollback instructions  
Stop after Phase 1\.

## **PHASE 2 – ADDITIVE DATABASE MIGRATION AND SEARCH-ZONE IMPORT**

Proceed with Phase 2 only. Review the current diff and database conventions first.

Goal: add safe persistence for search zones, search runs, place references, business profiles, classifications, lead links, and contact-source metadata.

Requirements:  
1\. Adapt entity/table names to the existing data model; do not duplicate an existing contacts/leads abstraction.  
2\. Use additive, reversible migrations only.  
3\. Create or extend entities equivalent to:  
   \- search\_zone  
   \- search\_run  
   \- place\_reference  
   \- business\_profile  
   \- business\_place\_link  
   \- franchise\_brand  
   \- business\_classification  
   \- business\_contact  
   \- lead or existing lead/contact entity  
   \- lead\_list and lead\_list\_item if no equivalent exists  
   \- lead\_score  
   \- contact\_activity  
   \- do\_not\_contact or existing suppression table  
   \- link from existing SMS history to lead/business where safe  
4\. Add unique/index constraints for place ID, normalized phone, normalized domain/name combinations where appropriate.  
5\. Add source and fetched-at metadata for externally sourced fields.  
6\. Add a safe importer for the Metro Manila commercial-road Excel/CSV dataset. The importer must validate rows, report errors, be idempotent, and support dry-run mode.  
7\. Seed no large franchise list silently. Add only a small reviewed starter dataset or provide an import template.  
8\. Add migration and repository/service tests.  
9\. Verify migration up and down on a disposable database.

Deliver:  
\- ER/data-model summary  
\- migration files  
\- dry-run import example  
\- test results  
\- data rollback procedure  
\- exact changed files  
Stop after Phase 2\.

## **PHASE 3 – SME CLASSIFICATION, FRANCHISE EXCLUSION, AND DEDUPLICATION**

Proceed with Phase 3 only.

Goal: classify results and prevent large franchises from entering normal outreach lists.

Requirements:  
1\. Implement configurable business-name normalization while preserving original names.  
2\. Implement franchise matching by canonical brand, aliases, normalized aliases, and official domains.  
3\. Implement branch-count and domain heuristics as explainable evidence, not irreversible truth.  
4\. Use classifications:  
   INDEPENDENT\_SME, LOCAL\_SME\_CHAIN, MANUAL\_REVIEW, LARGE\_CHAIN, FRANCHISE\_EXCLUDED, MANUAL\_INCLUDE, MANUAL\_EXCLUDE.  
5\. Default rules:  
   1 observed location \= Independent SME  
   2–5 \= Local SME Chain  
   6–9 \= Manual Review  
   10+ \= Large Chain Candidate  
   confirmed blacklist match \= Franchise Excluded  
6\. Exclude common shared domains such as social networks, marketplaces, directory sites, mall sites, and link-in-bio services from domain ownership inference.  
7\. Implement duplicate detection by place ID first, then normalized phone, then supporting name/domain/location signals.  
8\. Never auto-merge low-confidence name/location matches.  
9\. Add manual override with audit history.  
10\. Add unit tests for accents, punctuation, branch suffixes, city/mall suffixes, aliases, false positives, shared domains, manual override, and duplicate handling.

Deliver:  
\- classification rule summary  
\- reason codes and confidence outputs  
\- test matrix and results  
\- exact changed files  
\- rollback notes  
Stop after Phase 3\.

## **PHASE 4 – SME SEARCH UI**

Proceed with Phase 4 only.

Goal: add the SME Search screen using the existing UI design system.

Requirements:  
1\. Add an SME Search navigation item controlled by the feature flag.  
2\. Reuse existing layouts, table components, forms, filters, loading states, notifications, modals/drawers, and responsive patterns.  
3\. Add search modes:  
   Commercial Road / Area  
   City \+ Category  
   Map Radius  
   Free Text  
4\. Add filters for city, area, road, category, keyword, radius, rating, review count, has phone, has website, SME classification, franchise exclusion, lead status, contacted status, and DNC exclusion.  
5\. Show summary counts: total, qualified, excluded, manual review, already saved, and errors.  
6\. Show result columns defined in the work order.  
7\. Add detail drawer/modal with classification reasons, branch evidence, source/fetch date, existing contact match, and Google Maps link.  
8\. Support selection, current-page select all, save selected, add to list, and open SMS composer. Do not send from the result table directly.  
9\. Add empty, loading, partial-success, no-result, rate-limit, permission, and API-error states.  
10\. Add accessible labels, keyboard behavior, and responsive verification.  
11\. Add UI tests using the project’s current test framework.

Deliver:  
\- screenshots or browser recordings for desktop and mobile  
\- component list reused vs. added  
\- tests and build results  
\- exact changed files  
\- rollback notes  
Stop after Phase 4\.

## **PHASE 5 – LEAD SAVE, LIST MANAGEMENT, AND EXISTING SMS COMPOSER INTEGRATION**

Proceed with Phase 5 only.

Goal: connect qualified search results to the existing contact/lead and SMS workflows.

Requirements:  
1\. Save selected candidates idempotently. If a matching lead/contact exists, link/update safely instead of creating a duplicate.  
2\. Add selected leads to an existing list/campaign abstraction. If none exists, add a minimal lead-list abstraction consistent with the current architecture.  
3\. Integrate “Open SMS Composer” by passing internal lead/contact IDs to the EXISTING composer.  
4\. Reuse existing phone normalization, message preview, character/segment count, provider balance checks, confirmation, throttling, send call, result display, and history.  
5\. Add pre-send filtering for missing/invalid numbers, duplicates, opted-out, DNC, blocked, hard-failed, excluded franchise, and unreviewed MANUAL\_REVIEW leads.  
6\. Show the user a recipient summary: selected, valid, excluded, duplicate, missing phone, DNC, and final send count.  
7\. Require explicit confirmation. Never auto-send.  
8\. Link send results and existing SMS history back to the lead/business contact activity.  
9\. Preserve all existing SMS behavior for users who do not use SME Search.  
10\. Add integration tests from saved search result to composer and mocked send result.

Deliver:  
\- end-to-end browser evidence  
\- recipient validation examples  
\- tests and build results  
\- exact changed files  
\- confirmation that legacy SMS flow is unchanged  
\- rollback notes  
Stop after Phase 5\.

## **PHASE 6 – LEAD SCORE, STATUS, ADMIN CONTROLS, AND OPERATIONS**

Proceed with Phase 6 only.

Goal: add explainable prioritization and operational controls.

Requirements:  
1\. Implement a versioned 100-point lead score with configurable factor weights:  
   SME confidence 25  
   Marketing need 25  
   Business potential 20  
   Contact availability 20  
   Commercial area value 10  
2\. Do not claim social inactivity or website weakness unless supported by independently collected and timestamped evidence. Missing evidence must remain unknown, not negative.  
3\. Add S/A/B/C/Low bands and score breakdown.  
4\. Add lead statuses:  
   NEW, QUALIFIED, READY\_TO\_CONTACT, CONTACTED, REPLIED, MEETING, PROPOSAL\_SENT, NEGOTIATING, WON, LOST, NURTURE, DO\_NOT\_CONTACT.  
5\. Add admin controls for franchise brands, aliases, domains, search zones, category mappings, feature flag visibility, and classification overrides.  
6\. Add CSV export only if the current app already supports export or there is a clear secure pattern. Export must respect DNC and permissions.  
7\. Add operational metrics if compatible: searches, API errors, results, qualified count, saved leads, contacted leads, and SMS outcomes.  
8\. Add tests for score versions, unknown evidence, manual overrides, permissions, and DNC behavior.

Deliver:  
\- scoring examples  
\- admin screenshots  
\- test results  
\- exact changed files  
\- rollback notes  
Stop after Phase 6\.

## **PHASE 7 – STABILIZATION, SECURITY REVIEW, PERFORMANCE, AND FINAL ACCEPTANCE**

Proceed with Phase 7 only. Do not add new scope unless required to fix a defect.

1\. Run all existing and new tests, lint, type checks, build, migration verification, and end-to-end tests.  
2\. Verify the existing non-search SMS workflow is unchanged.  
3\. Verify no secrets are present in client bundles, logs, screenshots, git diff, or generated documentation.  
4\. Verify Places requests are server-side and use explicit field masks.  
5\. Verify search rate limiting, duplicate-request protection, loading-state protection, retry limits, and error handling.  
6\. Verify database indexes and query performance for expected volumes.  
7\. Verify pagination and large result sets.  
8\. Verify mobile/responsive behavior and accessibility basics.  
9\. Verify DNC/opt-out suppression before every SMS send.  
10\. Verify feature flag OFF behavior and rollback.  
11\. Produce a final changed-file inventory, configuration guide, migration guide, rollback guide, operator guide, and known limitations.  
12\. Provide screenshots/browser recordings covering the full accepted flow.  
13\. Do not mark complete if any acceptance criterion fails. Clearly list remaining failures.

Final evidence required:  
\- test command outputs  
\- build output  
\- migration up/down evidence  
\- end-to-end flow evidence  
\- security checklist  
\- API field-mask list  
\- feature-flag behavior  
\- legacy regression result  
\- known limitations  
\- rollback procedure

# **13\. TESTING, STABILIZATION, AND ACCEPTANCE CRITERIA**

## **13.1 Required Test Coverage**

| Layer | Minimum Coverage |
| :---- | :---- |
| Unit | Name normalization, franchise matching, classification, dedupe, score calculation, phone filtering, DNC suppression, API error mapping. |
| Service/API | Search request validation, Text/Nearby adapter, pagination, staged details, save idempotency, permissions, rate limits. |
| Database | Migration up/down, constraints, imports, duplicate prevention, audit history. |
| UI | Search forms, filters, loading/errors, results, selection, save, composer navigation, accessibility basics. |
| Integration | Search → classify → save → open existing composer → preview → confirmed mocked send → history linkage. |
| Regression | Existing SMS send, contact management, authentication, navigation, and deployment build remain operational. |

## **13.2 Functional Acceptance Checklist**

☐ Feature is available only when enabled.

☐ Existing users can continue using the old SMS flow without behavior change.

☐ User can search by commercial road/area, city/category, radius, and free text.

☐ Google results are normalized into internal models.

☐ Duplicates are not repeatedly inserted.

☐ Known franchises are excluded with a visible reason.

☐ Local SME chains can remain included.

☐ Manual Review records cannot enter bulk SMS without review.

☐ Manual override is audited.

☐ Qualified businesses can be saved as leads.

☐ Selected leads can open the existing SMS composer.

☐ Invalid, duplicate, missing, opted-out, DNC, and blocked numbers are excluded before send.

☐ Every bulk send requires preview and confirmation.

☐ Send history is linked back to the business/lead.

☐ No API secret is exposed to the browser.

☐ Production field masks are explicit.

☐ All migrations are reversible.

☐ All tests and builds pass, or pre-existing failures are clearly separated and unchanged.

## **13.3 Non-Functional Acceptance**

| Area | Acceptance Standard |
| :---- | :---- |
| Performance | Search UI remains responsive; long calls show progress; repeated clicks do not create duplicate runs. |
| Reliability | Retry only retryable errors with a bounded policy; partial failures are visible. |
| Security | No secrets exposed; permissions enforced server-side; inputs validated. |
| Cost | Field masks and staged details implemented; no production wildcard field mask. |
| Maintainability | External API isolated behind adapter/service; rules configurable; code follows existing architecture. |
| Auditability | Search source, fetch time, classification reason, override history, contact source, and SMS activity are traceable. |
| Rollback | Feature flag and documented migration/code rollback are available. |

# **14\. REQUIRED DELIVERABLES AND HANDOVER**

☐ Committed source code in the approved feature branch.

☐ Clean pull request or change package with scope summary.

☐ Changed-file inventory with purpose of each change.

☐ Database migration files and rollback instructions.

☐ Environment-variable/configuration guide without real secrets.

☐ Commercial-road search-zone import template and instructions.

☐ Franchise blacklist import template and starter data review notes.

☐ API endpoint and internal service documentation.

☐ Operator guide for searching, filtering, saving, sending, excluding, overriding, and handling DNC.

☐ Test report and command outputs.

☐ Desktop and mobile screenshots or Antigravity browser recordings.

☐ Known limitations and deferred improvements.

☐ Production deployment checklist and post-deployment smoke test.

☐ Rollback checklist.

| Completion Rule “The code compiles” is not sufficient. Completion requires verified legacy behavior, accepted end-to-end SME search-to-SMS flow, reversible migrations, security review, explicit API field masks, and evidence for every acceptance criterion. |
| :---- |

# **APPENDIX A. SUGGESTED DATA MODEL**

| Entity | Key Fields (Conceptual) |
| :---- | :---- |
| search\_zone | id, city, commercial\_area, road\_name, latitude, longitude, radius\_m, priority, enabled, last\_scanned\_at |
| search\_run | id, user\_id, mode, parameters\_json, status, result\_count, qualified\_count, excluded\_count, started\_at, completed\_at, error\_code |
| place\_reference | id, provider, provider\_place\_id, source\_query, first\_seen\_at, last\_fetched\_at, last\_id\_refreshed\_at |
| business\_profile | id, display\_name, normalized\_name, internal\_category, city, area, address, status |
| business\_contact | id, business\_id, type, value, normalized\_value, source, verified\_at, validity\_status, is\_primary |
| franchise\_brand | id, canonical\_name, aliases, normalized\_aliases, official\_domains, scope, active |
| business\_classification | business\_id, auto\_class, effective\_class, confidence, reason\_codes, branch\_count, override\_user\_id, override\_reason |
| lead | id, business\_id, owner\_id, status, priority, score, score\_band, created\_at, last\_contacted\_at |
| lead\_score | lead\_id, version, total, factors\_json, calculated\_at |
| contact\_activity | id, lead\_id, business\_id, type, channel, status, occurred\_at, metadata\_json |
| do\_not\_contact | id, normalized\_contact, channel, reason, source, created\_at, active |
| sms\_recipient\_link | existing\_sms\_record\_id, lead\_id, business\_id, business\_contact\_id |

# **APPENDIX B. API EXAMPLES AND FIELD MASKS**

These examples are implementation references. The agent must adapt them to the actual language/framework and the latest official API contract.

## **B.1 Text Search (New) – ID-First Example**

POST https://places.googleapis.com/v1/places:searchText  
Headers:  
  Content-Type: application/json  
  X-Goog-Api-Key: ${GOOGLE\_MAPS\_API\_KEY}  
  X-Goog-FieldMask: places.id,nextPageToken

Body:  
{  
  "textQuery": "independent cafe in Aguirre Avenue BF Homes Paranaque",  
  "pageSize": 20,  
  "languageCode": "en",  
  "regionCode": "PH"  
}

## **B.2 Nearby Search (New) – Category Around Search Point**

POST https://places.googleapis.com/v1/places:searchNearby  
Headers:  
  Content-Type: application/json  
  X-Goog-Api-Key: ${GOOGLE\_MAPS\_API\_KEY}  
  X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,  
                    places.location,places.primaryType,places.businessStatus

Body:  
{  
  "includedTypes": \["restaurant"\],  
  "maxResultCount": 20,  
  "locationRestriction": {  
    "circle": {  
      "center": {  
        "latitude": 14.XXX,  
        "longitude": 121.XXX  
      },  
      "radius": 500.0  
    }  
  },  
  "languageCode": "en",  
  "regionCode": "PH"  
}

## **B.3 Place Details (New) – Qualified Candidate**

GET https://places.googleapis.com/v1/places/{PLACE\_ID}  
Headers:  
  X-Goog-Api-Key: ${GOOGLE\_MAPS\_API\_KEY}  
  X-Goog-FieldMask: id,displayName,formattedAddress,location,primaryType,  
                    types,businessStatus,googleMapsUri,nationalPhoneNumber,  
                    internationalPhoneNumber,websiteUri,rating,userRatingCount

## **B.4 Internal Search API Example**

POST /api/sme-search/runs  
{  
  "mode": "COMMERCIAL\_ROAD",  
  "city": "Paranaque",  
  "commercialArea": "BF Homes",  
  "roadName": "Aguirre Avenue",  
  "category": "restaurant",  
  "radiusMeters": 500,  
  "filters": {  
    "smeOnly": true,  
    "hasPhone": true,  
    "excludePreviouslyContacted": false,  
    "excludeDoNotContact": true  
  }  
}

Response:  
{  
  "searchRunId": "...",  
  "status": "COMPLETED",  
  "summary": {  
    "total": 120,  
    "qualified": 78,  
    "manualReview": 16,  
    "excluded": 26  
  },  
  "results": \[ ...internal DTOs... \]  
}

# **APPENDIX C. OFFICIAL TECHNICAL REFERENCES**

Use the current official documentation during implementation because API behavior, supported place types, and billing rules may change.

**•** [Google Antigravity Documentation](https://antigravity.google/docs/home) — https://antigravity.google/docs/home

**•** [Google Places API Overview](https://developers.google.com/maps/documentation/places/web-service/overview) — https://developers.google.com/maps/documentation/places/web-service/overview

**•** [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) — https://developers.google.com/maps/documentation/places/web-service/text-search

**•** [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search) — https://developers.google.com/maps/documentation/places/web-service/nearby-search

**•** [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details) — https://developers.google.com/maps/documentation/places/web-service/place-details

**•** [Place Data Fields (New)](https://developers.google.com/maps/documentation/places/web-service/data-fields) — https://developers.google.com/maps/documentation/places/web-service/data-fields

**•** [Choose Fields / Field Masks](https://developers.google.com/maps/documentation/places/web-service/choose-fields) — https://developers.google.com/maps/documentation/places/web-service/choose-fields

**•** [Place Types (New)](https://developers.google.com/maps/documentation/places/web-service/place-types) — https://developers.google.com/maps/documentation/places/web-service/place-types

**•** [Places API Policies and Attributions](https://developers.google.com/maps/documentation/places/web-service/policies) — https://developers.google.com/maps/documentation/places/web-service/policies

**•** [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id) — https://developers.google.com/maps/documentation/places/web-service/place-id

**•** [Places API Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) — https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

| Final Instruction to the Antigravity Agent When repository reality conflicts with an example in this document, preserve the intent and acceptance criteria but adapt the implementation to the actual architecture. Document every deviation and its reason. Do not silently change scope. |
| :---- |

