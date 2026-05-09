#!/usr/bin/env bash
# List the cron schedules attached to the listener application.
#
#   TENSORLAKE_API_KEY=tl_apiKey_... ./list-cron.sh

set -euo pipefail

: "${TENSORLAKE_API_KEY:?set TENSORLAKE_API_KEY first}"
APP_NAME="${APP_NAME:-angel_discord_listener}"

curl -sS \
  -H "Authorization: Bearer ${TENSORLAKE_API_KEY}" \
  "https://api.tensorlake.ai/applications/${APP_NAME}/cron-schedules" | \
  (python3 -m json.tool 2>/dev/null || cat)
