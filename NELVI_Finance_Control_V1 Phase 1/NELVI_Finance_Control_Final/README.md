# NELVI Finance Control — V4.3.1 Final Refinement

A browser-based business finance tracker for VEDHA EXIM × NELVI. The existing architecture is retained: static HTML/CSS/JavaScript frontend, Google Apps Script API, Google Sheets data store and Google Drive proof storage. This package does **not** migrate records to a new backend or invent finance data.

## V4.3.1 refinements

- Centralized INR formatting and calculations in `finance-utils.js`; dashboard, category totals, reports and member summaries sum integer paise to avoid common floating-point accumulation errors.
- Top spending chart keeps a consistent denominator across **all verified outflows** and rolls categories beyond the top five into an explicit `Other` slice. Category percentages are based on the full verified-spending total; empty totals are handled without division errors.
- Recent activity sorts newest-first with fallback to transaction date. Zero-value monthly bars no longer render as visible slivers.
- Added transaction editing for owners (pending records) and Finance Admin (including reviewed records). Any edit resets status to Pending and clears review metadata on the server, so changed financial details must be reviewed again. Ownership, proof-file metadata and approval fields are not editable in the generic patch.
- Deletion is now restricted to Pending records. Verified/Rejected records remain in the register for traceability; if an admin corrects them by editing, they return to Pending. Proof files remain in Drive after a transaction row is deleted.
- Backend update, delete, review and member-create operations use a script lock to reduce concurrent read/modify/write races. Server-side allowlists and validation remain authoritative.
- Payment proofs must be 5 MB or smaller, use an allowed MIME type, decode as Base64 and match the expected JPEG/PNG/WebP/PDF file signature.
- New transactions, including those entered by Finance Admin, begin as Pending. Only the dedicated admin review action can verify or reject them.
- The unauthenticated bootstrap checks the configured Spreadsheet ID and returns only the active profile-selection fields needed before login. The endpoint still exposes those basic member fields to anyone who knows the deployed URL and configured spreadsheet ID; it is not an identity provider.
- Safer generic server errors avoid returning internal exception details to unauthenticated callers. Detailed errors remain available in Apps Script execution logs.
- Added a real edit dialog, visible save states, keyboard Escape handling and focus trapping for dialogs, improved phone spacing, and a connection status with manual Sync now plus 60-second background refresh while signed in. Syncing is polling-based, not real-time push.
- Transaction amount input validates positive INR amounts with up to two decimals. Export text is neutralized against common spreadsheet formula prefixes. Common finance calculations use the shared helper module and have reproducible regression tests.
- Added standalone tests for finance math, full-total chart breakdown, export text safety, newest-first sorting, backend validation, proof signatures, inactive-member normalization and lock behavior.

## Files

- `index.html` — page structure, forms and page templates
- `styles.css` — design system and responsive layout
- `app.js` — navigation, data workflows, filters, calculations and API client
- `finance-utils.js` — shared, testable finance and report helpers
- `config.js` — optional static connection configuration; normally leave blank and use first-launch setup
- `assets/nelvi-vedha-logo.png` — supplied VEDHA EXIM × NELVI logo
- `google-apps-script/Code.gs` — Apps Script API backend
- `google-apps-script/SETUP.md` — server setup notes
- `DEPLOYMENT_UPDATE_GUIDE.md` — safe update instructions
- `TEST_CHECKLIST.md` — manual live release gate
- `FINAL_QA_REPORT.md` — checks run and limitations
- `tests/` — no-dependency Node/Python checks

## Setup overview

1. Back up the existing Google Sheet and Apps Script project before updating anything.
2. Open the Apps Script project connected to your actual finance spreadsheet. Set `SPREADSHEET_ID` and a strong unique `ACCESS_KEY` in `google-apps-script/Code.gs`.
3. Paste the updated `Code.gs`, run `setupSheets()` once to authorize and ensure the expected sheets exist, and deploy a **new version** of the Web App.
4. Ensure `Members` includes at least one active member. The exact admin role string is `Finance Admin`.
5. Deploy all website files together, including `finance-utils.js`, `app.js`, `styles.css`, `config.js`, and `assets/`.
6. Open the site and enter the deployed `/exec` URL plus the matching Spreadsheet ID.
7. Test using a non-production test transaction and test proof before normal use.

## Data and calculation policy

- Verified inflows = confirmed company funds.
- Verified outflows = confirmed company spending.
- Net = verified inflows minus verified outflows.
- Pending transactions are counted separately and excluded from verified totals.
- Rejected transactions are excluded from financial totals and spending categories.
- A newly created entry is Pending, including entries entered by an Admin. Finance Admin uses Verify/Reject after reviewing it.
- Editing a transaction resets it to Pending and clears prior review metadata.
- The donut denominator includes all verified outflows. Categories beyond the leading five are grouped into `Other`.
- Displayed currency is INR with two decimal places.
- The spreadsheet row is the data source of record. Manual Sync fetches immediately; automatic refresh checks every 60 seconds while signed in. This is not realtime push synchronization.
- Proof uploads are stored in `NELVI Finance Control Proofs`. Deleting a pending transaction does not delete the proof file.

## Security and limitations

This app is a lightweight workflow tracker, not a certified accounting or banking system. The current shared access key + member PIN design has material limitations: PINs remain stored in the Members sheet, a short PIN is not strong authentication, a signed-in user can inspect their own browser request payload, and the unauthenticated bootstrap exposes active member ID/name/role for profile selection. Use a strong access key, unique non-shared PINs, restricted Apps Script/deployment and Sheet/Drive sharing, trusted users only, backups, and periodic access review. For stronger assurance, migrate in a separately planned change to Google Workspace/OAuth or another proper identity system with server-side rate limits and audited role controls. Do not describe the current mechanism as bank-grade or enterprise-grade authentication.

## Run local tests

From this folder, run:

```bash
./tests/run-tests.sh
```

Requires Node.js and Python 3 only; no npm packages are installed. The checks do not connect to a Google account and do not replace the live integration checklist.


## V4.3.1 — Premium UI refinement

- Fixed the dashboard spending donut center amount so it stays inside the inner circle without touching the ring.
- Added responsive chart-center typography and separated the value from its caption.
- Refined the sidebar into a higher-contrast deep emerald navigation with clearer active-page state, icon tiles, subtle gold accents, hover feedback and visible keyboard focus.
- Ran the local test suite and a Chromium layout smoke check at 7 desktop/tablet/mobile viewport sizes. See `FINAL_QA_REPORT.md` for exact scope and remaining live-integration checks.
