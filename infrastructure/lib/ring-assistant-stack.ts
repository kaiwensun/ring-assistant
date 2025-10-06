import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { 
  SKILL_LAMBDA_TIMEOUT, 
  LISTENER_LAMBDA_TIMEOUT, 
  DDB_TABLE_NAMES, 
  QUEUE_NAME,
  SKILL_ID, 
} from '../config/consts';

export class RingAssistantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const eventTable = new dynamodb.Table(this, 'EventTable', {
      tableName: DDB_TABLE_NAMES.DDB_TABLE_NAME_EVENT,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const listenerTokenTable = new dynamodb.Table(this, 'ListenerTokenTable', {
      tableName: DDB_TABLE_NAMES.DDB_TABLE_NAME_TOKEN_FOR_LISTENER,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // SQS Queue
    const queue = new sqs.Queue(this, 'RingSecurityQueue', {
      queueName: QUEUE_NAME,
      visibilityTimeout: cdk.Duration.seconds(LISTENER_LAMBDA_TIMEOUT * 2),
    });

    // Skill Handler Lambda
    const skillHandler = new lambda.Function(this, 'SkillHandler', {
      functionName: 'ring-assistant',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('../src/skill-handler'),
      timeout: cdk.Duration.seconds(SKILL_LAMBDA_TIMEOUT),
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
    const eventListener = new lambda.Function(this, 'EventListener', {
      functionName: 'RingAssistantEventListener',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('../src/event-listener'),
      timeout: cdk.Duration.seconds(LISTENER_LAMBDA_TIMEOUT),
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
    alexaTokenTable.grantReadWriteData(skillHandlerAlias);
    listenerTokenTable.grantReadWriteData(eventListenerAlias);

    // Add SQS trigger to event listener alias
    eventListenerAlias.addEventSource(new lambdaEventSources.SqsEventSource(queue));
  }
}
