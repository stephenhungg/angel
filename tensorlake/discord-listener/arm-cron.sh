#!/usr/bin/env bash
# Arm a 60s cron schedule on the deployed `angel_discord_listener` application.
# Run this ONCE after `tl deploy`. Idempotent-ish — re-running creates a
# duplicate schedule (Tensorlake allows up to 100/app), so check with
# `./list-cron.sh` first.
#
#   TENSORLAKE_API_KEY=tl_apiKey_... ./arm-cron.sh
#
# Tensorlake's minimum cron interval is 60s. "* * * * *" = every minute.

set -euo pipefail

: "${TENSORLAKE_API_KEY:?set TENSORLAKE_API_KEY first (export it from your env)}"
APP_NAME="${APP_NAME:-angel_discord_listener}"
CRON_EXPRESSION="${CRON_EXPRESSION:-* * * * *}"

echo "arming cron '${CRON_EXPRESSION}' on application '${APP_NAME}'..."

resp=$(curl -sS -X POST \
  -H "Authorization: Bearer ${TENSORLAKE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"cron_expression\":\"${CRON_EXPRESSION}\"}" \
  "https://api.tensorlake.ai/applications/${APP_NAME}/cron-schedules")

echo "${resp}"
echo ""
echo "schedule armed. confirm with: ./list-cron.sh"
