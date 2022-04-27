import { RingApi } from "ring-client-api";
import { Context, SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import * as ddb from "./ddb";
import { DDB_TABLE_NAMES, MODE, IRingToken, IScheduledRingEvent } from "./ddb";

interface UserCacheProps {
  client?: RingApi;
}

const USER_CACHE: {
  [key: string]: UserCacheProps;
} = {};

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

export const handler: SQSHandler = async (
  event: SQSEvent,
  context: Context
) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    console.log("Event: ", JSON.stringify(event, null, 2));
    for (const record of event.Records) {
      await handleRecord(record);
    }
  } catch (error: any) {
    console.error(error.stack || JSON.stringify(error));
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

const MODES_MAP: { [key: string]: MODE } = {
  all: "away",
  some: "home",
  none: "disarmed",
};

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

  const event = await getScheduledEvent(userId, uuid);
  if (!event) {
    return;
  }
  await setRing(userId, event.mode);
};

const setRing = async (userId: string, mode: MODE) => {
  const ring = await getRingClient(userId);
  console.debug("getting ring locations");
  const locations = await ring.getLocations();
  console.debug("got ring locations");
  const location = locations[0];
  console.log(`setting ring to ${mode} mode`);
  if (mode !== "home" && mode !== "away") {
    const msg = `Unknown mode ${mode}`;
    console.error(msg);
    throw new Error(msg);
  }
  let latest_mode = "";
  for (let i = 0; i < 6 && latest_mode !== mode; i++) {
    if (i !== 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 5));
    }
    try {
      if (mode === "home") {
        await location.armHome();
      } else {
        await location.armAway();
      }
    } catch (error: any) {
      console.error(error);
      const latest_raw_mode = await location.getAlarmMode();
      latest_mode = MODES_MAP[latest_raw_mode];
    }
  }
  console.log(`ring is set to ${mode} mode`);
  const newMode = await location.getAlarmMode();
  console.log(`new mode is ${newMode}`);
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
  value.process = "processing";
  await ddb.putItem(DDB_TABLE_NAMES.EVENT, userId, value);
  return value;
};
