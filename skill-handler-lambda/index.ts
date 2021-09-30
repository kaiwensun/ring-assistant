/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */

import * as Alexa from "ask-sdk-core";
import { ErrorHandler, HandlerInput } from "ask-sdk-core";
import { IntentRequest, RequestEnvelope } from "ask-sdk-model";
import { SQS } from "aws-sdk";
import { RingApi } from "ring-client-api";
import { parse, toSeconds } from "iso8601-duration";
import { Context } from "aws-lambda";
import { randomUUID } from "crypto";
import { SendMessageRequest } from "aws-sdk/clients/sqs";
import { MessageAttributeMap } from "aws-sdk/clients/sns";
import * as ddb from "./ddb";
import { DDB_TABLE_NAMES, MODE, IRingToken, IScheduledRingEvent } from "./ddb";

const DEFAULT_DELAY = "PT3M"; // 3 minutes
const TIMER_SQS_URL = process.env.TIMER_SQS_URL!;
const TOKEN_SESSION_FIELD = "refreshToken";
const sqs = new SQS();
interface UserCacheProps {
  client?: RingApi;
}
const USER_CACHE: {
  [key: string]: UserCacheProps;
} = {};

const getUserId = (input: HandlerInput) => {
  return Alexa.getUserId(input.requestEnvelope);
};

const getAttr = (input: HandlerInput, attr: string) => {
  return input.attributesManager.getSessionAttributes()[attr];
};

const setAttrs = (input: HandlerInput, newAttrs: { [key: string]: any }) => {
  const attrs = input.attributesManager.getSessionAttributes();
  return input.attributesManager.setSessionAttributes({
    ...attrs,
    ...newAttrs,
    updateAt: new Date().toISOString(),
  });
};

async function getRingTokenFromDB(input: HandlerInput) {
  const userId = getUserId(input);
  const item = await ddb.getItem(DDB_TABLE_NAMES.TOKEN_FOR_ALEXA, userId);
  const token = (item?.value as ddb.IRingToken)?.token;
  if (token && /[0-9]{4}/.test(token)) {
    return undefined;
  }
  return token;
}

const scheduleRearm = async (
  input: HandlerInput,
  delay: number,
  mode: MODE
) => {
  const userId = getUserId(input);
  const uuid = randomUUID();
  const process = "scheduled";

  // update DDB for validation
  const value: IScheduledRingEvent = {
    mode,
    uuid,
    delay,
    process,
  };

  await ddb.putItem(DDB_TABLE_NAMES.EVENT, userId, value);

  // publish to SQS
  const metadata: MessageAttributeMap = {
    userId: {
      DataType: "String",
      StringValue: userId,
    },
    uuid: {
      DataType: "String",
      StringValue: uuid,
    },
  };
  const request: SendMessageRequest = {
    DelaySeconds: delay,
    QueueUrl: TIMER_SQS_URL,
    MessageAttributes: metadata,
    MessageBody: Alexa.getRequest(input.requestEnvelope).requestId,
  };

  await sqs.sendMessage(request).promise();
};

const genRingClient = (input: HandlerInput): RingApi => {
  const refreshToken = getAttr(input, TOKEN_SESSION_FIELD);
  const userId = getUserId(input);
  const controlCenterDisplayName = "Ring Assistant Alexa Skill Handler";
  const client = new RingApi({ refreshToken, controlCenterDisplayName });
  client.onRefreshTokenUpdated.subscribe(
    async ({ newRefreshToken /* , oldRefreshToken */ }) => {
      setAttrs(input, { [TOKEN_SESSION_FIELD]: newRefreshToken });
      const value: IRingToken = { token: newRefreshToken };
      await ddb.putItem(DDB_TABLE_NAMES.TOKEN_FOR_ALEXA, userId, value);
    }
  );
  return client;
};

const getRingClient = (input: HandlerInput): RingApi => {
  const userId = getUserId(input);
  USER_CACHE[userId] ||= {};
  if (!USER_CACHE[userId].client) {
    USER_CACHE[userId].client = genRingClient(input);
  }
  return USER_CACHE[userId].client!;
};

const MODES_MAP: { [key: string]: MODE } = {
  all: "away",
  some: "home",
  none: "disarmed",
};

const LaunchRequestHandler = {
  canHandle(input: HandlerInput) {
    return (
      !getAttr(input, TOKEN_SESSION_FIELD) ||
      Alexa.getRequestType(input.requestEnvelope) === "LaunchRequest"
    );
  },
  async handle(input: HandlerInput) {
    if (!getAttr(input, TOKEN_SESSION_FIELD)) {
      const registerCode = ("0000" + Math.floor(Math.random() * 10000)).slice(
        -4
      );
      const userId = getUserId(input);
      const value: IRingToken = { token: registerCode };
      await ddb.putItem(DDB_TABLE_NAMES.TOKEN_FOR_ALEXA, userId, value);
      return input.responseBuilder
        .speak(
          `Refresh token is not registered. Set it for register code ${registerCode}`
        )
        .getResponse();
    } else {
      return input.responseBuilder
        .speak("You can ask me to temporarily disarm ring for some time")
        .getResponse();
    }
  },
};

const TempDisarmIntent = {
  canHandle(input: HandlerInput) {
    return (
      getAttr(input, "refreshToken") &&
      Alexa.getRequestType(input.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(input.requestEnvelope) === "TempDisarmIntent"
    );
  },
  async handle(input: HandlerInput) {
    const ring = getRingClient(input);
    const locations = await ring.getLocations();
    const location = locations[0];
    const raw_mode = await location.getAlarmMode()
    console.debug(`raw mode: ${raw_mode}`);
    const mode = MODES_MAP[raw_mode];

    if (mode === "disarmed") {
      const speakOutput = "Ring is already disarmed.";
      return input.responseBuilder.speak(speakOutput).getResponse();
    }

    const request = input.requestEnvelope.request as IntentRequest;
    const delay = request.intent.slots?.delay.value || DEFAULT_DELAY;
    const parsedDelay = parse(delay);
    const delayInSecond = toSeconds(parsedDelay);
    if (delayInSecond === 0) {
      const speakOutput = "delay cannot be zero.";
      return input.responseBuilder.speak(speakOutput).getResponse();
    }

    let spokenDelay = "";
    const units = ["years", "months", "days", "hours", "minutes", "seconds"];
    for (let unit of units) {
      const value = (parsedDelay as any)[unit];
      if (value) {
        spokenDelay += `${value} ${
          value == 1 ? unit.substring(0, unit.length - 1) : unit
        } `;
      }
    }
    let speakOutput = `Disarmed. Ring will be in ${mode} mode in ${spokenDelay.trim()}.`;

    console.log("disarming");
    await location.disarm();
    console.log("disarmed");

    await scheduleRearm(input, delayInSecond, mode);

    return input.responseBuilder.speak(speakOutput).getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(input: HandlerInput) {
    return (
      Alexa.getRequestType(input.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(input.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(input: HandlerInput) {
    const speakOutput =
      "You can ask me to temporarily disarm ring for some time. I will automatically set ring back to the current mode later.";

    return input.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(input: HandlerInput) {
    return (
      Alexa.getRequestType(input.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(input.requestEnvelope) === "AMAZON.CancelIntent" ||
        Alexa.getIntentName(input.requestEnvelope) === "AMAZON.StopIntent")
    );
  },
  handle(input: HandlerInput) {
    const speakOutput = "Goodbye!";

    return input.responseBuilder.speak(speakOutput).getResponse();
  },
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(input: HandlerInput) {
    return (
      Alexa.getRequestType(input.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(input.requestEnvelope) === "AMAZON.FallbackIntent"
    );
  },
  handle(input: HandlerInput) {
    const speakOutput = "Sorry, I don't know about that. Please try again.";

    return input.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle(input: HandlerInput) {
    return (
      Alexa.getRequestType(input.requestEnvelope) === "SessionEndedRequest"
    );
  },
  handle(input: HandlerInput) {
    console.log(`~~~~ Session ended: ${JSON.stringify(input.requestEnvelope)}`);
    // Any cleanup logic goes here.
    return input.responseBuilder.getResponse(); // notice we send an empty response
  },
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(input: HandlerInput) {
    return Alexa.getRequestType(input.requestEnvelope) === "IntentRequest";
  },
  handle(input: HandlerInput) {
    const intentName = Alexa.getIntentName(input.requestEnvelope);
    const speakOutput = `You just triggered ${intentName}`;

    return (
      input.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(input: HandlerInput, error: any) {
    const speakOutput =
      "Sorry, I had trouble doing what you asked. Please try again.";
    console.error(
      `~~~~ Error handled: ${error?.stack || JSON.stringify(error)}`
    );

    return input.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const LoadPersistentAttributesInterceptor = {
  async process(input: HandlerInput) {
    const token = await getRingTokenFromDB(input);
    setAttrs(input, { [TOKEN_SESSION_FIELD]: token });
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */

const skillBuilder = Alexa.SkillBuilders.custom();

export const handler = (
  event: RequestEnvelope,
  context: Context,
  callback: (err: Error, result?: any) => void
) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return skillBuilder
    .withApiClient(new Alexa.DefaultApiClient())
    .addRequestHandlers(
      LaunchRequestHandler,
      TempDisarmIntent,

      /* default handlers */
      HelpIntentHandler,
      CancelAndStopIntentHandler,
      FallbackIntentHandler,
      SessionEndedRequestHandler,
      IntentReflectorHandler
    )
    .addRequestInterceptors(LoadPersistentAttributesInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withCustomUserAgent("kw-ring-assistant/alexa-skill-handler/v1.0")
    .lambda()(event, context, callback);
};
