# V4.3 Deployment Update Guide

## Before you start — protect existing finance data

1. Make a copy/backup of the current Google Sheet and download/export a copy of the current Apps Script source.
2. Do not create a new blank spreadsheet unless you intentionally want a separate system. This package is designed to preserve the current Google Sheets + Apps Script architecture; it does not import or migrate your records.
3. Test with a copied spreadsheet and test member first where possible. Never use real financial records to verify file-upload or delete behavior.

## A. Update the website

1. Extract `NELVI_Finance_Control_V4_3_Final.zip`.
2. Replace website project files with the package files. Preserve your current hosting project and domain.
3. Ensure `index.html`, `styles.css`, `app.js`, **`finance-utils.js`**, `config.js`, and `assets/nelvi-vedha-logo.png` are all deployed at the expected relative paths.
4. Redeploy the static website and hard-refresh with **Ctrl + Shift + R**.

## B. Update Apps Script — required for the backend controls

1. Open the Apps Script project currently connected to the existing company spreadsheet.
2. Copy the existing `Code.gs` to a safe backup, then replace it with `google-apps-script/Code.gs` from this package.
3. Confirm `SPREADSHEET_ID` matches the actual spreadsheet. Set `ACCESS_KEY` to a strong value and use the same value in the login screen.
4. Save. Select `setupSheets()` and click **Run** once if needed; approve Google permissions. The script creates only missing sheets and headers and sets the Members PIN column to text format; it is not intended to erase existing transaction data.
5. Go to **Deploy → Manage deployments → Edit**, choose **New version**, and Deploy. Keep the same `/exec` URL if editing the existing deployment.
6. Recheck the deployment's execute-as/access settings. Publicly accessible Web App deployment can expose the bootstrap profile list and should be restricted as much as compatible with your access requirements.

## C. Confirm schema compatibility

Expected header rows:

`Members`: `memberId | name | role | pin | status | createdAt`

`Transactions`: `transactionId | date | ownerId | ownerName | role | type | amount | category | paymentMethod | purpose | referenceId | proofFileId | proofFileName | status | createdAt | verifiedBy | verifiedAt | updatedAt`

`AuditLog`: `auditId | action | transactionId | actorId | details | timestamp`

The Finance Admin role must be exactly `Finance Admin`. Member status values other than `Inactive` are currently treated as active; standardize rows to `Active` or `Inactive` for clarity.

## D. Connect and verify with test data

1. Open the site and enter the deployed Apps Script `/exec` URL plus the exact Spreadsheet ID.
2. Confirm the member dropdown is populated and only non-inactive profiles appear.
3. Sign in with the shared access key, member ID and PIN.
4. Verify all navigation links, filtering combinations and report date ranges.
5. Submit a test transaction with a small test proof. Confirm the row is written to `Transactions`, proof is in `NELVI Finance Control Proofs`, and `AuditLog` identifies the actor correctly.
6. Confirm all new entries—including Admin entries—start Pending. Verify/reject the pending test record using Finance Admin.
7. Edit a pending test record and confirm it returns to Pending. Edit a reviewed test record as Admin and confirm the same reset. Confirm users cannot edit another member's record and only Admin can verify/reject.
8. Confirm Delete is offered only for Pending rows and the API also rejects delete requests for reviewed rows.
9. Check verified totals, category percentages (including Other), month boundaries, report totals, INR paise display and formula-looking export values against known test rows.
10. Test 375, 390, 430, 768, 1024, 1280 and 1440 px widths; keyboard tab/focus, Escape-close dialogs, errors, loading states and browser console.

## Sync behavior

The app refreshes data manually from **Sync now** and automatically every 60 seconds while signed in. Successful creates/edits/reviews/deletes update the visible state immediately after the server responds. Google Sheets does not provide push/realtime updates in this architecture; another user's changes may take up to one polling interval to appear unless Sync now is pressed.

## Troubleshooting

- **Connection screen persists:** check `/exec`, Apps Script deployment access and server ID.
- **Spreadsheet ID mismatch:** update `SPREADSHEET_ID` in Apps Script and deploy a new version; use that same ID in the browser.
- **No members:** confirm `Members` header, active status, member IDs, and Apps Script access.
- **Login rejected:** check common key, member ID, PIN, active status and deployment version.
- **Proof rejected:** only JPEG, PNG, WebP and PDF files up to 5 MB are accepted; the server also checks file signatures and Drive permissions.
- **Transaction update rejected:** only the listed editable fields are accepted; text fields have length constraints; the change must pass server validation. Reviewed records reset to Pending when corrected.
- **Sync issue:** confirm Apps Script access, Google authorization and browser network status, then press Sync now. Check Apps Script execution logs for server-side errors.

## Release gate

Do not consider live rollout complete until the test checklist has been executed against the intended deployment and test spreadsheet. Static and local tests cannot verify your Google account permissions, Drive behavior, CORS/hosting settings or live sheet contents.
