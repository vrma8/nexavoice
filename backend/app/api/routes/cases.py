import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database.connection import get_db
from app.models import Case, CaseDetail, Conversation, HumanAgent
from app.schemas import CaseResponse, CaseCreate, CaseUpdate, CaseDetailSchema
from app.services.live_events import live_event_manager

router = APIRouter(prefix="/cases", tags=["Cases"])


@router.get("", response_model=List[CaseResponse])
async def list_cases(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List all cases and escalated tickets with optional filtering.
    """
    query = select(Case).order_by(Case.created_at.desc())
    if status:
        query = query.where(Case.status == status)
    if priority:
        query = query.where(Case.priority == priority)

    res = await db.execute(query)
    cases = res.scalars().all()

    response_list = []
    for c in cases:
        # Load details
        dtl_res = await db.execute(select(CaseDetail).where(CaseDetail.case_id == c.id))
        details = dtl_res.scalars().all()

        agent_name = None
        if c.assigned_agent_id:
            ag_res = await db.execute(select(HumanAgent).where(HumanAgent.id == c.assigned_agent_id))
            ag = ag_res.scalars().first()
            if ag:
                agent_name = ag.name

        response_list.append(
            CaseResponse(
                id=c.id,
                conversation_id=c.conversation_id,
                category=c.category,
                priority=c.priority,
                status=c.status,
                summary=c.summary,
                confidence=c.confidence,
                escalation_reason=c.escalation_reason,
                assigned_agent_id=c.assigned_agent_id,
                assigned_agent_name=agent_name,
                created_at=c.created_at,
                updated_at=c.updated_at,
                details=[
                    CaseDetailSchema(
                        field_name=d.field_name,
                        field_value=d.field_value,
                        confirmed=d.confirmed,
                    )
                    for d in details
                ],
            )
        )
    return response_list


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str, db: AsyncSession = Depends(get_db)):
    """
    Get detailed information for a specific support case.
    """
    res = await db.execute(select(Case).where(Case.id == case_id))
    c = res.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")

    dtl_res = await db.execute(select(CaseDetail).where(CaseDetail.case_id == c.id))
    details = dtl_res.scalars().all()

    agent_name = None
    if c.assigned_agent_id:
        ag_res = await db.execute(select(HumanAgent).where(HumanAgent.id == c.assigned_agent_id))
        ag = ag_res.scalars().first()
        if ag:
            agent_name = ag.name

    return CaseResponse(
        id=c.id,
        conversation_id=c.conversation_id,
        category=c.category,
        priority=c.priority,
        status=c.status,
        summary=c.summary,
        confidence=c.confidence,
        escalation_reason=c.escalation_reason,
        assigned_agent_id=c.assigned_agent_id,
        assigned_agent_name=agent_name,
        created_at=c.created_at,
        updated_at=c.updated_at,
        details=[
            CaseDetailSchema(
                field_name=d.field_name,
                field_value=d.field_value,
                confirmed=d.confirmed,
            )
            for d in details
        ],
    )


@router.patch("/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: str,
    update_data: CaseUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update status, priority, summary, or assigned agent for a case.
    """
    res = await db.execute(select(Case).where(Case.id == case_id))
    c = res.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")

    if update_data.status is not None:
        c.status = update_data.status
    if update_data.priority is not None:
        c.priority = update_data.priority
    if update_data.assigned_agent_id is not None:
        c.assigned_agent_id = update_data.assigned_agent_id
    if update_data.summary is not None:
        c.summary = update_data.summary

    c.updated_at = datetime.datetime.utcnow()
    await db.commit()
    await db.refresh(c)

    await live_event_manager.broadcast("CASE_UPDATED", {"case_id": c.id, "status": c.status})
    return await get_case(case_id, db)


@router.post("/{case_id}/accept", response_model=CaseResponse)
async def accept_case(
    case_id: str,
    agent_id: Optional[str] = "agent_human_1",
    db: AsyncSession = Depends(get_db),
):
    """
    Human agent accepts ownership of an escalated case.
    """
    res = await db.execute(select(Case).where(Case.id == case_id))
    c = res.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")

    c.status = "ASSIGNED"
    c.assigned_agent_id = agent_id
    c.updated_at = datetime.datetime.utcnow()
    await db.commit()

    await live_event_manager.broadcast("CASE_ACCEPTED", {
        "case_id": c.id,
        "agent_id": agent_id,
        "status": c.status,
    })

    return await get_case(case_id, db)
