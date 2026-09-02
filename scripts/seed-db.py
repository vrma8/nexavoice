import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.database.seed import seed_database

if __name__ == "__main__":
    print("🌱 Seeding NexaVoice database...")
    asyncio.run(seed_database())
    print("✨ Seeding completed.")
