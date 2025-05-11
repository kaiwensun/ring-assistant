import logging
import os
import uuid
import requests
import time


from typing import Callable
from model import EmailAuth, TokenAuth

logger = logging.getLogger(__name__)


class TwoFactorAuthRequiredException(Exception):
    def __init__(self, hint: dict):
        self.hint = hint


class Ring():
    OAUTH_URL = "https://oauth.ring.com/oauth/token"

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
        self.refresh_auth()

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

    def refresh_auth(self) -> None:
        expiration_buffer = 10
        if self._grant_type == "refresh_token" and self._token_auth.expires_at > int(time.time()) + 60 * expiration_buffer:
            print(self._token_auth.expires_at, int(time.time()) - 60 * expiration_buffer)
            return
        grant_data = self.get_grant_data()
        json_payload = {
            "client_id": "ring_official_android",
            "scope": "client",
            **grant_data
        }

        session_id = self._email_auth.session_id if self._grant_type == "password" else self._token_auth.session_id
        headers = {
            "2fa-support": "true",
            "hardware_id": session_id,
            "User-Agent": "android:com.ringapp"
        }
        breakpoint()
        for i in range(2):
            try:
                response = self._request_with_retry(
                    url=self.OAUTH_URL,
                    json_data=json_payload,
                    headers=headers
                )
                auth_response = dict(response.json())
                
                expires_at = int(time.time()) + auth_response['expires_in']
                auth_response['expires_at'] = expires_at
                del auth_response['expires_in']

                self._token_auth = TokenAuth(**auth_response, session_id=session_id)

                self._grant_type = "refresh_token"
                if self._token_updator:
                    self._token_updator(self.app_user_id, self._token_auth)
                return
            except TwoFactorAuthRequiredException as e:
                if self._grant_type != "password" or i != 0:
                    raise e
                two_factor_auth_code = self._email_auth.two_fa_provider(e.hint)
                headers["2fa-code"] = two_factor_auth_code

    def _request_with_retry(self, url: str, json_data: dict, headers: dict, method: str = 'POST', retries: int = 3, delay: float = 1.0) -> requests.Response:
        for attempt in range(1, retries + 1):
            try:
                breakpoint()
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
                    pass
                else:
                    raise
            except requests.RequestException as e:
                if attempt == retries:
                    raise e
                logger.warning(
                    f"Request failed({attempt=}. Retry in {delay} seconds.", e.response.text, e)
