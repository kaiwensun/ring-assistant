#!/bin/bash
# Register Ring credentials for the skill handler

set -e

echo "Registering Ring credentials..."
npx -p ring-client-api ring-auth-cli

echo
read -p "Set up away-mode arm-failure email alerts now? [y/N] " SETUP_ALERTS
if [[ "$SETUP_ALERTS" =~ ^[Yy]$ ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "$SCRIPT_DIR/setup-alert-email.sh"
else
  echo "Skipped. Run 'npm run setup-alert-email' later to configure it."
fi

echo
echo 'Check alexa account ID in DDB table, then put the token in DDB table in this format:
{
 "id": "amzn1.ask.account.xxxxxx",
 "updateAt": "2025-10-05T22:23:48.275Z",
 "value": {
  "token": "<the refresh token>"
 }
}
'