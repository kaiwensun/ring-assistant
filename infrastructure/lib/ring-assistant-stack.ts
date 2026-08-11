import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import {
  SKILL_LAMBDA_TIMEOUT,
  LISTENER_LAMBDA_TIMEOUT,
  QUEUE_VISIBILITY_TIMEOUT,
  DDB_TABLE_NAMES,
  QUEUE_NAME,
  SKILL_ID,
  EVENT_LISTENER_LAMBDA_NAME,
  SKILL_HANDLER_LAMBDA_NAME,
} from '../config/consts';

export class RingAssistantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const eventTable = new dynamodb.Table(this, 'EventTable', {
      tableName: DDB_TABLE_NAMES.DDB_TABLE_NAME_EVENT,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const listenerTokenTable = new dynamodb.Table(this, 'ListenerTokenTable', {
      tableName: DDB_TABLE_NAMES.DDB_TABLE_NAME_TOKEN_FOR_LISTENER,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // SQS Queue
    const queue = new sqs.Queue(this, 'RingSecurityQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: cdk.Duration.seconds(QUEUE_VISIBILITY_TIMEOUT),
    });

    // Skill Handler Lambda
    const skillHandler = new NodejsFunction(this, 'SkillHandler', {
      functionName: SKILL_HANDLER_LAMBDA_NAME,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/skill-handler/index.ts'),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../src/skill-handler/package-lock.json'),
      timeout: cdk.Duration.seconds(SKILL_LAMBDA_TIMEOUT),
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ['module', 'main'],
        banner: "import { createRequire as topLevelCreateRequire } from 'module'; import { fileURLToPath as topLevelFileURLToPath } from 'url'; const require = topLevelCreateRequire(import.meta.url); const __filename = topLevelFileURLToPath(import.meta.url); const __dirname = topLevelFileURLToPath(new URL('.', import.meta.url));",
      },
      environment: {
        TIMER_SQS_URL: queue.queueUrl,
        EVENT_TABLE_NAME: eventTable.tableName,
      },
    });

    // Skill Handler Alias
    const skillHandlerAlias = skillHandler.addAlias('live');
    
    // Add provisioned concurrency
    skillHandlerAlias.addAutoScaling({
      minCapacity: 1,
      maxCapacity: 1,
    });

    // Add Alexa Skills Kit trigger for specific skill
    skillHandlerAlias.addPermission('AlexaSkillsKitTrigger', {
      principal: new cdk.aws_iam.ServicePrincipal('alexa-appkit.amazon.com'),
      action: 'lambda:InvokeFunction',
      eventSourceToken: SKILL_ID,
    });

    // Event Listener Lambda
    const eventListener = new NodejsFunction(this, 'EventListener', {
      functionName: EVENT_LISTENER_LAMBDA_NAME,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/event-listener/index.ts'),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../src/event-listener/package-lock.json'),
      timeout: cdk.Duration.seconds(LISTENER_LAMBDA_TIMEOUT),
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ['module', 'main'],
        banner: "import { createRequire as topLevelCreateRequire } from 'module'; import { fileURLToPath as topLevelFileURLToPath } from 'url'; const require = topLevelCreateRequire(import.meta.url); const __filename = topLevelFileURLToPath(import.meta.url); const __dirname = topLevelFileURLToPath(new URL('.', import.meta.url));",
      },
      environment: {
        EVENT_TABLE_NAME: eventTable.tableName,
        LISTENER_TOKEN_TABLE_NAME: listenerTokenTable.tableName,
      },
    });

    // Event Listener Alias
    const eventListenerAlias = eventListener.addAlias('live');
    
    // Add provisioned concurrency
    eventListenerAlias.addAutoScaling({
      minCapacity: 1,
      maxCapacity: 1,
    });

    // Grant permissions
    queue.grantSendMessages(skillHandlerAlias);
    queue.grantConsumeMessages(eventListenerAlias);
    eventTable.grantReadWriteData(skillHandlerAlias);
    eventTable.grantReadWriteData(eventListenerAlias);
    listenerTokenTable.grantReadWriteData(eventListenerAlias);
    listenerTokenTable.grantReadData(skillHandlerAlias)

    // Add SQS trigger to event listener alias
    eventListenerAlias.addEventSource(new lambdaEventSources.SqsEventSource(queue));
  }
}
