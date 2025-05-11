from dataclasses import dataclass
from typing import Callable


@dataclass
class EmailAuth():
    email: str
    password: str
    session_id: str
    two_fa_provider: Callable[[dict], str]


@dataclass
class TokenAuth():
    access_token: str
    expires_at: int
    refresh_token: str
    scope: str
    token_type: str
    session_id: str
