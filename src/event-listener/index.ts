import { RingApi } from "ring-client-api";
import { appApi } from "ring-client-api/rest-client";
import { Context, SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import * as ddb from "./ddb.js";
import { DDB_TABLE_NAMES, MODE, IRingToken, IScheduledRingEvent } from "./ddb.js";

const sns = new SNSClient({});
const ARM_FAILURE_ALERT_TOPIC_ARN = process.env.ARM_FAILURE_ALERT_TOPIC_ARN!;

interface IBypassDevice {
  name: string;
  id: string;
}

interface ILocationModeResponse {
  mode: MODE;
  lastUpdateTimeMS: number;
  readOnly: boolean;
  bypassedDevices?: IBypassDevice[];
}

interface IRingApiErrorBody {
  error?: number;
  errors?: number[];
  extra?: IBypassDevice[];
  msg?: string;
}

interface UserCacheProps {
  client?: RingApi;
}

const USER_CACHE: {
  [key: string]: UserCacheProps;
} = {};

// ring-client-api's background push-notification reconnect timer can reject against a
// stale client after a frozen Lambda environment thaws, which otherwise crashes the process.
// Drop all cached clients so the next call rebuilds a clean one instead of reusing whatever
// state that background task left behind.
process.on("unhandledRejection", (reason: any) => {
  console.error(`unhandled rejection: ${reason?.stack || JSON.stringify(reason)}`);
  for (const userId of Object.keys(USER_CACHE)) {
    delete USER_CACHE[userId];
  }
});

async function getRingTokenFromDB(userId: string) {
  const item = await ddb.getItem(DDB_TABLE_NAMES.TOKEN_FOR_LISTENER, userId);
  const token = (item?.value as ddb.IRingToken)?.token;
  if (token && /^[0-9]{4}$/.test(token)) {
    return undefined;
  }
  return token;
}

const genRingClient = async (userId: string): Promise<RingApi> => {
  const refreshToken = await getRingTokenFromDB(userId);
  if (!refreshToken) {
    const msg = "Failed to fetch refresh token!";
    throw new Error(msg);
  }
  const controlCenterDisplayName = "Ring Assistant Alexa Skill Listener";
  const client = new RingApi({ refreshToken, controlCenterDisplayName });
  client.onRefreshTokenUpdated.subscribe(
    async ({ newRefreshToken /* , oldRefreshToken */ }) => {
      const value: IRingToken = { token: newRefreshToken };
      await ddb.putItem(DDB_TABLE_NAMES.TOKEN_FOR_LISTENER, userId, value);
    }
  );
  console.debug("generated new ring client");
  return client;
};

const getRingClient = async (userId: string): Promise<RingApi> => {
  USER_CACHE[userId] ||= {};
  if (!USER_CACHE[userId].client) {
    USER_CACHE[userId].client = await genRingClient(userId);
  }
  return USER_CACHE[userId].client!;
};

const getLocationMode = async (ring: RingApi, locationId: string): Promise<MODE> => {
  const t0 = Date.now();
  const response = await ring.restClient.request<ILocationModeResponse>({
    method: "GET",
    url: appApi(`mode/location/${locationId}`),
  });
  console.debug(`[timing] getLocationMode took ${Date.now() - t0}ms`);
  return response.mode;
};

const prewarmRingClients = async () => {
  const userIds = await ddb.listItemIds(DDB_TABLE_NAMES.TOKEN_FOR_LISTENER);
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const t0 = Date.now();
        const client = await getRingClient(userId);
        console.debug(`[timing] prewarm getRingClient took ${Date.now() - t0}ms`);
        const t1 = Date.now();
        const locations = await client.getLocations();
        console.debug(`[timing] prewarm getLocations took ${Date.now() - t1}ms`);
        const t2 = Date.now();
        await getLocationMode(client, locations[0].id);
        console.debug(`[timing] prewarm getLocationMode took ${Date.now() - t2}ms`);
        console.debug(`prewarmed ring client for ${userId}`);
      } catch (error: any) {
        console.error(`failed to prewarm ring client for ${userId}: ${error.stack || JSON.stringify(error)}`);
      }
    })
  );
};

try {
  await prewarmRingClients();
} catch (error: any) {
  console.error(`prewarm skipped due to error: ${error.stack || JSON.stringify(error)}`);
}

export const handler: SQSHandler = async (
  event: SQSEvent,
  context: Context
) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log("Event: ", JSON.stringify(event, null, 2));
  for (const record of event.Records) {
    try {
      await handleRecord(record);
    } catch (error: any) {
      console.error(error.stack || JSON.stringify(error));
    }
  }
};

interface ILatestSchedule {
  setAt: string;
  delay: number;
  uuid: string;
  mode: "home" | "away";
}
interface IUserAttributes {
  updateAt: string;
  refreshToken: string;
  latestSchedule: ILatestSchedule;
}

const MAX_ARM_ATTEMPTS = 6;
const ARM_POLL_INTERVAL_MS = 3000;

const handleRecord = async (record: SQSRecord) => {
  const userId = record.messageAttributes.userId.stringValue!;
  const uuid = record.messageAttributes.uuid.stringValue!;
  const alexaRequestId = record.body;
  console.debug(
    JSON.stringify({
      userId,
      uuid,
      alexaRequestId,
    })
  );

  let mode: MODE = record.messageAttributes.modeOverride?.stringValue as MODE;
  if (!mode) {
    const event = await getScheduledEvent(userId, uuid);
    if (!event) {
      return;
    }
    mode = event.mode;
  }
  
  await setRing(userId, mode);
};

const setLocationMode = async (ring: RingApi, locationId: string, mode: MODE): Promise<IBypassDevice[]> => {
  const t0 = Date.now();
  const response = await ring.restClient.request<ILocationModeResponse>({
    method: "POST",
    url: appApi(`mode/location/${locationId}`),
    json: { mode, supportBaseStation: true, noPin: true },
  });
  console.debug(`[timing] setLocationMode took ${Date.now() - t0}ms`);
  return response.bypassedDevices ?? [];
};

const setRing = async (userId: string, mode: MODE) => {
  const tRing0 = Date.now();
  const ring = await getRingClient(userId);
  console.debug(`[timing] getRingClient (handler path) took ${Date.now() - tRing0}ms`);
  console.debug("getting ring locations");
  const tLoc0 = Date.now();
  const locations = await ring.getLocations();
  console.debug(`[timing] getLocations (handler path) took ${Date.now() - tLoc0}ms`);
  console.debug("got ring locations");
  const locationId = locations[0].id;
  console.log(`setting ring to ${mode} mode`);
  if (!["disarmed", "home", "away"].includes(mode)) {
    const msg = `Unknown mode ${mode}`;
    console.error(msg);
    throw new Error(msg);
  }
  let latest_mode = "";
  let lastBypassedDevices: IBypassDevice[] = [];
  let lastErrorBody: IRingApiErrorBody | string | undefined = undefined;
  for (let i = 0; i < MAX_ARM_ATTEMPTS && latest_mode !== mode; i++) {
    if (i !== 0) {
      await new Promise((resolve) => setTimeout(resolve, ARM_POLL_INTERVAL_MS));
    }
    try {
      lastBypassedDevices = await setLocationMode(ring, locationId, mode);
      lastErrorBody = undefined;
    } catch (error: any) {
      lastErrorBody = error.response?.body ?? error.message;
      console.error(`setLocationMode failed: ${JSON.stringify(lastErrorBody)}`);
    } finally {
      latest_mode = await getLocationMode(ring, locationId);
    }
  }
  console.log(`new mode is ${latest_mode}`);
  if (mode === "away" && latest_mode !== mode) {
    const blockingDeviceNames = [...lastBypassedDevices, ...((typeof lastErrorBody === "object" && lastErrorBody?.extra) || [])].map(
      (d) => d.name
    );
    const reasonParts: string[] = [];
    if (blockingDeviceNames.length) {
      reasonParts.push(`Blocking device(s): ${blockingDeviceNames.join(", ")}.`);
    }
    if (typeof lastErrorBody === "object" && lastErrorBody?.msg) {
      reasonParts.push(`Ring's reason: ${lastErrorBody.msg}.`);
    } else if (lastErrorBody !== undefined) {
      reasonParts.push(`Ring's last error: ${JSON.stringify(lastErrorBody)}`);
    }
    const blockingDevices = reasonParts.length ? reasonParts.join(" ") : "Ring did not report a reason.";
    await sns.send(
      new PublishCommand({
        TopicArn: ARM_FAILURE_ALERT_TOPIC_ARN,
        Subject: "Ring Assistant: failed to arm Away mode",
        Message: `Failed to set Ring to away mode for user ${userId} after ${MAX_ARM_ATTEMPTS} attempts. Current mode is "${latest_mode}". ${blockingDevices}`,
      })
    );
  }
};

const getScheduledEvent = async (userId: string, uuid: string) => {
  const item = await ddb.getItem(DDB_TABLE_NAMES.EVENT, userId);
  if (!item?.value) {
    throw new Error(`Failed to load scheduled event - ${JSON.stringify(item)}`);
  }
  const value = item.value as IScheduledRingEvent;
  if (value.process === "processed" || value.process === "processing") {
    console.info(`ignoring '${value.process}' message`);
    return null;
  }
  if (value.uuid !== uuid) {
    console.info(`ignoring mismatched uuid: ${value.uuid} vs ${uuid}`);
    return null;
  }
  const expectedProcess = value.process;
  value.process = "processing";
  try {
    await ddb.putItem(DDB_TABLE_NAMES.EVENT, userId, value, {
      conditionExpression: "#value.#process = :expectedProcess",
      expressionAttributeNames: { "#value": "value", "#process": "process" },
      expressionAttributeValues: { ":expectedProcess": expectedProcess },
    });
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      console.info(`lost race claiming scheduled event for ${userId}, skipping`);
      return null;
    }
    throw error;
  }
  return value;
};
