import { DynamoDBDocumentClient, GetCommand, PutCommand, } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
export var DDB_TABLE_NAMES;
(function (DDB_TABLE_NAMES) {
    DDB_TABLE_NAMES["EVENT"] = "RingAssistantEvent";
    DDB_TABLE_NAMES["TOKEN_FOR_ALEXA"] = "RingAssistantRefreshTokenForAlexa";
    DDB_TABLE_NAMES["TOKEN_FOR_LISTENER"] = "RingAssistantRefreshTokenForListener";
})(DDB_TABLE_NAMES || (DDB_TABLE_NAMES = {}));
export async function getItem(table, id) {
    const params = {
        TableName: table,
        Key: {
            id,
        },
    };
    try {
        const data = await ddb.send(new GetCommand(params));
        console.log(`getItem ${id}: ${JSON.stringify(data.Item)}`);
        return data.Item;
    }
    catch (err) {
        console.error(err);
        throw err;
    }
}
export async function putItem(table, id, value) {
    const item = { id, value, updateAt: new Date().toISOString() };
    const params = {
        TableName: table,
        Item: item,
    };
    try {
        const data = await ddb.send(new PutCommand(params), (err, data) => {
            console.debug(`err: ${err?.stack || JSON.stringify(err)}`);
            console.debug(`data: ${JSON.stringify(data)}`);
        });
        console.log(`putItem: ${JSON.stringify(item)}`);
    }
    catch (err) {
        console.error(err);
        throw err;
    }
}
