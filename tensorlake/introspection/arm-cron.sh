#!/usr/bin/env bash
# Arm a 5-minute cron schedule on the deployed `introspection` application.
# Run this ONCE after `tl deploy listener.py`. Re-running creates a duplicate
# schedule (Tensorlake allows up to 100/app), so check with `./list-cron.sh`
# first.
#
#   TENSORLAKE_API_KEY=tl_apiKey_... ./arm-cron.sh
#
# Override the schedule:
#   CRON_EXPRESSION="*/10 * * * *" ./arm-cron.sh   # every 10 min instead

set -euo pipefail

: "${TENSORLAKE_API_KEY:?set TENSORLAKE_API_KEY first (export it from your env)}"
APP_NAME="${APP_NAME:-introspection}"
CRON_EXPRESSION="${CRON_EXPRESSION:-*/5 * * * *}"  # every 5 minutes

echo "arming cron '${CRON_EXPRESSION}' on application '${APP_NAME}'..."

resp=$(curl -sS -X POST \
  -H "Authorization: Bearer ${TENSORLAKE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"cron_expression\":\"${CRON_EXPRESSION}\"}" \
  "https://api.tensorlake.ai/applications/${APP_NAME}/cron-schedules")

echo "${resp}"
echo ""
echo "schedule armed. confirm with: tl cron ls ${APP_NAME}"
