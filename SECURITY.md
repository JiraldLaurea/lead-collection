# Security Notes

This project is designed for office LAN use only.

## Mandatory Controls

- Keep `BLOCK_PUBLIC_ACCESS=true`.
- Keep `TRUST_PROXY=false` unless a trusted internal reverse proxy is intentionally configured.
- Set `OFFICE_ALLOWED_CIDRS` to the exact office LAN range.
- Configure OS firewall rules so port 3000 accepts traffic only from the approved office CIDR.
- Never use public tunnels or router port forwarding.
- Store the Google API key only in `.env.local`.
- Store SMTP credentials only in `.env.local`.
- Restrict the Google API key in Google Cloud Console where possible.

## Secret Handling

The settings page only shows API key configuration status or the last four characters. It must never display raw secrets.

Never commit `.env.local`, SQLite database files, logs, generated exports, or email app passwords.

## Admin Password

Before real office use, replace the development fallback password by setting `ADMIN_PASSWORD_HASH` to a bcrypt hash and `SESSION_SECRET` to a long random value.
