import datetime
import uuid
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.database.connection import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    phone = Column(String(32), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class HumanAgent(Base):
    __tablename__ = "human_agents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    status = Column(String(32), default="AVAILABLE")  # AVAILABLE, BUSY, OFFLINE
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Call(Base):
    __tablename__ = "calls"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    caller_number = Column(String(32), index=True, nullable=False)
    telephony_call_id = Column(String(128), index=True, nullable=True)
    agora_channel = Column(String(128), nullable=False)
    status = Column(String(32), default="IN_PROGRESS")  # IN_PROGRESS, AI_HANDLING, WAITING_FOR_HUMAN, HUMAN_IN_CALL, COMPLETED, FAILED
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    conversations = relationship("Conversation", back_populates="call", cascade="all, delete-orphan")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    call_id = Column(String(36), ForeignKey("calls.id"), nullable=False)
    language = Column(String(32), default="hinglish")  # hindi, english, hinglish
    intent = Column(String(64), nullable=True)
    confidence = Column(Float, default=1.0)
    summary = Column(Text, nullable=True)
    collected_entities = Column(JSON, default=dict)
    missing_entities = Column(JSON, default=list)
    confirmed_entities = Column(JSON, default=list)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    call = relationship("Call", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    cases = relationship("Case", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    speaker = Column(String(32), nullable=False)  # CALLER, AI, HUMAN
    language = Column(String(32), default="hinglish")
    transcript = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class Case(Base):
    __tablename__ = "cases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    category = Column(String(64), default="general_assistance")
    priority = Column(String(32), default="MEDIUM")  # LOW, MEDIUM, HIGH, URGENT
    status = Column(String(32), default="OPEN")  # OPEN, AI_HANDLING, WAITING_FOR_HUMAN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED
    summary = Column(Text, nullable=True)
    confidence = Column(Float, default=1.0)
    escalation_reason = Column(String(128), nullable=True)  # low_confidence, explicit_request, repeated_correction, safety_medical, safety_legal, safety_financial, background_noise
    assigned_agent_id = Column(String(36), ForeignKey("human_agents.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    conversation = relationship("Conversation", back_populates="cases")
    assigned_agent = relationship("HumanAgent")
    details = relationship("CaseDetail", back_populates="case", cascade="all, delete-orphan")


class CaseDetail(Base):
    __tablename__ = "case_details"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_id = Column(String(36), ForeignKey("cases.id"), nullable=False)
    field_name = Column(String(64), nullable=False)
    field_value = Column(String(255), nullable=False)
    confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="details")


class MockApplication(Base):
    __tablename__ = "mock_applications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    reference_id = Column(String(64), unique=True, index=True, nullable=False)
    applicant_name = Column(String(255), nullable=False)
    phone = Column(String(32), nullable=True)
    service_type = Column(String(128), nullable=False)
    status = Column(String(64), nullable=False)  # pending_verification, in_review, approved, rejected, processing, dispatched
    last_updated = Column(String(64), nullable=False)
    remarks = Column(Text, nullable=True)
