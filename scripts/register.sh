#!/bin/bash
# Register Ring credentials for the skill handler

set -e

echo "Registering Ring credentials..."
npx -p ring-client-api ring-auth-cli

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