import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.connection import init_db
from app.database.seed import seed_database
from app.api.routes.health import router as health_router
from app.api.routes.calls import router as calls_router
from app.api.routes.cases import router as cases_router
from app.api.routes.tokens import router as tokens_router
from app.api.routes.ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database and Seed default mock data
    await init_db()
    await seed_database()
    yield
    # Shutdown


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Real-Time Multilingual Assistance-Line Agent with Voice, Hindi/English Code-Switching, and Human Escalation",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend dashboard and local simulators
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(health_router, prefix="/api")
app.include_router(calls_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(tokens_router, prefix="/api")
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs": "/docs",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
