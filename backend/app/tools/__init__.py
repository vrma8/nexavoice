from typing import Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import MockApplication, User, Case, CaseDetail


async def check_application_status(db: AsyncSession, reference_id: str) -> Dict[str, Any]:
    """
    Look up public service or application status by reference ID.
    """
    clean_ref = reference_id.strip()
    result = await db.execute(select(MockApplication).where(MockApplication.reference_id == clean_ref))
    app = result.scalars().first()

    if not app:
        return {
            "found": False,
            "reference_id": clean_ref,
            "message": f"No application found with reference ID {clean_ref}.",
        }

    return {
        "found": True,
        "reference_id": app.reference_id,
        "applicant_name": app.applicant_name,
        "service_type": app.service_type,
        "status": app.status,
        "last_updated": app.last_updated,
        "remarks": app.remarks,
    }


async def get_customer(db: AsyncSession, phone: str) -> Optional[Dict[str, Any]]:
    """
    Look up registered customer profile by phone number.
    """
    clean_phone = phone.strip()
    result = await db.execute(select(User).where(User.phone == clean_phone))
    user = result.scalars().first()

    if not user:
        return None

    return {
        "id": user.id,
        "name": user.name,
        "phone": user.phone,
    }


async def create_ticket(
    db: AsyncSession,
    conversation_id: str,
    category: str,
    summary: str,
    priority: str = "MEDIUM",
    confidence: float = 1.0,
    escalation_reason: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Case:
    """
    Create a case ticket record in the database.
    """
    case = Case(
        conversation_id=conversation_id,
        category=category,
        priority=priority,
        status="OPEN" if not escalation_reason else "WAITING_FOR_HUMAN",
        summary=summary,
        confidence=confidence,
        escalation_reason=escalation_reason,
    )
    db.add(case)
    await db.flush()

    if details:
        for k, v in details.items():
            cd = CaseDetail(
                case_id=case.id,
                field_name=k,
                field_value=str(v),
                confirmed=True,
            )
            db.add(cd)

    await db.commit()
    await db.refresh(case)
    return case
