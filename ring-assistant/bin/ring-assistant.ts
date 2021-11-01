#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { RingAssistantStack } from "../lib/ring-assistant-stack";
import { AWS_REGION } from "../config/consts";

const app = new cdk.App();
new RingAssistantStack(app, "RingAssistantStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: AWS_REGION },
});
