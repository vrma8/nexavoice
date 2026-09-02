import asyncio
from sqlalchemy import select
from app.database.connection import AsyncSessionLocal, init_db
from app.models import User, HumanAgent, MockApplication, Call, Conversation, Message, Case, CaseDetail


async def seed_database():
    await init_db()

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        result = await session.execute(select(HumanAgent))
        if result.scalars().first() is not None:
            print("Database already has initial seed data.")
            return

        # 1. Human Support Agents
        agent1 = HumanAgent(name="Pooja Sharma", email="pooja.sharma@nexavoice.gov.in", status="AVAILABLE")
        agent2 = HumanAgent(name="Amit Patel", email="amit.patel@nexavoice.gov.in", status="AVAILABLE")
        agent3 = HumanAgent(name="Sunita Rao", email="sunita.rao@nexavoice.gov.in", status="BUSY")
        session.add_all([agent1, agent2, agent3])

        # 2. Mock Applications for lookup
        app1 = MockApplication(
            reference_id="5281",
            applicant_name="Rahul Verma",
            phone="+919876543210",
            service_type="Ration Card Renewal",
            status="Processing in Verification Department",
            last_updated="2026-08-27",
            remarks="Documents verified. Pending officer approval.",
        )
        app2 = MockApplication(
            reference_id="5821",
            applicant_name="Rahul Verma",
            phone="+919876543210",
            service_type="Electricity Meter Relocation",
            status="Approved - Dispatch in Progress",
            last_updated="2026-08-28",
            remarks="Field technician scheduled for 2026-09-02.",
        )
        app3 = MockApplication(
            reference_id="9042",
            applicant_name="Priya Singh",
            phone="+919123456780",
            service_type="Domicile Certificate",
            status="Under Review",
            last_updated="2026-08-25",
            remarks="Additional address proof required.",
        )
        session.add_all([app1, app2, app3])

        # 3. Seed Users
        user1 = User(name="Rahul Verma", phone="+919876543210")
        user2 = User(name="Priya Singh", phone="+919123456780")
        user3 = User(name="Vikram Sethi", phone="+919988776655")
        session.add_all([user1, user2, user3])

        # 4. Seed a Sample Prior Escalated Case
        sample_call = Call(
            caller_number="+919876543210",
            agora_channel="call_sample_escalation_01",
            status="WAITING_FOR_HUMAN",
        )
        session.add(sample_call)
        await session.flush()

        conv = Conversation(
            call_id=sample_call.id,
            language="hinglish",
            intent="application_status",
            confidence=0.48,
            summary="Caller wants to verify application status. Mentioned reference 5281 but noise level was high and background confusion prevented confirmation.",
            collected_entities={"caller_name": "Rahul Verma", "reference_id": "5281"},
            missing_entities=[],
            confirmed_entities=[],
        )
        session.add(conv)
        await session.flush()

        msg1 = Message(conversation_id=conv.id, speaker="CALLER", language="hinglish", transcript="Mera application number 5281 tha... status nahi mil raha...")
        msg2 = Message(conversation_id=conv.id, speaker="AI", language="hinglish", transcript="Namaste Rahul ji, aapka reference number 5281 confirm karna chahta hoon, kya yahi sahi hai?")
        msg3 = Message(conversation_id=conv.id, speaker="CALLER", language="hinglish", transcript="Awaaz cut rahi hai... haan 52... wait, actually 5281 ya 5821 mein se...")
        msg4 = Message(conversation_id=conv.id, speaker="AI", language="hinglish", transcript="I am having trouble confirming your details due to audio clarity. I am connecting you with our human assistance officer right away.")
        session.add_all([msg1, msg2, msg3, msg4])

        case = Case(
            conversation_id=conv.id,
            category="application_status",
            priority="HIGH",
            status="WAITING_FOR_HUMAN",
            summary="Caller Rahul Verma needs application verification. Ambiguity between 5281 & 5821 due to audio noise.",
            confidence=0.48,
            escalation_reason="low_confidence",
            assigned_agent_id=agent1.id,
        )
        session.add(case)
        await session.flush()

        detail1 = CaseDetail(case_id=case.id, field_name="caller_name", field_value="Rahul Verma", confirmed=True)
        detail2 = CaseDetail(case_id=case.id, field_name="reference_id", field_value="5281 / 5821", confirmed=False)
        session.add_all([detail1, detail2])

        await session.commit()
        print("Successfully seeded initial database data.")


if __name__ == "__main__":
    asyncio.run(seed_database())
