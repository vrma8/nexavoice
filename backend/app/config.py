import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "NexaVoice - Multilingual Assistance-Line Agent"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./nexavoice.db"

    # Agora
    AGORA_APP_ID: str = "demo_agora_app_id"
    AGORA_APP_CERTIFICATE: Optional[str] = "demo_agora_app_certificate"

    # AI Model Providers
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None

    # Telephony Provider (exotel, twilio, plivo, sip, simulator)
    TELEPHONY_PROVIDER: str = "simulator"
    TELEPHONY_API_KEY: Optional[str] = None
    TELEPHONY_API_SECRET: Optional[str] = None
    TELEPHONY_PHONE_NUMBER: str = "+918000000000"

    # Confidence Thresholds
    CONFIDENCE_HIGH_THRESHOLD: float = 0.80
    CONFIDENCE_MEDIUM_THRESHOLD: float = 0.55

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="allow")


settings = Settings()
