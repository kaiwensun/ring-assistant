#!/usr/bin/env python3

import getpass
import uuid

from facade.ring import RingClient, EmailAuth
from facade.ddb import DdbFacade
from datetime import datetime, timezone


def main():
    ddb = DdbFacade()
    app_user_id = get_app_user_id(ddb)
    email = input("Enter your email: ")
    password = getpass.getpass("Enter your password: ")
    utc_now = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    ring = RingClient(
        app_user_id,
        email_auth=EmailAuth(email, password, str(uuid.uuid4()), two_fa_provider),
        token_updator=ddb.update_token
    )
    ring.refresh_auth_as_needed()


def get_app_user_id(ddb: DdbFacade) -> str:
    app_user_id = input(
        "Enter your Alexa account id (or hit enter to choose from existing ids): ")
    if app_user_id:
        return app_user_id
    app_user_ids = ddb.list_app_user_id()
    if not app_user_ids:
        raise Exception(
            "No existing Alexa accounts found, please register one first.")
    if len(app_user_ids) == 1:
        app_user_id = app_user_ids[0]
        print(f"Using existing account: {app_user_id}")
        return app_user_id
    for i, app_user_id in enumerate(app_user_ids):
        print(f'[{i + 1}] {app_user_id}')
    index = input("Enter index of the Alexa account id: ")
    app_user_id = app_user_ids[int(index) - 1]
    return app_user_id


def two_fa_provider(hint: dict):
    two_fa_code = None
    while not two_fa_code:
        if hint.get('tsv_state') == 'sms':
            two_fa_code = input(
                f"Please enter the sign in code we sent to {hint['phone']}: ")
        elif hint.get('tsv_state') == 'totp':
            two_fa_code = input(
                f"Please enter the sign in code from your authenticator app ({hint['phone']}): ")
        else:
            two_fa_code = input(f"Please enter your 2FA code for {hint}: ")
    return two_fa_code


if __name__ == "__main__":
    main()
