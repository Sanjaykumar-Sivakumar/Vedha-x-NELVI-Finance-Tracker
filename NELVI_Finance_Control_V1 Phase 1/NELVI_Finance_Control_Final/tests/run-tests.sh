#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node --check "$ROOT/app.js"
node --check "$ROOT/finance-utils.js"
cp "$ROOT/google-apps-script/Code.gs" "${TMPDIR:-/tmp}/nelvi-code-gs-check.js"
node --check "${TMPDIR:-/tmp}/nelvi-code-gs-check.js"
node "$ROOT/tests/finance-utils.test.js"
node "$ROOT/tests/backend-validation.test.js"
python3 "$ROOT/tests/static-checks.py"
echo "All local NELVI Finance Control checks passed. Live Google services are not tested by this script."
