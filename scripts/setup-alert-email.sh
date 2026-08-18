#!/bin/bash
# Subscribe an email address to the away-mode arm-failure alert topic.
# Run this after deploying (the topic must already exist). Re-run anytime to
# change or add a recipient - it just calls SNS Subscribe, nothing to redeploy.

set -e

REGION="us-west-2"
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name RingAssistantStack \
  --query "Stacks[0].Outputs[?OutputKey=='ArmFailureAlertTopicArn'].OutputValue" \
  --output text)

if [ -z "$TOPIC_ARN" ] || [ "$TOPIC_ARN" == "None" ]; then
  echo "Could not find the alert topic ARN - has the stack been deployed yet?"
  exit 1
fi

read -p "Enter the email address to receive away-mode arm-failure alerts: " ALERT_EMAIL

aws sns subscribe \
  --region "$REGION" \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL"

echo
echo "AWS sent a subscription confirmation email to $ALERT_EMAIL - click the link in it to start receiving alerts."
