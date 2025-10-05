# Ring Assistant

An Alexa skill that integrates with Ring security devices using AWS Lambda functions.

## Architecture

- **Skill Handler Lambda**: Processes Alexa skill requests and sends messages to SQS
- **Event Listener Lambda**: Processes SQS messages and interacts with Ring devices
- **Infrastructure**: CDK code for deploying AWS resources

## Project Structure

```
ring-assistant/
├── src/
│   ├── skill-handler/      # Alexa skill Lambda function
│   └── event-listener/     # SQS message processor Lambda
├── infrastructure/         # CDK infrastructure code
├── scripts/               # Utility scripts
└── build/                 # Build artifacts (ignored by git)
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Register Ring credentials:
   ```bash
   npm run register
   # or
   ./scripts/register.sh
   ```

3. Build all components:
   ```bash
   npm run build
   ```

4. Deploy to AWS:
   ```bash
   npm run deploy
   ```

## Development

- Build individual components: `npm run build --workspace=src/skill-handler`
- Clean build artifacts: `npm run clean`
- Watch for changes: `cd infrastructure && npm run watch`

## Requirements

- Node.js 22+
- AWS CLI configured
- AWS CDK CLI installed
