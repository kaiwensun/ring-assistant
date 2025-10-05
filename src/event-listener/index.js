import { RingApi } from "ring-client-api";
import * as ddb from "./ddb.js";
import { DDB_TABLE_NAMES } from "./ddb.js";
const USER_CACHE = {};
async function getRingTokenFromDB(userId) {
    const item = await ddb.getItem(DDB_TABLE_NAMES.TOKEN_FOR_LISTENER, userId);
    const token = item?.value?.token;
    if (token && /^[0-9]{4}$/.test(token)) {
        return undefined;
    }
    return token;
}
const genRingClient = async (userId) => {
    const refreshToken = await getRingTokenFromDB(userId);
    if (!refreshToken) {
        const msg = "Failed to fetch refresh token!";
        throw new Error(msg);
    }
    const controlCenterDisplayName = "Ring Assistant Alexa Skill Listener";
    const client = new RingApi({ refreshToken, controlCenterDisplayName });
    client.onRefreshTokenUpdated.subscribe(async ({ newRefreshToken /* , oldRefreshToken */ }) => {
        const value = { token: newRefreshToken };
        await ddb.putItem(DDB_TABLE_NAMES.TOKEN_FOR_LISTENER, userId, value);
    });
    console.debug("generated new ring client");
    return client;
};
const getRingClient = async (userId) => {
    USER_CACHE[userId] ||= {};
    if (!USER_CACHE[userId].client) {
        USER_CACHE[userId].client = await genRingClient(userId);
    }
    return USER_CACHE[userId].client;
};
export const handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    try {
        console.log("Event: ", JSON.stringify(event, null, 2));
        for (const record of event.Records) {
            await handleRecord(record);
        }
    }
    catch (error) {
        console.error(error.stack || JSON.stringify(error));
    }
};
const MODES_MAP = {
    all: "away",
    some: "home",
    none: "disarmed",
};
const handleRecord = async (record) => {
    const userId = record.messageAttributes.userId.stringValue;
    const uuid = record.messageAttributes.uuid.stringValue;
    const alexaRequestId = record.body;
    console.debug(JSON.stringify({
        userId,
        uuid,
        alexaRequestId,
    }));
    let mode = record.messageAttributes.modeOverride?.stringValue;
    if (!mode) {
        const event = await getScheduledEvent(userId, uuid);
        if (!event) {
            return;
        }
        mode = event.mode;
    }
    await setRing(userId, mode);
};
const setRing = async (userId, mode) => {
    const ring = await getRingClient(userId);
    console.debug("getting ring locations");
    const locations = await ring.getLocations();
    console.debug("got ring locations");
    const location = locations[0];
    console.log(`setting ring to ${mode} mode`);
    if (!["disarmed", "home", "away"].includes(mode)) {
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
            if (mode === "disarmed") {
                await location.disarm();
            }
            else if (mode === "home") {
                await location.armHome();
            }
            else if (mode === "away") {
                await location.armAway();
            }
        }
        catch (error) {
            console.error(error);
        }
        finally {
            const latest_raw_mode = await location.getAlarmMode();
            latest_mode = MODES_MAP[latest_raw_mode];
        }
    }
    console.log(`new mode is ${latest_mode}`);
};
const getScheduledEvent = async (userId, uuid) => {
    const item = await ddb.getItem(DDB_TABLE_NAMES.EVENT, userId);
    if (!item?.value) {
        throw new Error(`Failed to load scheduled event - ${JSON.stringify(item)}`);
    }
    const value = item.value;
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
