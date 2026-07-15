# SME Search Release Verification

Date: 2026-07-15

## Automated checks

- `npm test` — 13 test files, 160 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run db:verify:sme` — passed. The disposable SQLite database created and then rolled back all 11 SME tables while retaining `leads`, `email_logs`, and `sms_logs`.
- `NEXT_DIST_DIR=.next-build-check npx next build` — passed. This isolated the release build from the running development server and verified `/api/auth/login` and `/api/export/xlsx` are included.

## Browser acceptance flow

Run with the development server active:

```powershell
npm run verify:sme:browser
```

The browser check enables SMS/email dry-run mode, creates the existing debug SME sample, performs a one-result Google Places free-text search, and verifies:

1. SME Search renders with its full filter set.
2. Google Places search returns a captured result.
3. The selected SME opens the SMS composer.
4. One SMS is sent in dry-run mode only.
5. The sent entry is displayed in SMS history.

The verified run completed successfully on 2026-07-15. Screenshots are generated locally and intentionally excluded from Git:

- `test-results/sme-browser-verification/desktop-search.png`
- `test-results/sme-browser-verification/mobile-search.png`
- `test-results/sme-browser-verification/sms-history.png`

## Safety checks added in this release

- Map-radius searches without a category are rejected before a Places request is made.
- SME SMS routes reject `MANUAL_REVIEW`, large-chain, and franchise-excluded records on the server.
- SMS and email sends apply Do Not Contact suppression on the server, including manual and CSV email sends.
- The Settings page supports separate SMS and email opt-out entries.

## Release notes

- Browser verification uses the debug sample and dry-run mode; it never sends a real SMS or email.
- The mobile capture confirms search controls and action buttons remain available. The results table remains horizontally scrollable on narrow screens so its columns retain usable labels.
