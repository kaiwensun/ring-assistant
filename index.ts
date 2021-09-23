/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */

import * as Alexa from "ask-sdk-core";
import {
  ErrorHandler,
  HandlerInput,
  RequestHandler,
  SkillBuilders,
} from "ask-sdk-core";
import { IntentRequest, Response, SessionEndedRequest } from "ask-sdk-model";
import * as AWS from "aws-sdk";
import * as persistenceAdapter from "ask-sdk-dynamodb-persistence-adapter";

const HelloWorldHandler = {
  canHandle(handlerInput: HandlerInput) {
    return false;
  },
  handle(handlerInput: HandlerInput) {
    return handlerInput.responseBuilder
      .speak("Hello from Lambda!")
      .getResponse();
  },
};

const LaunchRequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  handle(handlerInput: HandlerInput) {
    const speakOutput = "Hello! Welcome to Caketime. What is your birthday?";
    const repromptText = "I was born Nov. 6th, 2014. When were you born?";

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(repromptText)
      .getResponse();
  },
};

const HasBirthdayLaunchRequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() || {};

    const year = sessionAttributes.hasOwnProperty("year")
      ? sessionAttributes.year
      : 0;
    const month = sessionAttributes.hasOwnProperty("month")
      ? sessionAttributes.month
      : 0;
    const day = sessionAttributes.hasOwnProperty("day")
      ? sessionAttributes.day
      : 0;

    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest" &&
      year &&
      month &&
      day
    );
  },
  async handle(handlerInput: HandlerInput) {
    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() || {};

    const year = sessionAttributes.hasOwnProperty("year")
      ? sessionAttributes.year
      : 0;
    const month = sessionAttributes.hasOwnProperty("month")
      ? sessionAttributes.month
      : 0;
    const day = sessionAttributes.hasOwnProperty("day")
      ? sessionAttributes.day
      : 0;

    const serviceClientFactory = handlerInput.serviceClientFactory!;
    const deviceId =
      handlerInput.requestEnvelope.context.System.device!.deviceId;
    const upsServiceClient = serviceClientFactory.getUpsServiceClient();

    let userTimeZone;
    try {
      const upsServiceClient = serviceClientFactory.getUpsServiceClient();
      userTimeZone = await upsServiceClient.getSystemTimeZone(deviceId);
    } catch (error: any) {
      if (error.name !== "ServiceError") {
        return handlerInput.responseBuilder
          .speak("There was a problem connecting to the timezone service.")
          .getResponse();
      }
    }

    const currentDateTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: userTimeZone })
    );
    const currentDate = new Date(
      currentDateTime.getFullYear(),
      currentDateTime.getMonth(),
      currentDateTime.getDate()
    );
    const currentYear = currentDate.getFullYear();

    // setting the default speechText to Happy xth Birthday!!
    // Alexa will automatically correct the ordinal for you.
    // no need to worry about when to use st, th, rd
    let speakOutput = `Happy ${currentYear - year}th birthday!`;

    let nextBirthday = Date.parse(`${month} ${day}, ${currentYear}`);
    if (currentDate.getTime() > nextBirthday) {
      nextBirthday = Date.parse(`${month} ${day}, ${currentYear + 1}`);
    }
    const oneDay = 24 * 60 * 60 * 1000;
    if (currentDate.getTime() !== nextBirthday) {
      const diffDays = Math.round(
        Math.abs((currentDate.getTime() - nextBirthday) / oneDay)
      );
      speakOutput = `Welcome back. It looks like there are ${diffDays} days until your ${
        currentYear - year
      }th birthday.`;
    }

    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};

const CaptureBirthdayIntentHandler = {
  canHandle(handlerInput: HandlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "CaptureBirthdayIntent"
    );
  },
  async handle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const year = request.intent.slots?.year.value;
    const month = request.intent.slots?.month.value;
    const day = request.intent.slots?.day.value;

    const attributesManager = handlerInput.attributesManager;

    const birthdayAttributes = { year, month, day };
    attributesManager.setPersistentAttributes(birthdayAttributes);
    await attributesManager.savePersistentAttributes();

    const speakOutput = `Thanks, I'll remember that your birthday is ${month} ${day} ${year}.`;

    return (
      handlerInput.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
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
    const speakOutput = "You can say hello to me! How can I help?";

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

const LoadBirthdayInterceptor = {
  async process(handlerInput: HandlerInput) {
    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes =
      (await attributesManager.getPersistentAttributes()) || {};

    const year = sessionAttributes.hasOwnProperty("year")
      ? sessionAttributes.year
      : 0;
    const month = sessionAttributes.hasOwnProperty("month")
      ? sessionAttributes.month
      : 0;
    const day = sessionAttributes.hasOwnProperty("day")
      ? sessionAttributes.day
      : 0;

    if (year && month && day) {
      attributesManager.setSessionAttributes(sessionAttributes);
    }
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */
exports.handler = Alexa.SkillBuilders.custom()
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
    HelloWorldHandler,
    HasBirthdayLaunchRequestHandler,
    LaunchRequestHandler,
    CaptureBirthdayIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler
  )
  .addRequestInterceptors(
      LoadBirthdayInterceptor)
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent("sample/hello-world/v1.2")
  .lambda();
