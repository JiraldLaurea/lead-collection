# Lead Collection - Project Overview

## Purpose

Lead Collection is an internal web application for finding, managing, and contacting business leads. It brings lead discovery, imported lead lists, email outreach, SMS outreach, delivery tracking, and operational logs into one workspace.

The application is designed for an authenticated internal team. It stores its data locally in SQLite and keeps provider credentials on the server in environment variables.

## Main capabilities

### Lead collection and management

- Search for businesses by keyword and location through the Serper Places API.
- Store business details such as name, category, address, phone number, website, rating, and source URL.
- Avoid duplicate leads by using the provider place identifier or a stable generated identifier.
- Filter, review, select, and delete leads.
- View dashboard counts and a list of recently collected leads.
- Export lead data and phone numbers in CSV/XLSX formats.

### CSV lead workspace

- Import external CSV lead lists without mixing them with application-collected leads.
- Retain import metadata and the original lead-list fields.
- Select imported leads for email or SMS outreach.

### Email outreach

- Send email to selected collected leads or imported CSV leads through SMTP.
- Use configurable email-body defaults and the `[business_name]` placeholder.
- Support a configurable attachment for the email template.
- Keep an email log containing recipient, message details, status, and provider error information.
- Support optional scheduled/limited automated email sending through Operations settings.

### SMS outreach

- Send a personalized SMS to selected leads, imported CSV leads, or manually entered recipients.
- Use `[business_name]` in the SMS body to personalize each outgoing message.
- Normalize valid Philippine mobile numbers before submission.
- Record every send attempt in the SMS Log, including the rendered message body, recipient, provider message ID, status, and any error.
- Provide a manual **Send SMS** page that accepts one recipient per line in either format:

  ```text
  09614073159
  Business Name, 09614073159
  ```

### SMPP integration and delivery confirmation

When `SMS_PROVIDER=smpp`, the application uses an SMPP transceiver or transmitter connection to submit SMS messages.

- It binds with the configured SMPP host, port, system ID, and password.
- It requests delivery receipts when `SMPP_REGISTERED_DELIVERY=1`.
- It saves the provider message ID returned by `submit_sm`.
- It receives `deliver_sm` delivery receipts, acknowledges them to the SMPP provider, and matches them to the logged SMS message ID.
- It updates the SMS log with delivery state, error code, raw delivery receipt, and delivery time when available.
- It can select a different sender ID for likely Smart and Globe Philippine numbers.

`sent` means the provider accepted the initial `submit_sm` request. It does **not** by itself mean the handset received the message. A later delivery receipt such as `DELIVRD`/`DELIVERED` confirms delivery; states such as `UNDELIV`, `REJECTD`, or `EXPIRED` mark the message as failed.

## Application areas

| Area | What it is for |
| --- | --- |
| Dashboard | Overview metrics and recently collected leads. |
| Leads | Search, review, filter, select, export, email, and SMS application-collected leads. |
| CSV Leads | Import and work with external lead lists separately from collected leads. |
| Compose Email | Send email to selected recipients using the configured template. |
| Send SMS | Send SMS to manually entered recipients. |
| Email Log | Review individual email attempts and their results. |
| SMS Log | Review SMS submission, delivery receipts, errors, raw receipts, and message content. |
| Settings | Manage operating settings, email defaults, debug controls, and saved lead data. |
| Logs | Review access-control events. |

## Technical architecture

| Layer | Technology / responsibility |
| --- | --- |
| Web application | Next.js 15 App Router with React 19 and TypeScript. |
| UI | Custom components and CSS, with Material UI packages available for interface work. |
| Server routes | Next.js route handlers validate requests, enforce authentication, call integrations, and write logs. |
| Database | SQLite through Prisma ORM. The default database is `data/leads.sqlite`. |
| Lead discovery | Serper Places API, called only from server-side code. |
| Email | Nodemailer over a configured SMTP server. |
| SMS | Provider-agnostic service supporting SMPP, Movider, Twilio, Infobip, ClickSend, and a local mock provider. |
| Authentication | Admin session login using bcrypt password verification and signed cookies. |
| Validation | Zod validates API input. |
| Testing and checks | Vitest, ESLint, TypeScript type checking, and Prisma generation. |

## Data model

The primary database records are:

- `Lead`: businesses found through the lead-collection workflow.
- `SearchJob`: each lead-search request and its result counts.
- `ImportedCsvLead` and `CsvImport`: external CSV lead lists and their import history.
- `EmailLog`: email send attempts and outcomes.
- `SmsLog`: SMS send attempts, provider message IDs, delivery receipts, and errors.
- `AppSetting`: saved operational, template, and debug settings.
- `AccessLog`: access-control decisions.
- `ApiErrorLog`: provider/API errors, including lead-search failures.

## Configuration

Copy `.env.example` to `.env.local` and set real values there. `.env.local` must never be committed or shared.

The important configuration groups are:

| Group | Examples |
| --- | --- |
| Application/access | `APP_PORT`, `BIND_HOST`, `OFFICE_ALLOWED_CIDRS`, `BLOCK_PUBLIC_ACCESS`, `TRUST_PROXY` |
| Admin login | `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `COOKIE_SECURE` |
| Lead search | `SERPER_API_KEY`, `SERPER_PLACES_MAX_PAGES` |
| Storage/export | `DATABASE_URL`, `EXPORT_DIR`, `LOG_DIR` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME` |
| SMS provider | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER_ID` |
| SMPP | `SMPP_HOST`, `SMPP_PORT`, `SMPP_SYSTEM_ID`, `SMPP_PASSWORD`, bind, sender, addressing, receipt, and TPS settings |

For SMPP, configure the provider-approved sender IDs in `SMPP_SOURCE_ADDR`, `SMPP_SOURCE_ADDR_SMART`, and `SMPP_SOURCE_ADDR_GLOBE`. The outbound server public IP must be whitelisted by the SMPP provider when required.

## Local setup and commands

```bash
npm install
copy .env.example .env.local
npm run db:push
npm run dev
```

Useful commands:

```bash
npm run typecheck     # TypeScript validation
npm run lint          # ESLint validation
npm test              # Vitest test suite
npm run build         # Production build
npm run start:office  # Start with the office access-control wrapper
npm run db:push       # Create/update the local SQLite schema
npm run db:seed       # Seed supported database data
```

For a temporary development tunnel, the project also has `npm run dev:tunnel` and `npm run tunnel`. Only use a tunnel when it has been explicitly approved and protect the app with its normal login and access controls.

## SMS operations guide

1. Confirm `SMS_PROVIDER` and the related credentials are configured.
2. For SMPP, confirm the server public IP is whitelisted and the provider has enabled the account and sender IDs.
3. Send a small test to a valid mobile number.
4. Check **SMS Log**. A successful submission receives a provider message ID and initially appears as `sent`.
5. Wait for the provider's delivery receipt. The Delivery column and SMS detail view show the final state when a receipt arrives.
6. Investigate `failed` messages using the Delivery status, Delivery error, raw receipt, and provider message ID before retrying.

The configured `SMPP_TPS` value documents the provider throughput allowance. The current send routes process recipients sequentially; this is appropriate for controlled sends but should be reviewed before high-volume campaigns.

## Security and operational notes

- Keep API keys, SMTP passwords, SMPP credentials, and session secrets only in `.env.local` or another secure secret store.
- Do not expose the Serper API key or SMS credentials in browser code, screenshots, support chats, or public repositories.
- Enable `COOKIE_SECURE=true` when the application is served over HTTPS.
- Restrict access to approved networks when operating as an internal system, and log access decisions.
- Use provider-approved sender IDs and only message recipients for whom the organization has a valid outreach basis and consent where required.
- The SMS Log records provider acceptance and delivery-receipt data; carrier delivery decisions remain outside the application's control.

## Repository layout

```text
app/          Pages and server API routes
components/   Reusable UI components
lib/          Database, auth, provider integrations, and business logic
prisma/       Prisma schema and seed script
scripts/      Database initialization/migration helper
data/         Local SQLite database location (not committed)
docs/         Operational and project documentation
tests/        Automated tests
```

## Related documentation

- `README.md` — installation, LAN deployment, and baseline operational guidance.
- `docs/deployment/runbook.md` — deployment steps.
- `docs/deployment/smoke-test-checklist.md` — post-deployment checks.
- `SECURITY.md` — security expectations.
- `ROLLBACK.md` — rollback guidance.
