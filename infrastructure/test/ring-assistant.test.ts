import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as RingAssistant from '../lib/ring-assistant-stack';

test('SQS Queue Created', () => {
  const app = new cdk.App();
  const stack = new RingAssistant.RingAssistantStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::SQS::Queue', {
    QueueName: 'RingSecurityTimer'
  });
});
