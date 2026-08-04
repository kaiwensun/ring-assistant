import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  PutCommand,
  PutCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";


const ddbClient = new DynamoDBClient({});

const ddb = DynamoDBDocumentClient.from(ddbClient);

export enum DDB_TABLE_NAMES {
  EVENT = "RingAssistantEvent",
  TOKEN_FOR_LISTENER = "RingAssistantRefreshTokenForListener",
}

type TTableName =
  | DDB_TABLE_NAMES.EVENT
  | DDB_TABLE_NAMES.TOKEN_FOR_LISTENER;

export type MODE = "disarmed" | "home" | "away";

export interface IScheduledRingEvent {
  readonly uuid: string;
  readonly mode: MODE;
  readonly delay: number;
  readonly process: "scheduled" | "processing" | "processed";
}

export interface IRingToken {
  readonly token: string;
}

type IValue = IScheduledRingEvent | IRingToken;

export interface IItem {
  id: string;
  value: IValue;
  updateAt: string;
}

function isRingToken(value: IValue): value is IRingToken {
  return typeof (value as IRingToken).token === "string";
}

function maskToken(token: string): string {
  if (token.length <= 10) {
    return "***";
  }
  return `${token.slice(0, 5)}...${token.slice(-5)}`;
}

function forLogging(item: IItem): IItem {
  if (!isRingToken(item.value)) {
    return item;
  }
  return { ...item, value: { token: maskToken(item.value.token) } };
}

export async function getItem(table: TTableName, id: string): Promise<IItem | undefined> {
  const params: GetCommandInput = {
    TableName: table,
    Key: {
      id,
    },
  };
  const t0 = Date.now();
  try {
    const data = await ddb.send(new GetCommand(params));
    console.debug(`[timing] ddb.getItem took ${Date.now() - t0}ms`);
    const item = data.Item as IItem | undefined;
    console.log(`getItem ${id}: ${item ? JSON.stringify(forLogging(item)) : "undefined"}`);
    return item;
  } catch (err: any) {
    console.debug(`[timing] ddb.getItem FAILED after ${Date.now() - t0}ms`);
    console.error(err);
    throw err;
  }
}

export async function putItem(table: TTableName, id: string, value: IValue) {
  const item: IItem = { id, value, updateAt: new Date().toISOString() };
  const params: PutCommandInput = {
    TableName: table,
    Item: item,
  };
  const t0 = Date.now();
  try {
    await ddb.send(new PutCommand(params));
    console.debug(`[timing] ddb.putItem took ${Date.now() - t0}ms`);
    console.log(`putItem: ${JSON.stringify(forLogging(item))}`);
  } catch (err: any) {
    console.debug(`[timing] ddb.putItem FAILED after ${Date.now() - t0}ms`);
    console.error(err);
    throw err;
  }
}
