# Smoke Test Checklist

| Check | Expected Result | Status |
|---|---|---|
| GET `/health` | `success: true`, status `ok` | pending |
| Login | Admin reaches dashboard | pending |
| Office LAN access | Office PC reaches app by private IP | pending |
| External access | External network is blocked by firewall or app 403 | pending |
| Places search | Search job completes or logs sanitized provider error | pending |
| Deduplication | Same Place ID is stored once | pending |
| Lead list | Saved leads render with filters | pending |
| CSV export | Browser downloads CSV | pending |
| XLSX export | Browser downloads XLSX | pending |
| API key exposure | Raw key absent from browser source and network responses | pending |
