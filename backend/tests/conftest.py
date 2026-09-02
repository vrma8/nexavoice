import pytest_asyncio
from app.database.connection import init_db
from app.database.seed import seed_database


@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    await init_db()
    await seed_database()
    yield
