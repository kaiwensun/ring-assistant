import json
import os
import logging

from model import Event
from facade import DdbFacade, RingClient

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
    ring = RingClient(event.user_id, token_auth=token,
                token_updator=ddb_facade.update_token)
    locations = ring.get_locations()
    if len(locations) != 1:
        logger.error(f"Exactly one location is supported for now. Found: {locations}")
        return error(f"Found {len(locations)} locations")
    location = locations[0]
    ring.get_location_mode(location.location_id)

    base_stations = ring.get_base_stations()
    base_stations = [bs for bs in base_stations if bs.location_id == location.location_id]
    if len(base_stations) != 1:
        logger.error(f"Exactly one base station is supported for now. Found: {base_stations}")
        return error(f"Found {len(base_stations)} base stations")
    base_station = base_stations[0]
    print(base_station)
    # ring.set_location_mode(location.location_id, 'home')
    if not LOCAL_TEST:
        ddb_facade.complete_event(event)

    return {
        "statusCode": 200,
        "message": "Receipt processed successfully"
    }


def error(msg: str):
    return {
        "statusCode": 400,
        "message": msg
    }
def get_session_name():
    if LOCAL_TEST:
        return "local_test"
    return os.environ.get("AWS_LAMBDA_FUNCTION_NAME") + ":" + os.environ.get("AWS_LAMBDA_FUNCTION_VERSION")


if __name__ == "__main__":
    with open('test.json') as f:
        lambda_handler(json.load(f), None)
