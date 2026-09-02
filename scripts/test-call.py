"""
NexaVoice End-to-End Voice Flow CLI Runner
Demonstrates the 7 Demo scenarios from Section 50 of implementation.md
"""

import sys
import asyncio
import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://localhost:8000/api"


async def run_scenario(title: str, turns: list):
    print("\n" + "=" * 60)
    print(f">> RUNNING SCENARIO: {title}")
    print("=" * 60)

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # Start Call
        resp = await client.post("/calls/incoming", json={"caller_number": "+919876543210"})
        call_data = resp.json()
        call_id = call_data["id"]
        print(f"[CALL CONNECTED] Call ID: {call_id} | Channel: {call_data['agora_channel']}")

        for i, turn in enumerate(turns, 1):
            print(f"\n--- Turn {i} ---")
            print(f"[Caller]: \"{turn['text']}\"")
            if turn.get("noise"):
                print("   [High background noise detected]")
            if turn.get("interruption"):
                print("   [Caller interrupted mid-sentence]")

            turn_resp = await client.post(
                "/calls/process-turn",
                json={
                    "call_id": call_id,
                    "user_transcript": turn["text"],
                    "asr_confidence": turn.get("asr_conf", 0.95),
                    "has_background_noise": turn.get("noise", False),
                    "is_interruption": turn.get("interruption", False),
                },
            )
            data = turn_resp.json()
            conf = data["confidence_breakdown"]
            print(f"[AI Agent]: \"{data['ai_response_text']}\"")
            print(f"   Language: {data['language_used']} | Intent: {data['intent_detected']} | Confidence: {int(conf['overall_confidence']*100)}% ({conf['confidence_level']})")

            if data["escalation_triggered"]:
                print(f"   [ESCALATION TRIGGERED] Reason: {data['escalation_reason']}")
                if data.get("handoff_summary"):
                    print(f"   [Handoff Summary]: {data['handoff_summary']['summary']}")

        # Retrieve full transcript
        trans_resp = await client.get(f"/calls/{call_id}/transcript")
        print(f"\n[OK] Call completed with {len(trans_resp.json()['messages'])} messages in history.")


async def main():
    print("Starting NexaVoice Demonstration Scenarios...")

    # Scenario 1: Normal Flow + Confirmation
    await run_scenario(
        "Demo 1 & 3: Application Status Inquire & Number Confirmation",
        [
            {"text": "Mujhe apne application ka status check karna tha."},
            {"text": "5281."},
            {"text": "Haan, bilkul sahi hai."},
        ],
    )

    # Scenario 2: Code Switching (Hinglish)
    await run_scenario(
        "Demo 2: Hindi-English Code Switching",
        [
            {"text": "Actually status update nahi hua and I submitted it last week."},
            {"text": "My reference id is 5281."},
            {"text": "Yes that's right."},
        ],
    )

    # Scenario 3: Interruption and Correction
    await run_scenario(
        "Demo 4: Interruption and Correction",
        [
            {"text": "Reference number is 5281."},
            {"text": "No wait, sorry! It's actually 5821.", "interruption": True},
            {"text": "Yes correct."},
        ],
    )

    # Scenario 4: Low Confidence due to Noise
    await run_scenario(
        "Demo 5 & 6: Background Noise and Low Confidence Escalation",
        [
            {"text": "Mera woh... office mein... awaaz...", "noise": True, "asr_conf": 0.40},
            {"text": "Haan... wahi... samasya...", "noise": True, "asr_conf": 0.35},
        ],
    )

    # Scenario 5: Safety Policy Escalation (Medical)
    await run_scenario(
        "Demo 7: Medical Safety Policy - Immediate Human Handoff",
        [
            {"text": "Mujhe bohot severe chest pain ho raha hai, kaunsi dawai loon?"},
        ],
    )


if __name__ == "__main__":
    asyncio.run(main())
