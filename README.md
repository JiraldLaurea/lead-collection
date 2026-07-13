# Lead Collection

An internal lead-management and outreach application for collecting business leads, importing external lists, and contacting recipients by email or SMS.

It combines lead discovery through the Serper Places API, local SQLite storage, CSV imports, SMTP email, SMPP SMS delivery tracking, exports, and operational logs in one authenticated Next.js application.

For the fuller product and architecture guide, see [docs/PROJECT-OVERVIEW.md](docs/PROJECT-OVERVIEW.md).

## Features

- Search for businesses by keyword and location through Serper Places.
- Store and manage business details, including category, address, phone, website, rating, and source URL.
- Avoid duplicate search results using provider identifiers or stable generated identifiers.
- Import external CSV lead lists without mixing them with application-collected leads.
- Filter, select, export, and delete leads.
- Send personalized email to selected collected or imported leads through SMTP.
- Send personalized SMS to selected leads, imported CSV leads, or manually entered recipients.
- Use `[business_name]` placeholders in email and SMS content.
- Track email sends and SMS submissions in dedicated logs.
- Receive SMPP delivery receipts and record delivery state, error, raw receipt, and completion time.
- Configure auto-email scheduling and daily limits through Settings.
- Protect the application with admin login and configurable network access controls.

## Technology

- Next.js 15, React 19, and TypeScript
- Prisma ORM with SQLite
- Serper Places API for server-side lead search
- Nodemailer for SMTP email
- SMPP, Movider, Twilio, Infobip, ClickSend, or mock SMS providers
- Zod input validation, bcrypt-based login verification, Vitest, and ESLint

## Setup

### 1. Install dependencies

```bash
git clone <repository-url>
cd <project-folder>
npm install
copy .env.example .env.local
```

On macOS/Linux, use `cp .env.example .env.local` instead.

### 2. Configure environment variables

Set real values in `.env.local`. Do not commit this file.

Required baseline values include:

```env
SERPER_API_KEY=your_serper_api_key
DATABASE_URL=file:../data/leads.sqlite
SESSION_SECRET=replace_with_a_long_random_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=replace_with_a_bcrypt_hash
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password_or_app_password
SMTP_FROM=your_sender_email
```

Generate an admin password hash with:

```bash
npx tsx -e "import bcrypt from 'bcryptjs'; bcrypt.hash('your-password', 12).then(console.log)"
```

### 3. Initialize the database

```bash
npm run db:push
```

This creates or updates the local SQLite database at `data/leads.sqlite`.

### 4. Start the app

For local development:

```bash
npm run dev
```

For the internal network access-control wrapper:

```bash
npm run build
npm run start:office
```

## SMS and SMPP

Set `SMS_PROVIDER=smpp` to use SMPP. The required configuration is documented in [.env.example](.env.example); it includes the host, port, system ID, password, bind type, sender IDs, address TON/NPI values, requested delivery receipts, and TPS setting.

Use only sender IDs approved by the SMS provider. The application supports separate Smart and Globe sender IDs and chooses the appropriate one for recognized Philippine prefixes.

An SMS log entry with status `sent` means the SMPP provider accepted the initial `submit_sm` request. It is not a delivery confirmation. A later receipt such as `DELIVRD`/`DELIVERED` confirms delivery, while values such as `UNDELIV`, `REJECTD`, and `EXPIRED` are recorded as failures.

For provider API alternatives, set `SMS_PROVIDER` to `movider`, `twilio`, `infobip`, `clicksend`, or `mock` and configure the relevant credentials.

## Temporary test access with ngrok

The normal production model is internal/office access. For a short, explicitly approved external testing session, run:

```bash
npm run dev:tunnel
npm run tunnel:host-header
```

The second command displays an ngrok HTTPS URL for testers. Keep `REQUIRE_ADMIN_LOGIN=true`, stop the tunnel after testing, and never share `.env.local`, provider credentials, or session secrets. Free ngrok URLs may change each time the tunnel is restarted and may display an ngrok warning page before the app.

## Commands

```bash
npm run dev                         # Local development server
npm run build                       # Production build
npm run start:office                # Internal access-control server
npm run dev:tunnel                  # Development server on port 3005
npm run tunnel                      # ngrok tunnel to port 3005
npm run tunnel:host-header          # ngrok tunnel with localhost host header
npm run typecheck                   # TypeScript validation
npm run lint                        # ESLint validation
npm test                            # Vitest suite
npm run db:push                     # Initialize/update SQLite schema
npm run db:seed                     # Seed supported database data
node scripts/export-project-overview-to-docx.mjs  # Rebuild project DOCX guide
```

## Security and operations

- Keep all secrets in `.env.local` or an approved secret store.
- Never expose Serper, SMTP, SMS, SMPP, or session credentials in browser code, screenshots, or public repositories.
- Use `COOKIE_SECURE=true` when serving the application over HTTPS.
- Restrict internal deployments with `OFFICE_ALLOWED_CIDRS` and `BLOCK_PUBLIC_ACCESS`.
- Review the Email Log and SMS Log after outreach campaigns.
- For large SMS campaigns, validate the provider’s permitted rate and delivery requirements before sending.
- Send only to recipients with a valid business basis and any required consent.

## Documentation

- [Project overview](docs/PROJECT-OVERVIEW.md)
- [Project overview (DOCX)](docs/PROJECT-OVERVIEW.docx)
- [Deployment runbook](docs/deployment/runbook.md)
- [Smoke-test checklist](docs/deployment/smoke-test-checklist.md)
- [Security guidance](SECURITY.md)
- [Rollback guidance](ROLLBACK.md)
