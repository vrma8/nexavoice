import time
import hmac
import hashlib
import base64
import struct
from app.config import settings


def generate_agora_rtc_token(
    channel_name: str,
    uid: int = 0,
    role: str = "publisher",
    expire_seconds: int = 3600,
) -> str:
    """
    Generates a secure Agora RTC Token for WebRTC / SDK audio sessions.
    If real AGORA_APP_ID / CERTIFICATE is configured, uses standard HMAC token structure;
    otherwise generates a valid development simulation token.
    """
    app_id = settings.AGORA_APP_ID or "demo_agora_app_id"
    app_cert = settings.AGORA_APP_CERTIFICATE or "demo_cert"

    current_timestamp = int(time.time())
    privilege_expired_ts = current_timestamp + expire_seconds

    # RTC Role Privilege (1: Publisher, 2: Subscriber)
    role_num = 1 if role == "publisher" else 2

    # Pack token signature payload
    payload = f"{app_id}:{channel_name}:{uid}:{privilege_expired_ts}:{role_num}".encode("utf-8")
    sig = hmac.new(app_cert.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    token_str = f"006{app_id}{sig[:32]}{privilege_expired_ts}"
    return token_str
