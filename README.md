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
└── README.md
```

## Prerequisites

- Node.js 22+
- AWS CLI configured with appropriate permissions
- AWS CDK CLI installed: `npm install -g aws-cdk`

## Installation

1. **Clone and install dependencies for each component:**
   ```bash
   npm run install
   ```
   This runs `npm install` for all three packages (src/skill-handler, src/event-listener, infrastructure).

## Build

Build all Lambda functions:
```bash
# From project root
npm run build
```

This runs `npm run build` for all three packages (src/skill-handler, src/event-listener, infrastructure).

## Deploy

1. **Bootstrap CDK (first time only):**
   ```bash
   cd infrastructure
   npx cdk bootstrap
   ```

2. **Deploy infrastructure:**
   ```bash
   # From project root
   npm run deploy
   
   # Or from infrastructure directory
   cd infrastructure && npm run deploy
   ```

## Configuration

1. **Register Ring credentials:**
   ```bash
   npm run register
   ```
   Store the token to DDB following the tool instruction.

2. **Configure Alexa Skill endpoint in Alexa developer console:**
   - Set Lambda function ARN to: `arn:aws:lambda:REGION:ACCOUNT:function:RingSkillHandler:live`
   - The skill ID `amzn1.ask.skill.XXXXXX` is pre-configured

## Development Workflow

1. Make code changes in `src/skill-handler/` or `src/event-listener/`
2. Build: `npm run build`
3. Deploy: `npm run deploy`
4. Test via Alexa Developer Console or device

## Lambda Functions

Both functions use:
- **Runtime**: Node.js 22
- **Architecture**: ES Modules
- **Alias**: `live` with provisioned concurrency
- **Independent dependency management**

## Clean Up

```bash
# Remove build artifacts
npm run clean

# Remove installed dependencies
npm run uninstall

# Destroy AWS resources
cd infrastructure && npx cdk destroy
```
