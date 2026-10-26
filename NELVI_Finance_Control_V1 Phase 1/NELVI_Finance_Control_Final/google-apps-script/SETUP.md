# Google Sheets + Apps Script Setup

1. Back up the existing finance spreadsheet and Apps Script code before updating.
2. Open the **existing** Google Sheet and use Extensions → Apps Script.
3. Paste `Code.gs` from this package into the associated project.
4. Set `SPREADSHEET_ID` and a strong unique `ACCESS_KEY` in the constants at the top.
5. Deploy → Manage deployments → Edit → New version → Deploy. The Web App URL normally remains the same.
6. Execute as: Me. Restrict access to trusted users as much as your team workflow allows.
7. Open the website and enter the exact Web App URL ending `/exec` and matching Spreadsheet ID.

The script ensures these tabs exist without deleting populated rows:
- `Members`
- `Transactions`
- `AuditLog`

Payment proofs are uploaded to `NELVI Finance Control Proofs`. Valid types: JPEG, PNG, WebP and PDF; maximum size 5 MB; server checks the signature bytes as well as the requested MIME type.

## Important security limitation

The current workflow uses a shared access key and member PIN, and PINs are stored in the Members sheet. This is not bank-grade authentication. The pre-login bootstrap returns active member IDs, names and roles so the login form can provide a selection list. Limit deployment, spreadsheet and Drive access to trusted users, use unique PINs and a strong key, and keep backups. Prefer a planned Google Workspace/OAuth identity migration for stronger security.
