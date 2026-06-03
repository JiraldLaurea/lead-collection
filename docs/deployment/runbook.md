# Deployment Runbook

## Scope

This app is deployed only on an office host PC or mini server. Public hosting, tunnels, and router port forwarding are prohibited.

## Prerequisites

- Node.js LTS or newer.
- Approved office CIDR.
- Google Places API key stored in `.env.local`.
- Windows Defender Firewall or Linux UFW rule restricting port 3000.

## Release Steps

```bash
npm install
npm run db:push
npm run build
npm run start:office
```

## Health Check

Open:

```text
http://localhost:3000/health
```

Expected response includes:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

## Migration Plan

For MVP SQLite setup, use:

```bash
npm run db:push
```

Before schema changes, back up `data/leads.sqlite`.

## Rollback

Use `ROLLBACK.md`.

## Monitoring

Check the dashboard, access logs, API error logs, and `/health`.
