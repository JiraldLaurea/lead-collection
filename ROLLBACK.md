# Rollback Guide

## Before Changes

Back up the SQLite file:

```powershell
Copy-Item .\data\leads.sqlite .\data\leads.sqlite.backup
```

Back up `.env.local` separately because it contains secrets.

## Application Rollback

1. Stop the running server.
2. Restore the previous source revision or backup folder.
3. Run:

```bash
npm install
npm run build
npm run start:office
```

4. Verify `/health`, login, lead list, and export.

## Database Rollback

If a migration or schema push causes problems:

1. Stop the app.
2. Restore the backup database file:

```powershell
Copy-Item .\data\leads.sqlite.backup .\data\leads.sqlite
```

3. Start the app and verify lead data.

## Forward Fix

If a database change cannot be rolled back without data loss, keep the backup, document the issue, and deploy a forward fix after testing locally.
