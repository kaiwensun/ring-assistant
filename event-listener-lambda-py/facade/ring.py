import logging
import requests
import time


from typing import Callable, Literal
from model.ring import EmailAuth, TokenAuth, UserLocation, LocationMode, BaseStation

logger = logging.getLogger(__name__)


class TwoFactorAuthRequiredException(Exception):
    def __init__(self, hint: dict):
        self.hint = hint


class RingClient():
    API_VERSION = 11
    OAUTH_URL = "https://oauth.ring.com/oauth/token"
    CLIENT_API_BASE_URL = 'https://api.ring.com/clients_api/'
    DEVICE_API_BASE_URL = 'https://api.ring.com/devices/v1/'
    APP_API_BASE_URL = 'https://prd-api-us.prd.rings.solutions/api/v1/'
    # APP_API_BASE_URL = 'https://account.ring.com/api/api/v1/'

    def __init__(
            self,
            app_user_id: str,
            *,
            email_auth: EmailAuth = None,
            token_auth: TokenAuth = None,
            token_updator: Callable[[str, TokenAuth], None] = None):
        self.http_client = RingHttpClient(
            app_user_id=app_user_id,
            email_auth=email_auth,
            token_auth=token_auth,
            token_updator=token_updator
        )
        # self.refresh_auth_as_needed()

    def get_locations(self) -> list[UserLocation]:
        resp = self.http_client.request_with_auth(self.http_client.device_url("locations"))
        return [UserLocation.model_validate(loc) for loc in resp.json()['user_locations']]

    def get_location_mode(self, location_id: str) -> LocationMode:
        resp = self.http_client.request_with_auth(
            self.http_client.app_url(f"mode/location/{location_id}"))
        return LocationMode.model_validate(resp.json())

    def set_location_mode(self, location_id: str, mode: Literal["disarmed", "home", "away"]) -> None:
        resp = self.http_client.request_with_auth(
            self.http_client.app_url(f"mode/location/{location_id}"),
            method="POST",
            json_data={"mode": mode}
        )
        return resp.json()

    def get_devices(self):
        resp = self.http_client.request_with_auth(
            self.http_client.device_url("devices"))
        return resp.json()

    def get_base_stations(self) -> list[BaseStation]:
        resp = self.http_client.request_with_auth(
            self.http_client.client_url('ring_devices'))
        return [BaseStation.model_validate(bs) for bs in resp.json()['base_stations']]


class RingHttpClient():

    API_VERSION = 11
    OAUTH_URL = "https://oauth.ring.com/oauth/token"
    CLIENT_API_BASE_URL = 'https://api.ring.com/clients_api/'
    DEVICE_API_BASE_URL = 'https://api.ring.com/devices/v1/'
    APP_API_BASE_URL = 'https://prd-api-us.prd.rings.solutions/api/v1/'
    # APP_API_BASE_URL = 'https://account.ring.com/api/api/v1/'

    def __init__(
            self,
            app_user_id: str,
            *,
            email_auth: EmailAuth = None,
            token_auth: TokenAuth = None,
            token_updator: Callable[[str, TokenAuth], None] = None):
        self.app_user_id = app_user_id
        self._token_updator = token_updator
        self._email_auth = email_auth
        self._token_auth = token_auth
        self._grant_type = "password" if email_auth else "refresh_token"
        self.refresh_auth_as_needed()

    # Auth functions

    def get_grant_data(self):
        if self._grant_type == "refresh_token":
            logger.info(f"Refreshing token")
            return {
                "grant_type": self._grant_type,
                "refresh_token": self._token_auth.refresh_token
            }
        else:
            return {
                "grant_type": self._grant_type,
                "username": self._email_auth.email,
                "password": self._email_auth.password,
            }

    def refresh_auth_as_needed(self) -> None:
        expiration_buffer = 10
        if self._grant_type == "refresh_token" and self._token_auth.expires_at > int(time.time()) + 60 * expiration_buffer:
            return
        grant_data = self.get_grant_data()
        json_payload = {
            "client_id": "ring_official_android",
            "scope": "client",
            **grant_data
        }

        hardware_id = self._email_auth.hardware_id if self._grant_type == "password" else self._token_auth.hardware_id
        headers = {
            "2fa-support": "true",
            "hardware_id": hardware_id,
            "User-Agent": "android:com.ringapp"
        }
        for i in range(2):
            try:
                response = self._request_with_retry(
                    url=self.OAUTH_URL,
                    json_data=json_payload,
                    headers=headers,
                    method='POST'
                )
                auth_response = dict(response.json())

                expires_at = int(time.time()) + auth_response['expires_in']
                auth_response['expires_at'] = expires_at
                del auth_response['expires_in']

                self._token_auth = TokenAuth(
                    **auth_response, hardware_id=hardware_id)

                self._grant_type = "refresh_token"
                if self._token_updator:
                    self._token_updator(self.app_user_id, self._token_auth)
                return
            except TwoFactorAuthRequiredException as e:
                if self._grant_type != "password" or i != 0:
                    raise e
                two_factor_auth_code = self._email_auth.two_fa_provider(e.hint)
                headers["2fa-code"] = two_factor_auth_code

    def get_new_session(self, session_name: str):
        """
        session_name: Ring control center's display name
        """
        resp = self._request_with_retry(
            self.client_url('session'),
            json_data={
                "device": {
                    "hardware_id": self.hardware_id,
                    "os": "android",
                    "metadata": {
                        "api_version": self.API_VERSION,
                        "device_model": session_name
                    }
                }
            },
            headers={
                "Authorization": f"{self._token_auth.token_type} {self._token_auth.access_token}",
                "User-Agent": "android:com.ringapp"
            },
            method='POST'
        )
        return resp

    @property
    def hardware_id(self) -> str:
        return self._email_auth.hardware_id if self._grant_type == "password" else self._token_auth.hardware_id

        # Common functions
    def _request_with_retry(self, url: str, json_data: dict, headers: dict, method: str = 'GET', retries: int = 3, delay: float = 1.0) -> requests.Response:
        for attempt in range(1, retries + 1):
            try:
                response = requests.request(
                    method, url, json=json_data, headers=headers, timeout=10)
                response.raise_for_status()
                return response
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 412:
                    # {'next_time_in_secs': 60, 'phone': '+1xxxxxxxx12', 'tsv_state': 'sms'}
                    # {'next_time_in_secs': 60, 'phone': 'time-based OTP', 'tsv_state': 'totp'}
                    raise TwoFactorAuthRequiredException(e.response.json())
                if 500 <= e.response.status_code < 600 and attempt != retries:
                    time.sleep(delay)
                else:
                    logger.error(e.response.text)
                    raise
            except requests.RequestException as e:
                if attempt == retries:
                    raise e
                logger.warning(
                    f"Request failed({attempt=}. Retry in {delay} seconds.", e)
                time.sleep(delay)

    def device_url(self, path: str):
        return self.DEVICE_API_BASE_URL + path

    def client_url(self, path: str):
        return self.CLIENT_API_BASE_URL + path

    def app_url(self, path: str):
        return self.APP_API_BASE_URL + path

    def request_with_auth(self, url: str, json_data: dict = {}, headers: dict = {}, method: str = 'GET') -> requests.Response:
        # self.refresh_auth_as_needed()
        headers = {
            **headers,
            "authorization": f"{self._token_auth.token_type} {self._token_auth.access_token}",
            "hardware_id": self.hardware_id,
            "User-Agent": "android:com.ringapp"
        }
        return self._request_with_retry(url, json_data, headers, method)
