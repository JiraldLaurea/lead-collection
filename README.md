# Serper Lead Collection MVP - Office LAN Only

Internal local web app for collecting business leads through Serper. This is not a public SaaS and must run only on the approved office LAN.

## Installation

```bash
git clone <repository-url>
cd <project-folder>
npm install
copy .env.example .env.local
```

On macOS/Linux:

```bash
cp .env.example .env.local
```

## Edit Environment Variables

Set these values in `.env.local`:

```env
OFFICE_ALLOWED_CIDRS=127.0.0.1/32,::1/128,192.168.0.0/24
SERPER_API_KEY=your_serper_api_key
DATABASE_URL=file:../data/leads.sqlite
SESSION_SECRET=replace_with_long_random_secret
COOKIE_SECURE=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=replace_with_bcrypt_hash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_sender_email
SMTP_PASS=your_smtp_or_app_password
SMTP_FROM=your_sender_email
SMTP_FROM_NAME=Your Company Name
```

If `ADMIN_PASSWORD_HASH` is not set, the development fallback password is `admin`. Replace it before office use.

Generate a bcrypt hash with:

```bash
npx tsx -e "import bcrypt from 'bcryptjs'; bcrypt.hash('your-password', 12).then(console.log)"
```

## Initialize Database

```bash
npm run db:push
```

The local SQLite database is created in `data/leads.sqlite`. It is ignored by git.

## Email Sending

The app can send emails to selected leads through SMTP. For Gmail, use a Google App Password, not the normal account password.

Email body defaults can be edited from the Settings page. The template supports this placeholder:

```text
[business_name]
```

The subject defaults to:

```text
Business Opportunity - [business_name]
```

## Build and Run

```bash
npm run build
npm run start:office
```

Host PC:

```text
http://localhost:3000
```

Office LAN PC:

```text
http://<host-pc-private-ip>:3000
```

## Important Restrictions

- Do not deploy this app to Vercel, Netlify, Render, Railway, or any public host.
- Do not use ngrok, Cloudflare Tunnel, Tailscale Funnel, localhost.run, or any public tunnel.
- Do not configure router port forwarding.
- Do not expose the Serper API key in frontend code.
- Do not scrape the Google Maps website UI. Lead collection should go through Serper from server route handlers.

## Windows Firewall Setup

If the office network is `192.168.0.0/24`, run PowerShell as Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "Lead Collection MVP Office LAN Only" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 3000 `
  -RemoteAddress 192.168.0.0/24
```

Add a block rule:

```powershell
New-NetFirewallRule `
  -DisplayName "Block Lead Collection MVP External Access" `
  -Direction Inbound `
  -Action Block `
  -Protocol TCP `
  -LocalPort 3000 `
  -RemoteAddress Any
```

Verify in Windows Defender Firewall with Advanced Security:

- Confirm both rules are enabled.
- Confirm the allow rule uses the office CIDR only.
- Confirm no broader inbound rule allows port 3000 from `Any`.
- Test from an office PC and from a non-office network.

## macOS/Linux Firewall Example

```bash
sudo ufw allow from 192.168.0.0/24 to any port 3000 proto tcp
sudo ufw deny 3000/tcp
sudo ufw status verbose
```

## Serper API Safety

The app calls Serper only from server route handlers. The raw key is read from `.env.local` and is not rendered into pages or API responses.

References:

- https://serper.dev/

## Manual Test Checklist

1. `npm run build` succeeds.
2. `npm run start:office` starts on port 3000.
3. Host PC opens `http://localhost:3000`.
4. Another office LAN PC opens `http://<host-pc-private-ip>:3000`.
5. A non-office IP receives 403 or cannot connect due to firewall.
6. Blocked requests appear in Access Logs.
7. Browser Sources and Network tabs do not reveal `SERPER_API_KEY`.
8. Text Search saves leads.
9. Running the same search twice skips duplicate leads.
10. CSV and Excel downloads work.
11. Existing lead data remains after app restart.
12. Email template changes in Settings are used as the default compose body.

## Commands

```bash
npm run dev
npm run build
npm run start:office
npm run typecheck
npm run lint
npm run test
npm run db:push
```
