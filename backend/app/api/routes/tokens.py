from fastapi import APIRouter
from app.schemas import AgoraTokenRequest, AgoraTokenResponse
from app.agora.tokens import generate_agora_rtc_token
from app.config import settings

router = APIRouter(prefix="/agora", tags=["Agora"])


@router.post("/token", response_model=AgoraTokenResponse)
async def get_agora_token(request: AgoraTokenRequest):
    """
    Generate an RTC token for a client or human agent to join a voice channel.
    """
    token = generate_agora_rtc_token(
        channel_name=request.channel_name,
        uid=request.uid,
        role=request.role,
    )
    return AgoraTokenResponse(
        token=token,
        channel_name=request.channel_name,
        uid=request.uid,
        app_id=settings.AGORA_APP_ID,
        expires_in=3600,
    )
