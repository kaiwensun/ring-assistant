from dataclasses import dataclass
from typing import Callable, Literal
from datetime import datetime
from pydantic import BaseModel, Field


@dataclass
class EmailAuth:
    email: str
    password: str
    hardware_id: str
    two_fa_provider: Callable[[dict], str]


@dataclass
class TokenAuth:
    access_token: str
    expires_at: int
    refresh_token: str
    scope: str
    token_type: str
    hardware_id: str


class Address(BaseModel):
    address1: str
    address2: str
    city: str
    country: str
    cross_street: str
    state: str
    timezone: str
    zip_code: str


class GeoCoordinates(BaseModel):
    latitude: float
    longitude: float


class UserLocation(BaseModel):
    name: str
    owner_id: int
    address: Address
    created_at: datetime
    geo_coordinates: GeoCoordinates
    is_jobsite: bool
    is_owner: bool
    location_id: str
    location_type: str
    updated_at: datetime


class DeviceInMode(BaseModel):
    deviceId: str
    deviceIdType: str


class LocationMode(BaseModel):
    mode: Literal["disarmed", "home", "away"]
    lastUpdateTimeMS: int
    notYetParticipatingInMode: list[DeviceInMode]


class BaseStation(BaseModel):
    id: int
    kind: str               # base_station_v1
    description: str        # 'Alarm Base Station'
    location_id: str
    schema_id: str
    device_id: str
    latitude: float
    longitude: float
    owned: bool
    stolen: bool
    shared_at: datetime


class Asset(BaseModel):
    uuid: str
    doorbot_id: int = Field(..., alias='doorbotId')
    kind: str
    status: str
    broker_host: str = Field(..., alias='brokerHost')
    on_battery: bool = Field(..., alias='onBattery')


class Connection(BaseModel):
    host: str
    ticket: str
    subscription_topics: list[str] = Field(..., alias='subscriptionTopics')
    assets: list[Asset]


# @dataclass
# class Profile:
#     id: str
#     email: str
#     first_name: str
#     last_name: str
#     first_name_extra: str
#     last_name_extra: str
#     phone_number: str
#     authentication_token: str
#     hardware_id: str
#     country: str
#     status: str
#     created_at: str
#     tfa_enabled: bool
#     tfa_phone_number: str
#     account_type: str
#     cfes_enrolled: bool
#     tsv_state: str
#         'settings': {
#             'targeted_advertising': True
#         },
#         'preferences': {}
#     }


# @dataclass
# class Session:
#     profile: Profile
