import json
import os
import logging
import boto3

from model import Event
from facade import DdbFacade, Ring

logger = logging.getLogger(__name__)
LOCAL_TEST = not os.environ.get("AWS_LAMBDA_FUNCTION_NAME")

def lambda_handler(msg, context):
    event = Event(msg['Records'][0])
    logger.info(event)
    logger.info(context)
    ddb_facade = DdbFacade()
    if not LOCAL_TEST:
        ddb_facade.acknowledge_event(event)
    token = ddb_facade.get_token(event.user_id)
    ring = Ring(event.user_id, token_auth=token,
                token_updator=ddb_facade.update_token)
    if not LOCAL_TEST:
        ddb_facade.complete_event(event)

    return {
        "statusCode": 200,
        "message": "Receipt processed successfully"
    }

if __name__ == "__main__":
    with open('test.json') as f:
        lambda_handler(json.load(f), None)