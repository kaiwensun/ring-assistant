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
  process: "scheduled" | "processing" | "processed";
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

export async function getItem(table: TTableName, id: string): Promise<IItem | undefined> {
  const params: GetCommandInput = {
    TableName: table,
    Key: {
      id,
    },
  };
  try {
    const data = await ddb.send(new GetCommand(params));
    console.log(`getItem ${id}: ${JSON.stringify(data.Item)}`);
    return data.Item as IItem;
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
    const data = await ddb.send(new PutCommand(params), (err, data) => {
      console.debug(`err: ${err?.stack || JSON.stringify(err)}`);
      console.debug(`data: ${JSON.stringify(data)}`);
    });
    console.log(`putItem: ${JSON.stringify(item)}`);
  } catch (err: any) {
    console.error(err);
    throw err;
  }
}
