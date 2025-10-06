export const AWS_REGION = "us-west-2";
export const SKILL_LAMBDA_TIMEOUT = 15;
export const LISTENER_LAMBDA_TIMEOUT = 60 * 2;
export const DDB_TABLE_NAMES = {
  DDB_TABLE_NAME_EVENT: "RingAssistantEvent",
  DDB_TABLE_NAME_TOKEN_FOR_LISTENER: "RingAssistantRefreshTokenForListener",
};
export const QUEUE_NAME = "RingSecurityTimer"
export const SKILL_HANDLER_LAMBDA_NAME = "RingSkillHandler";
export const EVENT_LISTENER_LAMBDA_NAME = "RingEventListener";
export const SKILL_ID = "amzn1.ask.skill.22a873eb-f31e-4f16-92b1-4e1063bbfcaa";