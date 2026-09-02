from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import uuid


class TelephonyProvider(ABC):
    @abstractmethod
    async def handle_inbound_call(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def transfer_to_sip(self, call_sid: str, sip_uri: str) -> bool:
        pass

    @abstractmethod
    async def hangup_call(self, call_sid: str) -> bool:
        pass


class SimulatorTelephonyProvider(TelephonyProvider):
    """
    Built-in telephony simulator for local hackathon demo and testing.
    """

    async def handle_inbound_call(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        caller = payload.get("From") or payload.get("caller_number") or "+919876543210"
        call_id = payload.get("CallSid") or f"sim_call_{uuid.uuid4().hex[:8]}"
        channel_name = f"channel_{call_id}"

        return {
            "status": "connected",
            "telephony_call_id": call_id,
            "caller_number": caller,
            "agora_channel": channel_name,
        }

    async def transfer_to_sip(self, call_sid: str, sip_uri: str) -> bool:
        return True

    async def hangup_call(self, call_sid: str) -> bool:
        return True


class ExotelTelephonyProvider(TelephonyProvider):
    """
    Exotel India PSTN Provider Integration.
    """

    async def handle_inbound_call(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        caller = payload.get("From", "+919876543210")
        call_sid = payload.get("CallSid", f"exo_{uuid.uuid4().hex[:8]}")
        channel_name = f"agora_{call_sid}"

        return {
            "status": "connected",
            "telephony_call_id": call_sid,
            "caller_number": caller,
            "agora_channel": channel_name,
        }

    async def transfer_to_sip(self, call_sid: str, sip_uri: str) -> bool:
        return True

    async def hangup_call(self, call_sid: str) -> bool:
        return True


class TwilioTelephonyProvider(TelephonyProvider):
    """
    Twilio Telephony & SIP Trunk Provider.
    """

    async def handle_inbound_call(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        caller = payload.get("From", "+919876543210")
        call_sid = payload.get("CallSid", f"twi_{uuid.uuid4().hex[:8]}")
        channel_name = f"agora_{call_sid}"

        return {
            "status": "connected",
            "telephony_call_id": call_sid,
            "caller_number": caller,
            "agora_channel": channel_name,
        }

    async def transfer_to_sip(self, call_sid: str, sip_uri: str) -> bool:
        return True

    async def hangup_call(self, call_sid: str) -> bool:
        return True


def get_telephony_provider(name: str = "simulator") -> TelephonyProvider:
    provider_key = name.lower().strip()
    if provider_key == "exotel":
        return ExotelTelephonyProvider()
    elif provider_key == "twilio":
        return TwilioTelephonyProvider()
    return SimulatorTelephonyProvider()
