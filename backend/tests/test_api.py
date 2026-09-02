import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_call_lifecycle_and_turn_processing():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Start incoming call
        incoming_res = await ac.post("/api/calls/incoming", json={"caller_number": "+919876543210"})
        assert incoming_res.status_code == 200
        call_data = incoming_res.json()
        call_id = call_data["id"]

        # 2. Process Turn 1: Inquire status with reference 5281
        turn1_res = await ac.post(
            "/api/calls/process-turn",
            json={
                "call_id": call_id,
                "user_transcript": "Mera application number 5281 status check karna hai",
                "asr_confidence": 0.98,
            },
        )
        assert turn1_res.status_code == 200
        turn1_data = turn1_res.json()
        assert "5281" in turn1_data["ai_response_text"]

        # 3. Process Turn 2: Confirm reference
        turn2_res = await ac.post(
            "/api/calls/process-turn",
            json={
                "call_id": call_id,
                "user_transcript": "Haan sahi hai",
                "asr_confidence": 0.98,
            },
        )
        assert turn2_res.status_code == 200
        turn2_data = turn2_res.json()
        # AI looks up mock application 5281
        assert "Processing" in turn2_data["ai_response_text"] or "5281" in turn2_data["ai_response_text"]

        # 4. Get Call Transcript
        trans_res = await ac.get(f"/api/calls/{call_id}/transcript")
        assert trans_res.status_code == 200
        trans_data = trans_res.json()
        assert len(trans_data["messages"]) >= 4

        # 5. Human Transfer
        transfer_res = await ac.post(f"/api/calls/{call_id}/transfer", json={})
        assert transfer_res.status_code == 200
        assert transfer_res.json()["status"] == "success"

        # 6. End Call
        end_res = await ac.post(f"/api/calls/{call_id}/end", json={})
        assert end_res.status_code == 200
