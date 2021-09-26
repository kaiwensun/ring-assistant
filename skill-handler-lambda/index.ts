/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */

import * as Alexa from "ask-sdk-core";
import { ErrorHandler, HandlerInput } from "ask-sdk-core";
import {
  IntentRequest,
  RequestEnvelope,
} from "ask-sdk-model";
import * as AWS from "aws-sdk";
import * as persistenceAdapter from "ask-sdk-dynamodb-persistence-adapter";
import { RingApi } from "ring-client-api";
import { parse, toSeconds } from "iso8601-duration";
import { Context } from "aws-lambda";

const DEFAULT_DELAY = "PT3M"; // 3 minutes

interface CacheProps {
  client?: RingApi;
}
const CACHE: {
  [key: string]: CacheProps;
} = {};

const getAttr = (handlerInput: HandlerInput, attr: string) => {
  return handlerInput.attributesManager.getSessionAttributes()[attr];
};

const setAttrs = (
  handlerInput: HandlerInput,
  newAttrs: { [key: string]: any }
) => {
  const attrs = handlerInput.attributesManager.getSessionAttributes();
  return handlerInput.attributesManager.setSessionAttributes({
    ...attrs,
    ...newAttrs,
    updatAt: new Date().toISOString(),
  });
};

const flushAttrs = async (handlerInput: HandlerInput) => {
  const attrManager = handlerInput.attributesManager;
  attrManager.setPersistentAttributes(attrManager.getSessionAttributes());
  await attrManager.savePersistentAttributes();
};

const LaunchRequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      !getAttr(handlerInput, "refreshToken") ||
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  async handle(handlerInput: HandlerInput) {
    if (!getAttr(handlerInput, "refreshToken")) {
      const registerCode = ("0000" + Math.floor(Math.random() * 10000)).slice(
        -4
      );
      setAttrs(handlerInput, { registerCode });
      await flushAttrs(handlerInput);
      return handlerInput.responseBuilder
        .speak(
          `Refresh token is not registered. Set it for register code ${registerCode}`
        )
        .getResponse();
    } else {
      return handlerInput.responseBuilder
        .speak("You can ask me to temporarily disarm ring for some time")
        .getResponse();
    }
  },
};

const getUserCache = (handlerInput: HandlerInput, attr: keyof CacheProps) => {
  const userId = Alexa.getUserId(handlerInput.requestEnvelope);
  CACHE[userId] ||= {};
  const userCache = CACHE[userId];
  return userCache[attr];
};

const setUserCache = (
  handlerInput: HandlerInput,
  attr: keyof CacheProps,
  value: any
) => {
  const userId = Alexa.getUserId(handlerInput.requestEnvelope);
  CACHE[userId] ||= {};
  const userCache = CACHE[userId];
  userCache[attr] = value;
};

const getRingClient = (handlerInput: HandlerInput): RingApi => {
  let client: RingApi = getUserCache(handlerInput, "client") as RingApi;
  if (client) {
    return client;
  }
  const refreshToken = getAttr(handlerInput, "refreshToken");
  client = new RingApi({ refreshToken });
  client.onRefreshTokenUpdated.subscribe(
    async ({ newRefreshToken /* , oldRefreshToken */ }) => {
      setAttrs(handlerInput, { refreshToken: newRefreshToken });
      await flushAttrs(handlerInput);
    }
  );
  setUserCache(handlerInput, "client", client);
  return client;
};

const MODES = {
  all: "away",
  some: "home",
  none: "disarmed",
};

const TempDisarmIntent = {
  canHandle(handlerInput: HandlerInput) {
    return (
      getAttr(handlerInput, "refreshToken") &&
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "TempDisarmIntent"
    );
  },
  async handle(handlerInput: HandlerInput) {
    const ring = getRingClient(handlerInput);
    const locations = await ring.getLocations();
    const location = locations[0];
    const mode = MODES[await location.getAlarmMode()];

    if (mode === "disarmed") {
      const speakOutput = "Ring is already disarmed.";
      return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    }

    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const delay = request.intent.slots?.delay.value || DEFAULT_DELAY;
    const parsedDelay = parse(delay);

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

    // TODO: schedule an event to arm ring.

    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput: HandlerInput) {
    const speakOutput =
      "You can ask me to temporarily disarm ring for some time. I will automatically set ring back to the current mode later.";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.StopIntent")
    );
  },
  handle(handlerInput: HandlerInput) {
    const speakOutput = "Goodbye!";

    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput: HandlerInput) {
    const speakOutput = "Sorry, I don't know about that. Please try again.";

    return handlerInput.responseBuilder
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
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput: HandlerInput) {
    console.log(
      `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`
    );
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  },
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput: HandlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `You just triggered ${intentName}`;

    return (
      handlerInput.responseBuilder
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
  handle(handlerInput: HandlerInput, error: any) {
    const speakOutput =
      "Sorry, I had trouble doing what you asked. Please try again.";
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const LoadPersistentAttributesInterceptor = {
  async process(handlerInput: HandlerInput) {
    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes =
      (await attributesManager.getPersistentAttributes()) || {};
    attributesManager.setSessionAttributes(sessionAttributes);
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
    .withPersistenceAdapter(
      new persistenceAdapter.DynamoDbPersistenceAdapter({
        tableName: "ring-assistant-attributes"!,
        createTable: true,
        dynamoDBClient: new AWS.DynamoDB({
          apiVersion: "latest",
          region: "us-west-2",
        }),
      })
    )
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
    .withCustomUserAgent("sample/hello-world/v1.2")
    .lambda()(event, context, callback);
};
