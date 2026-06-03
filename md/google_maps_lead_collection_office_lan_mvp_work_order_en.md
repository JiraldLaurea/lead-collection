# Google Maps Lead Collection MVP - Office LAN Only Work Order

Document version: v1.1 Office LAN Restricted MVP  
Date: 2026-06-02  
Project name: Google Maps Lead Collection MVP - Office LAN Only  
Development tools: Compatible with Claude Code / Antigravity / Codex  
Objective: Build a Google Maps / Google Places API based lead collection MVP that can run only inside the same office network.

---

## 0. Executive Summary

This project should be developed as an **office-internal local web application**, not as a public web service. Users must be able to access the tool only from PCs connected to the same office Wi-Fi or wired LAN, using a URL such as:

```text
http://<office-server-private-ip>:3000
```

### Strictly Prohibited

- Do not deploy to public cloud hosting such as Vercel, Netlify, Render, or Railway.
- Do not use external tunneling services such as ngrok, Cloudflare Tunnel, Tailscale Funnel, or localhost.run.
- Do not configure router port forwarding.
- Do not expose the app directly through a public IP address.
- Do not expose the Google API key in the frontend bundle.
- Do not scrape the Google Maps website UI.

### MVP Completion Criteria

1. The app must be accessible only from PCs on the same office network.
2. The app must not be accessible from mobile data, external Wi-Fi, or any non-office internet connection.
3. The backend must enforce an IP CIDR allowlist.
4. The host PC or office server firewall must allow access only from the approved office IP range.
5. Google Places API calls must be performed only on the server side.
6. The app must support business information collection, local storage, deduplication, filtering, CSV export, and Excel export.

---

## 1. Project Scope

### 1.1 Included Features

| Area | Requirement |
|---|---|
| Runtime model | Office LAN-only local web app |
| Access URL | `http://192.168.x.x:3000` or a fixed office private IP |
| Search | Search Google Places API by country, city, area, category, and keyword |
| Storage | Save search results into a local SQLite database |
| Deduplication | Deduplicate by Google Place ID |
| Lead management | Lead list, search, filters, sorting, and detail view |
| Export | CSV and Excel `.xlsx` export |
| Logs | Search logs, API error logs, and access-denied logs |
| Security restrictions | IP allowlist, firewall, admin password, and server-only API key storage |

### 1.2 Excluded Features

| Excluded Item | Reason |
|---|---|
| Automated email sending | This MVP is limited to information collection |
| Automated SMS sending | Excluded due to cost, regulation, and spam risk |
| Follow-up email automation | Treated as a CRM feature, outside this MVP |
| Multi-user SaaS | Outside the internal MVP scope |
| Payment/subscription | Outside MVP scope |
| Google Maps page scraping | Use only official APIs due to policy and stability risks |
| External access | The target is same-office internal execution only |

---

## 2. Office-Only Execution Architecture

### 2.1 Recommended Architecture

```text
[Office User PC]
        |
        | Same Office Wi-Fi / LAN only
        v
[Office Router / Switch]
        |
        v
[Host PC or Mini Server]
- Next.js local web app
- Backend API
- SQLite DB
- Export folder
- Google Places API server-side call
```

### 2.2 Execution Method

The developer must implement the app so that it can be run as follows:

```bash
npm run build
npm run start:office
```

Expected access URL:

```text
http://192.168.0.106:3000
```

`192.168.0.106` is only an example. It must be replaced with the actual private IP address of the host PC or office server.

### 2.3 Network Restriction Principles

| Layer | Restriction Method | Mandatory |
|---|---|---:|
| Router/network | No port forwarding; block external access | Yes |
| OS firewall | Allow port 3000 only from the office CIDR range | Yes |
| Application | Return 403 when the request IP is outside the allowlist | Yes |
| Admin authentication | Admin password or login session | Yes |
| API key protection | Store only in server `.env.local` | Yes |

**Important:** Application-level IP blocking alone is not sufficient. It must be combined with OS firewall rules or router/network policy.

---

## 3. Recommended Technology Stack

| Area | Recommended Technology | Notes |
|---|---|---|
| Frontend | Next.js / React | Compatible with the existing `:3000` structure |
| Backend | Next.js API Routes or Express API | Server-side Google Places API calls |
| Database | SQLite | Suitable for local MVP; low setup burden |
| ORM | Prisma | Schema management and migration |
| Export | json2csv, exceljs | CSV/Excel download |
| IP restriction | `ipaddr.js` or `cidr-matcher` | CIDR allowlist validation |
| Configuration | `.env.local` | API key, allowed IP range, and port settings |
| Runtime | Node.js LTS | Local server execution |

---

## 4. Environment Variable Design

The developer must provide a complete `.env.example` file.

```env
# App Mode
APP_MODE=office_lan_mvp
NODE_ENV=production
APP_PORT=3000
BIND_HOST=0.0.0.0

# Office-only access control
OFFICE_ALLOWED_CIDRS=127.0.0.1/32,::1/128,192.168.0.0/24
BLOCK_PUBLIC_ACCESS=true
TRUST_PROXY=false
REQUIRE_ADMIN_LOGIN=true

# Admin login
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=replace_with_bcrypt_hash
SESSION_SECRET=replace_with_long_random_secret

# Google Maps / Places API
GOOGLE_MAPS_API_KEY=replace_with_server_side_api_key
GOOGLE_PLACES_FIELD_MASK=places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus,places.regularOpeningHours,places.types

# Database and export
DATABASE_URL=file:./data/leads.sqlite
EXPORT_DIR=./exports
LOG_DIR=./logs
```

### 4.1 Default Security Values

- If `OFFICE_ALLOWED_CIDRS` is empty, the app must allow **localhost only**.
- If `BLOCK_PUBLIC_ACCESS=true`, requests from public IP ranges must always be blocked.
- `TRUST_PROXY=false` must be the default. For an internal local server with no proxy, `X-Forwarded-For` must not be trusted.
- `GOOGLE_MAPS_API_KEY` must never appear in frontend code or browser responses.

---

## 5. Application Access Restriction Requirements

### 5.1 IP Allowlist Middleware

All pages and API requests must pass through server middleware that checks the request IP.

Required behavior:

```text
IF request_ip is in OFFICE_ALLOWED_CIDRS:
    allow request
ELSE:
    return 403 Forbidden
    write access_denied log
```

### 5.2 IP Detection Rules

The developer must determine the request IP in this order:

1. Use the socket remote address by default.
2. Use `X-Forwarded-For` only when `TRUST_PROXY=true`.
3. Handle IPv4-mapped IPv6 addresses, for example: `::ffff:192.168.0.10` → `192.168.0.10`.
4. If CIDR matching fails, fail closed and block the request.

### 5.3 Access Denied Screen

When a user accesses the app from an external network or a non-allowed IP address, show the following message:

```text
403 Forbidden
This application is restricted to the approved office network only.
Your IP address is not allowed.
```

For admin troubleshooting, the blocked IP address may be displayed. However, API keys and internal configuration values must never be displayed.

---

## 6. OS Firewall Requirements

The developer must include Windows firewall setup instructions in the README.

### 6.1 Windows Defender Firewall Example

If the office network is `192.168.0.0/24`:

```powershell
New-NetFirewallRule `
  -DisplayName "Lead Collection MVP Office LAN Only" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 3000 `
  -RemoteAddress 192.168.0.0/24
```

Example block rule:

```powershell
New-NetFirewallRule `
  -DisplayName "Block Lead Collection MVP External Access" `
  -Direction Inbound `
  -Action Block `
  -Protocol TCP `
  -LocalPort 3000 `
  -RemoteAddress Any
```

In the final README, the developer must explain how to verify the priority and behavior of the allow/block rules in Windows Defender Firewall.

### 6.2 macOS/Linux Example

Linux UFW example:

```bash
sudo ufw allow from 192.168.0.0/24 to any port 3000 proto tcp
sudo ufw deny 3000/tcp
sudo ufw status verbose
```

---

## 7. Google Places API Collection Requirements

### 7.1 Search Methods

The MVP must support the following two search modes:

| Search Method | Description |
|---|---|
| Text Search | Keyword search such as `restaurant in Makati` or `Korean company in BGC` |
| Nearby Search | Search businesses using a reference location and radius |

### 7.2 Stored Fields

| Field Name | Description | Required |
|---|---|---:|
| place_id | Google Place ID | Yes |
| business_name | Business name | Yes |
| category | Business category/type | Optional |
| formatted_address | Address | Yes |
| phone_number | Phone number | Optional |
| website_url | Website | Optional |
| google_maps_url | Google Maps URL | Optional |
| rating | Rating | Optional |
| review_count | Number of reviews | Optional |
| business_status | Business status | Optional |
| opening_hours | Opening hours | Optional |
| search_keyword | Search keyword | Yes |
| search_location | Search location | Yes |
| source | Fixed value: `google_places_api` | Yes |
| collected_at | Collection timestamp | Yes |
| last_refreshed_at | Last refresh timestamp | Optional |

### 7.3 Field Mask Principles

- Request only the fields required for the MVP.
- Do not request unnecessary photos, review text, or advanced place details that may increase cost.
- Manage the field mask in `.env.local` so it can be adjusted during operation.

---

## 8. Database Schema Requirements

### 8.1 `leads` Table

```sql
CREATE TABLE leads (
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
  source TEXT NOT NULL DEFAULT 'google_places_api',
  collected_at DATETIME NOT NULL,
  last_refreshed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2 `search_jobs` Table

```sql
CREATE TABLE search_jobs (
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
```

### 8.3 `access_logs` Table

```sql
CREATE TABLE access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 8.4 `api_error_logs` Table

```sql
CREATE TABLE api_error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  endpoint TEXT,
  error_code TEXT,
  error_message TEXT,
  request_context TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. UI Requirements

### 9.1 Dashboard

The dashboard must show:

- Total saved leads
- Leads collected today
- Number of duplicates skipped
- Last search time
- Recent API errors
- Current allowed CIDR range
- Current server private IP guide

### 9.2 Search Page

Input fields:

| Field | Description |
|---|---|
| Country | Example: Philippines |
| City / Area | Example: Makati, BGC, Ortigas |
| Keyword | Example: restaurant, Korean company, accounting firm |
| Search Type | Text Search / Nearby Search |
| Radius | Used only for Nearby Search |
| Max Results | Maximum number of results, considering API and cost limits |

Required buttons:

- Search Preview
- Collect Leads
- Stop Current Job

### 9.3 Leads Page

Required functions:

- Table view
- Keyword filter
- Area filter
- Category filter
- Rating filter
- Website availability filter
- Phone availability filter
- Deduplication status check
- Detail view
- Delete selected leads

### 9.4 Export Page

Download options:

- Download all leads
- Download filtered results only
- CSV download
- Excel download
- Export history display

### 9.5 Settings Page

Displayed/settings items:

- Current app mode: `office_lan_mvp`
- Allowed CIDR list
- Internal server access URL
- Whether the Google Places API key is configured
- Database path
- Export folder path

The raw API key must not be displayed. Show only the last 4 characters if needed.

### 9.6 Access Logs Page

Displayed items:

- Access timestamp
- Request IP
- Request path
- Allowed/blocked decision
- Block reason

---

## 10. API Endpoint Requirements

| Method | Endpoint | Description | Internal Network Restriction |
|---|---|---|---:|
| GET | `/` | Dashboard | Required |
| GET | `/leads` | Lead list | Required |
| POST | `/api/places/search` | Run Google Places search | Required |
| GET | `/api/leads` | Lead list API | Required |
| GET | `/api/leads/:id` | Lead detail | Required |
| DELETE | `/api/leads/:id` | Delete lead | Required |
| GET | `/api/export/csv` | CSV download | Required |
| GET | `/api/export/xlsx` | Excel download | Required |
| GET | `/api/network/status` | Check current server/network allowlist | Required |
| GET | `/api/logs/access` | Access logs | Required |
| GET | `/health` | Health check | localhost or internal network only |

All APIs must pass through the IP allowlist middleware.

---

## 11. Development Phases

### Phase 0. Pre-check & Stabilization

Before development, Claude Code must perform the following:

1. Inspect the existing project structure.
2. Check for duplicate routes, duplicate settings, and duplicate environment variables.
3. Check for conflicts across `.env`, `.env.local`, and `.env.example`.
4. Back up the existing database file if one exists.
5. Check the current Git status and create a pre-work commit.
6. Verify Node.js and npm versions.
7. Check whether port 3000 is already in use.
8. Remove or disable prior public deployment, tunneling, or port-forwarding related code or documentation.
9. Create a backup folder before modifying working code.

Completion criteria:

```text
- Existing working functionality is not broken
- npm install succeeds
- npm run build succeeds
- npm run start:office is ready
- Rollback method is documented
```

### Phase 1. Office LAN-Only Foundation

Development tasks:

1. Add the `OFFICE_ALLOWED_CIDRS` environment variable.
2. Implement IP allowlist middleware.
3. Implement a 403 access-denied page.
4. Save access logs.
5. Create `.env.example`.
6. Add the `start:office` script.
7. Add office-internal execution instructions to the README.

Example `package.json` script:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "start:office": "next start -H 0.0.0.0 -p 3000"
  }
}
```

### Phase 2. Google Places Lead Collection

Development tasks:

1. Implement a server-side Google Places API service module.
2. Implement Text Search.
3. Implement Nearby Search.
4. Apply field masks.
5. Handle API errors.
6. Save search job logs.
7. Deduplicate by Google Place ID.
8. Save collected results into the database.

### Phase 3. Lead Management UI

Development tasks:

1. Lead list page
2. Lead detail page
3. Search/filter/sort functions
4. Delete function
5. Collection status display
6. Duplicate-skipped count display

### Phase 4. Export

Development tasks:

1. CSV download
2. Excel download
3. Filtered result download
4. Download filename convention
5. Automatic export folder creation

Filename examples:

```text
leads_philippines_makati_restaurant_2026-06-02.csv
leads_philippines_makati_restaurant_2026-06-02.xlsx
```

### Phase 5. Validation & Handover

Validation items:

1. Access succeeds from a PC on the same office LAN.
2. Access fails from an external network.
3. Non-allowed IPs receive a 403 response.
4. Access-denied logs are saved.
5. The Google API key is not exposed in the browser.
6. Lead collection succeeds.
7. Deduplication succeeds.
8. CSV/Excel downloads succeed.
9. Build succeeds.
10. Database data remains after app restart.

---

## 12. Acceptance Criteria

| ID | Condition | Pass Criteria |
|---|---|---|
| AC-01 | Internal network access | A PC on the same office LAN can access `http://<private-ip>:3000` |
| AC-02 | External network block | Access from mobile data or external Wi-Fi fails |
| AC-03 | IP allowlist | IPs outside the allowed CIDR return 403 |
| AC-04 | Access logs | Allowed and blocked requests are recorded in `access_logs` |
| AC-05 | API key protection | Google API key is not exposed in browser source or network responses |
| AC-06 | Official API usage | Only the Places API is used; no Google Maps page scraping |
| AC-07 | Deduplication | The same Place ID is stored as only one lead |
| AC-08 | Export | CSV and Excel downloads work |
| AC-09 | Build | `npm run build` succeeds |
| AC-10 | Restart persistence | Existing data remains after restarting the app |
| AC-11 | Block page | A 403 page appears for blocked access |
| AC-12 | Documentation | README includes office execution and firewall setup instructions |

---

## 13. Test Scenarios

### 13.1 Internal Network Test

1. Check the private IP address on the host PC.

```powershell
ipconfig
```

2. Access the app from another office PC.

```text
http://192.168.0.106:3000
```

3. Pass if the Dashboard opens successfully.

### 13.2 External Network Block Test

1. Switch a mobile phone to mobile data.
2. Open the same URL in the phone browser.
3. Confirm that the connection fails or a 403 page appears.
4. Confirm that the block event is saved in `access_logs`.

### 13.3 API Key Exposure Test

1. Open browser developer tools.
2. Search for `GOOGLE_MAPS_API_KEY` in Sources and Network.
3. Fail if the raw API key is found.
4. Confirm that Google API calls are performed only on the server side.

### 13.4 Lead Collection Test

Search example:

```text
Country: Philippines
Area: Makati
Keyword: accounting firm
Search Type: Text Search
Max Results: 20
```

Pass criteria:

- Search results are saved.
- Data is created in the `leads` table.
- Running the same search again does not create duplicate leads.
- CSV/Excel download works.

---

## 14. Beginner Setup Guide Requirements

The developer must write the README in the following order.

### 14.1 Installation

```bash
git clone <repository-url>
cd <project-folder>
npm install
cp .env.example .env.local
```

### 14.2 Edit Environment Variables

```env
OFFICE_ALLOWED_CIDRS=127.0.0.1/32,192.168.0.0/24
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 14.3 Initialize Database

```bash
npx prisma migrate dev
```

### 14.4 Build and Run

```bash
npm run build
npm run start:office
```

### 14.5 Access

Host PC:

```text
http://localhost:3000
```

Office LAN PC:

```text
http://<host-pc-private-ip>:3000
```

---

## 15. Operational Risks and Countermeasures

| Risk | Countermeasure |
|---|---|
| External exposure | No port forwarding; firewall restriction; app-level IP restriction |
| API key leakage | Store in server `.env.local`; no frontend exposure; apply API restrictions |
| Google API cost increase | Minimize field mask; limit max results; display search logs |
| Duplicate data | Enforce UNIQUE constraint on Place ID |
| Office IP change | Show current IP and allowed CIDR on the Settings page |
| Incorrect CIDR setting | Fail closed and allow localhost only |
| Unauthorized user access | Require admin login |
| Data loss | Provide SQLite DB backup and export functions |

---

## 16. Google API and Policy Compliance Requirements

The developer must follow these principles:

1. Do not automatically scrape the Google Maps website UI.
2. Use only the Google Places API.
3. Deduplicate by Google Place ID.
4. Use the Google API key only on the server side.
5. Configure API restrictions in Google Cloud Console.
6. Apply IP address restrictions to the server-side API key when possible.
7. Check Google Maps Platform policies and document the allowed display/storage/caching rules in the README.
8. Do not store raw Google API responses, photos, or review text long-term unless the applicable policy clearly allows it.
9. Add Google attribution or other required policy notices to the UI where required.

Official references:

- Places API Policies: https://developers.google.com/maps/documentation/places/web-service/policies
- Place IDs: https://developers.google.com/maps/documentation/places/web-service/place-id
- Google Cloud API Key Restrictions: https://docs.cloud.google.com/docs/authentication/api-keys
- Places API Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Places API Nearby Search: https://developers.google.com/maps/documentation/places/web-service/nearby-search

---

## 17. Final Development Prompt for Claude Code

Copy and paste the following into Claude Code or Antigravity.

```text
You are building an MVP for an internal B2B sales lead collection tool.

Project goal:
Build a Google Maps / Google Places API based lead collection MVP that runs only inside the same office LAN. This is not a public SaaS and must not be deployed to any public hosting service.

Core scope:
1. Office LAN-only local web app.
2. Google Places API based business search.
3. Store collected business information in local SQLite DB.
4. Deduplicate leads by Google Place ID.
5. Provide lead list, filters, detail view, CSV export, and Excel export.
6. Add access logs and API error logs.
7. Protect Google API Key on the server only.
8. Block access from outside the approved office CIDR range.

Out of scope:
- Email sending
- SMS sending
- CRM automation
- Follow-up automation
- SaaS multi-tenant features
- Payment/subscription
- Google Maps page scraping
- Public cloud deployment
- Any external tunnel such as ngrok or Cloudflare Tunnel

Mandatory security requirements:
1. Add OFFICE_ALLOWED_CIDRS in .env.local.
2. Implement backend middleware that blocks all requests outside OFFICE_ALLOWED_CIDRS.
3. Default to localhost-only access if OFFICE_ALLOWED_CIDRS is empty or invalid.
4. Do not trust X-Forwarded-For unless TRUST_PROXY=true.
5. Add Windows Firewall and Linux UFW setup instructions to README.
6. Add admin login or password protection.
7. Ensure Google API Key never appears in client-side code or browser responses.
8. Add acceptance tests proving same-office LAN access works and outside-network access fails.

Development process:
1. First audit the existing project for duplicate files, stale configs, port conflicts, env conflicts, DB conflicts, and prior public deployment/tunnel settings.
2. Create a backup before modifying working code.
3. Implement the LAN-only foundation first.
4. Then implement Google Places lead collection.
5. Then implement lead list and export.
6. Run build, lint, and manual network access tests.
7. Document rollback steps.

Deliverables:
- Working source code
- .env.example
- README beginner setup guide
- Database schema/migration
- Access control middleware
- Google Places API integration
- CSV/XLSX export
- Test checklist
- Rollback guide
```

---

## 18. Final Deliverables Checklist

At completion, the following files or components must exist.

| Deliverable | Required |
|---|---:|
| Source code | Yes |
| `.env.example` | Yes |
| `README.md` | Yes |
| `SECURITY.md` | Recommended |
| `ROLLBACK.md` | Yes |
| Prisma schema or SQL schema | Yes |
| Access control middleware | Yes |
| Google Places API service module | Yes |
| CSV/XLSX export module | Yes |
| Manual test checklist | Yes |
| Office firewall setup guide | Yes |

---

## 19. Final Decision

This MVP is **not the full sales automation tool**. It is an **internal customer information collection tool** that will serve as the foundation for future sales automation features. Therefore, the three most important development standards are:

1. It must run safely only inside the office network.
2. It must collect data legally and reliably through the Google Places API.
3. It must store collected customer information without duplicates and make it usable through CSV/Excel export.
