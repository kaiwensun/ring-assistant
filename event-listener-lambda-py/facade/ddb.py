import boto3

from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from model import Event, TokenAuth
from typing import Literal
from datetime import datetime, timezone
from dataclasses import asdict


class DdbFacade():

    EVENT_TABLE_NAME = "RingAssistantEvent"
    TOKEN_TABLE_NAME = "RingAssistantRefreshTokenForListener"

    def __init__(self):
        self.client = boto3.client('dynamodb')
        self._deserializer = TypeDeserializer()
        self._serializer = TypeSerializer()

    def _update_event(self, device_id: str, event_uuid: str, old_value: Literal["scheduled", "processing"], new_value: Literal["processing", "processed"]):
        utc_now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        self.client.update_item(
            TableName=self.EVENT_TABLE_NAME,
            Key={
                'id': {'S': device_id}
            },
            UpdateExpression='SET #v.#p = :new_value, #u = :now',
            ConditionExpression='#v.#p = :old_value AND #v.#uuid = :event_uuid',
            ExpressionAttributeNames={
                '#v': 'value',
                '#p': 'process',
                '#uuid': 'uuid',
                '#u': 'updateAt',
            },
            ExpressionAttributeValues={
                ':new_value': {'S': new_value},
                ':old_value': {'S': old_value},
                ':event_uuid': {'S': event_uuid},
                ':now': {'S': utc_now},
            },
            ReturnValues='ALL_NEW'
        )

    def acknowledge_event(self, event: Event):
        self._update_event(event.user_id, event.uuid,
                           "scheduled", "processing")

    def complete_event(self, event: Event):
        self._update_event(event.user_id, event.uuid,
                           "processing", "processed")

    def list_app_user_id(self):
        response = self.client.scan(
            TableName=self.TOKEN_TABLE_NAME,
            ProjectionExpression='id'
        )
        ids = [item['id']['S'] for item in response.get('Items', [])]
        while 'LastEvaluatedKey' in response:
            response = self.client.scan(
                TableName=self.TOKEN_TABLE_NAME,
                ProjectionExpression='id',
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            ids.extend(item['id']['S'] for item in response.get('Items', []))
        return ids

    def update_token(self, app_user_id: str, token: TokenAuth):
        print(token)
        utc_now = datetime.now(timezone.utc).strftime(
            '%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        item = {
            "id": app_user_id,
            "update_at": utc_now,
            "value": asdict(token)
        }
        self.client.put_item(TableName=self.TOKEN_TABLE_NAME, Item={
            k: self._serializer.serialize(v) for k, v in item.items()
        })

    def get_token(self, app_user_id: str) -> TokenAuth:
        response = self.client.get_item(
            TableName=self.TOKEN_TABLE_NAME,
            Key={
                'id': {'S': app_user_id}
            }
        )
        item = {k: self._deserializer.deserialize(v) for k, v in response['Item'].items()}
        return TokenAuth(**item["value"])
