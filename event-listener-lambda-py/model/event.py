import json


class Event():
    def __init__(self, data: str):
        for attr in ['userId', 'uuid']:
            setattr(self, f"_{attr}", data['messageAttributes'][attr]['stringValue'])

    @property
    def user_id(self):
        return self._userId

    @property
    def uuid(self):
        return self._uuid
