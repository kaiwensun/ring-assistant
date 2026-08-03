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
  try {
    const data = await ddb.send(new GetCommand(params));
    const item = data.Item as IItem | undefined;
    console.log(`getItem ${id}: ${item ? JSON.stringify(forLogging(item)) : "undefined"}`);
    return item;
  } catch (err: any) {
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
  try {
    await ddb.send(new PutCommand(params));
    console.log(`putItem: ${JSON.stringify(forLogging(item))}`);
  } catch (err: any) {
    console.error(err);
    throw err;
  }
}
