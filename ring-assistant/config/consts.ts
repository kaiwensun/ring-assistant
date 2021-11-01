export const AWS_REGION = "us-west-2";
export const LAMBDA_TIMEOUT = 15;
export const DDB_TABLE_NAMES = {
  DDB_TABLE_NAME_EVENT: "RingAssistantEvent",
  DDB_TABLE_NAME_TOKEN_FOR_ALEXA: "RingAssistantRefreshTokenForAlexa",
  DDB_TABLE_NAME_TOKEN_FOR_LISTENER: "RingAssistantRefreshTokenForListener",
};
export const QUEUE_NAME = "RingSecurityTimer"