# Final QA Report — NELVI Finance Control V4.3.1 (Premium UI refinement)

**Review/build date:** 26 October 2026  
**Scope:** Current source files in this package: static HTML/CSS/JavaScript, Apps Script backend, shared finance helpers, docs and local tests.  
**Deployment status:** Not deployed or published by this run.

## Changes included

1. Preserved the existing Google Apps Script + Google Sheets + Drive architecture and data contract; no Supabase migration, database reset or fabricated finance data was added.
2. Centralized currency helpers in `finance-utils.js`, using integer paise for financial totals; formatted INR to two decimal places consistently.
3. Kept category donut totals aligned to all verified outflows and grouped non-top-five categories into `Other`.
4. Sorted recent activity newest-first and removed the CSS minimum bar height that made zero values visible.
5. Added a complete transaction edit dialog. The frontend and backend allow only editable business fields; owner/admin authorization is checked on the server, and each financial edit resets the record to Pending and clears approval metadata.
6. Restricted deletion to Pending transactions, including in the backend API. The proof file remains in Drive and the delete is audit-logged.
7. Wrapped update/delete/review/member-create read-modify-write actions in a Google Apps Script script lock to lower race risk.
8. Added server-side proof signature checks for JPEG, PNG, WebP and PDF, in addition to allowed MIME and 5 MB limits.
9. All newly created transaction rows now start Pending; Finance Admin review is the only verification/rejection path.
10. Bootstrap checks the configured spreadsheet ID and exposes only the profile-selector fields (member ID, name, role). Because the selector runs before login, those fields remain publicly accessible to someone who knows the endpoint and configured ID.
11. Added safer public error messages, request timeout, manual Sync now and a 60-second automatic refresh while signed in. The architecture is polling-based, not true realtime push.
12. Added stronger labels/constraints for required references, accessible dialog semantics, Escape-close and focus handling, additional small viewport styling and a visible warning about limitations of the shared-key/PIN authentication model. Closing the team-member dialog now clears the hidden form fields, including the temporary PIN.
13. Refined the sidebar with a deeper emerald gradient, readable inactive navigation, clearly highlighted active page, high-contrast icon tiles, restrained gold accent, hover/focus states and a more deliberate brand/user separation.
14. Fixed the donut center layout: the value and caption are separate elements; the center is confined to the inner hole; amount typography scales down appropriately so the INR amount no longer overlaps the ring or legend.
13. Added repeatable helper/backend validation tests and static HTML/CSS checks. Failed transaction-row appends now attempt to trash the proof upload to avoid orphan files; successful financial mutations report an audit-log write failure separately instead of misleadingly suggesting the transaction itself failed. Text fields reject common formula-trigger prefixes at the Apps Script boundary.

## Checks executed in this environment

Command: `./tests/run-tests.sh`

- Frontend JavaScript syntax — passed.
- Shared finance utilities syntax — passed.
- Apps Script syntax (Node parser) — passed.
- Finance utility tests — 9 passed.
- Backend validation tests — 11 passed.
- HTML parse, 99 unique IDs, script order, responsive breakpoints and static financial/security invariants — passed.
- CSS syntax parsed separately with the environment-installed tinycss2 parser — zero parse errors (407 top-level nodes; 1535 valid declarations). This does not prove visual correctness at each viewport.
- Chromium/Playwright responsive visual smoke check using a representative dashboard markup harness at 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844 and 375×812 — passed. The test harness reported no page-width overflow, no donut center-value overflow, and no browser page errors at all seven sizes. This validates the edited CSS and chart-center composition; it is not an end-to-end test of authenticated production data or every page workflow.

Total functional helper/backend tests: **20 passed**. No external libraries are needed to run these checks.

## Not verified here

- Live Apps Script Web App authentication or active deployment configuration.
- Actual Google Sheet permissions, schema/row values, Google Drive proof uploads and audit trail on a real account.
- Browser-native visual testing at the listed viewport sizes, browser console/network behavior, or a full UI end-to-end run against the real hosting domain.
- Spreadsheet import behavior for the `.xls` HTML export across all Excel/LibreOffice/Sheets versions.
- Penetration testing, robust PIN rate limiting, hashed PIN storage, Google Workspace identity, or any claim of bank-grade security.

These are not silently marked passed. The responsive browser smoke test uses representative markup rather than an authenticated run of the complete application. Complete the mandatory manual items in `TEST_CHECKLIST.md` with a backed-up test spreadsheet before production rollout.

## Important security limitations

The current design still uses a shared access key and relatively short member PIN; PINs remain in the Members sheet. The first profile-selection bootstrap exposes active member ID/name/role before sign-in. This is a material limitation of the current architecture, not a security property that styling or client-side checks can fix. Restrict deployment, sheet and Drive access; use unique PINs and a strong key; maintain backups. For higher assurance, plan a separate identity/backend migration with strong authentication and server-side rate limiting.

## Summary

The source package now contains the implementation and reproducible local checks described above. This is a **refined test candidate**, not a guarantee of perfection or a production certification. The deployed Google account, Apps Script deployment, Drive permissions and target browser environment must still be tested before using it for live company finance operations.
