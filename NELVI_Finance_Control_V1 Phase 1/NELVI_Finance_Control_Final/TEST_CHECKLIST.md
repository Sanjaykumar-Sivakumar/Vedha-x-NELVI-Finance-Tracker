# V4.3 Regression & Release Checklist

## Automated checks (run via `./tests/run-tests.sh`)

- [x] `node --check app.js`
- [x] `node --check finance-utils.js`
- [x] Apps Script `Code.gs` syntax checked with Node parser
- [x] Integer-paise conversion and decimal formatting tests
- [x] Verified-only net, category total and `Other` breakdown tests
- [x] Zero/invalid denominator percentage test
- [x] Month key and newest-first sort tests
- [x] Spreadsheet formula-prefix neutralization tests
- [x] Apps Script transaction amount/date/type/text validation tests
- [x] Apps Script allowed proof signature and MIME mismatch tests
- [x] Case-insensitive inactive-member test
- [x] Script lock success/busy behavior tests
- [x] HTML parser, duplicate-ID check, script-load order, responsive breakpoints and security invariants

## Manual live checks — mandatory before production use

### Connection/authentication

- [ ] Connect using intended deployed Apps Script `/exec` URL and matching Spreadsheet ID.
- [ ] Confirm active members load; inactive rows (any casing) do not appear in selector.
- [ ] Valid login succeeds; invalid key/PIN and inactive-member login fail without exposing stack traces.
- [ ] Confirm sign-out clears login inputs and returns to login view.
- [ ] Review Web App access level, spreadsheet sharing and Drive proof-folder sharing.

### Transactions & permissions

- [ ] New entries start Pending for member and Finance Admin roles.
- [ ] Positive amounts, max two decimals, valid calendar date, type/category/method/purpose/reference required fields are enforced.
- [ ] Oversized files, disallowed MIME, fake/mismatched file signatures and invalid Base64 are rejected by server.
- [ ] Valid JPG, PNG, WebP and PDF proofs upload and are saved with transaction metadata.
- [ ] Owner can edit only their own Pending transaction; another member cannot edit/delete it; owner API attempts against a reviewed transaction are rejected.
- [ ] Edited values are validated server-side; ownership, transaction ID, proof file IDs/names, status, verification metadata and audit fields cannot be patched.
- [ ] Any financial edit resets status to Pending and clears prior verification metadata.
- [ ] Only Finance Admin can verify/reject, and only Pending records can be reviewed.
- [ ] Only Pending transactions can be deleted; reviewed financial history cannot be silently deleted through the API.
- [ ] Concurrent double review/edit/delete attempts return a safe result and do not corrupt a row.
- [ ] AuditLog actor attribution is correct for create/edit/delete/review/member-create actions; audit-write failures are surfaced as warnings rather than duplicate-save errors.
- [ ] Closing the create-member dialog clears the temporary PIN from its hidden form field.

### Dashboard, reports & export

- [ ] Verified inflows = source rows; verified outflows = source rows; net = inflow − outflow.
- [ ] Pending amount/count is shown separately; Rejected records do not affect financial totals.
- [ ] Six-month chart buckets local `YYYY-MM` dates correctly at month/year boundaries; a month with no value shows no visible bar.
- [ ] Donut totals all verified outflows, including `Other`; category percentages reconcile to full total (rounding may make display sum 99.9–100.1%).
- [ ] Recent activity sorts newest-first.
- [ ] Search, type, status, date, category and member filters combine correctly; Reset clears all transaction filters.
- [ ] Report from/to dates preserve boundaries and reset works.
- [ ] Export honors all transaction filters; strings beginning with `=`, `+`, `-`, `@`, tab or carriage return are inert in the resulting spreadsheet.
- [ ] Amounts with paise format consistently to 2 decimals; summaries agree to the paise.

### Sync & responsiveness

- [ ] Manual Sync now fetches the latest server data and reports an understandable error on network failure.
- [ ] Background refresh occurs about every 60 seconds when signed in; a stale read does not overwrite a write begun during the read.
- [ ] Submit/update controls prevent duplicate submissions; long requests show a saving state and timeout errors.
- [ ] Verify layout/interaction at 375, 390, 430, 768, 1024, 1280 and 1440 px.
- [ ] Tables scroll deliberately on narrow screens; charts/legend do not overlap; no horizontal page overflow.
- [ ] Keyboard navigation and visible focus work; edit/profile dialogs close on Escape and keep focus within the open dialog.
- [ ] Browser console has no runtime errors; retry and empty states work when there is no data or API is unavailable.

## Calculation policy

- Verified inflows are confirmed company funds.
- Verified outflows are confirmed company spending.
- Net = verified inflows − verified outflows.
- Pending is counted separately and excluded from confirmed totals.
- Rejected is excluded from totals and category breakdowns.

## Test boundary

Automated checks cover local helpers and static invariants. They do **not** establish successful authentication to a real Google account, live Sheets data integrity, Drive upload permissions, hosted cross-origin behavior, device/browser visual layout, or the user's production permissions. These remain release gates and must be checked manually against a backed-up test spreadsheet and intended deployment.


## Premium UI regression (V4.3.1)

- [x] Spending donut amount remains within the inner circle at 1440, 1280, 1024, 768, 430, 390 and 375 CSS-pixel viewport widths in a Chromium smoke harness.
- [x] No horizontal page overflow in the representative dashboard harness at the same viewport sizes.
- [x] Left navigation active/inactive contrast, icon tile and keyboard focus styles are present in CSS.
- [x] Donut label and amount use separate elements with responsive sizing.
- [ ] Verify the real app with a configured Google Apps Script deployment and real (non-production/test) Sheets data.
