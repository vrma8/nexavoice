from typing import Dict, Any, Optional
import datetime


class AgoraVoiceAgentSession:
    """
    Manages live Agora Voice Agent runtime sessions, human join states, and audio mute flags.
    """

    def __init__(self, channel_name: str, call_id: str):
        self.channel_name = channel_name
        self.call_id = call_id
        self.ai_active: bool = True
        self.ai_muted: bool = False
        self.human_joined: bool = False
        self.human_agent_id: Optional[str] = None
        self.created_at = datetime.datetime.utcnow()

    def mute_ai(self):
        self.ai_muted = True
        self.ai_active = False

    def unmute_ai(self):
        self.ai_muted = False
        self.ai_active = True

    def human_join(self, agent_id: str):
        self.human_joined = True
        self.human_agent_id = agent_id
        # When human joins, AI stops speaking / mutes automatically (Section 25)
        self.mute_ai()

    def human_leave(self):
        self.human_joined = False
        self.human_agent_id = None


class AgoraSessionManager:
    def __init__(self):
        self.sessions: Dict[str, AgoraVoiceAgentSession] = {}

    def get_or_create(self, channel_name: str, call_id: str) -> AgoraVoiceAgentSession:
        if channel_name not in self.sessions:
            self.sessions[channel_name] = AgoraVoiceAgentSession(channel_name, call_id)
        return self.sessions[channel_name]

    def get_by_channel(self, channel_name: str) -> Optional[AgoraVoiceAgentSession]:
        return self.sessions.get(channel_name)


agora_session_manager = AgoraSessionManager()
