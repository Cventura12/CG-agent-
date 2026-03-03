"""FastAPI application entry point for GC Agent backend."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional
from uuid import uuid4

import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic_settings import BaseSettings, SettingsConfigDict
from supabase import Client as SupabaseClient, create_client

try:
    from fastapi_cache import FastAPICache
    from fastapi_cache.backends.inmemory import InMemoryBackend
except ModuleNotFoundError:
    FastAPICache = None  # type: ignore[assignment]
    InMemoryBackend = None  # type: ignore[assignment]

from gc_agent import graph
from gc_agent.api.router import open_router as public_open_router
from gc_agent.api.router import router as public_router
from gc_agent.routers.auth import router as auth_router
from gc_agent.routers.ingest import router as ingest_router
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.routers.queue import router as queue_router
from gc_agent.webhooks.twilio import router as twilio_router, send_whatsapp_message

LOGGER = logging.getLogger(__name__)
APP_VERSION = "1.0"
_APP: Optional[FastAPI] = None


class Settings(BaseSettings):
    """Environment-backed runtime settings for GC Agent."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    log_level: str = "INFO"
    port: int = 8000
    frontend_url: str = "http://localhost:5173"

    briefing_hour: int = 6

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"


settings = Settings()
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))


def _get_supabase_key() -> str:
    """Select service key when available, otherwise anon key."""
    return settings.supabase_service_role_key or settings.supabase_anon_key


def _build_supabase_client() -> Optional[SupabaseClient]:
    """Create a Supabase client for data access if configuration is present."""
    key = _get_supabase_key().strip()
    if not settings.supabase_url.strip() or not key:
        LOGGER.warning("Supabase not configured; database-backed features are disabled")
        return None

    try:
        return create_client(settings.supabase_url, key)
    except Exception:
        LOGGER.exception("Failed to initialize Supabase client")
        return None


async def _count_active_jobs(app: FastAPI) -> int:
    """Count active jobs currently persisted in Supabase."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return 0

    def _query_count() -> int:
        response = supabase.table("jobs").select("id", count="exact").eq("status", "active").execute()
        if getattr(response, "count", None) is not None:
            return int(response.count or 0)
        return len(response.data or [])

    try:
        return await asyncio.to_thread(_query_count)
    except Exception:
        LOGGER.exception("Failed counting active jobs")
        return 0


async def _fetch_active_gc_ids(app: FastAPI) -> list[str]:
    """Fetch GC IDs that currently have active jobs."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return []

    def _query_gc_ids() -> list[str]:
        response = supabase.table("jobs").select("gc_id").eq("status", "active").execute()
        values = [str(row.get("gc_id", "")).strip() for row in response.data or []]
        return [gc_id for gc_id in sorted(set(values)) if gc_id]

    try:
        return await asyncio.to_thread(_query_gc_ids)
    except Exception:
        LOGGER.exception("Failed fetching active gc_ids")
        return []


async def _fetch_gc_phone_number(app: FastAPI, gc_id: str) -> Optional[str]:
    """Fetch a GC phone number from gc_users for briefing delivery."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return None

    def _query_phone() -> Optional[str]:
        response = supabase.table("gc_users").select("phone_number").eq("id", gc_id).limit(1).execute()
        rows = response.data or []
        if not rows:
            return None
        phone = str(rows[0].get("phone_number", "")).strip()
        return phone or None

    try:
        return await asyncio.to_thread(_query_phone)
    except Exception:
        LOGGER.exception("Failed fetching phone for gc_id=%s", gc_id)
        return None


async def _store_failed_briefing(
    app: FastAPI,
    gc_id: str,
    phone_number: str,
    briefing_text: str,
    error_message: str,
    trace_id: str = "",
) -> None:
    """Persist an undelivered briefing for manual retrieval."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        LOGGER.error("Unable to store failed briefing gc_id=%s: Supabase unavailable", gc_id)
        return

    payload = {
        "id": uuid4().hex,
        "gc_id": gc_id,
        "phone_number": phone_number,
        "briefing_text": briefing_text,
        "delivery_channel": "whatsapp",
        "delivery_status": "failed",
        "error_message": error_message[:500],
        "trace_id": trace_id.strip() or None,
    }

    def _insert() -> None:
        supabase.table("briefing_log").insert(payload).execute()

    try:
        await asyncio.to_thread(_insert)
        LOGGER.info("Stored failed briefing in briefing_log gc_id=%s", gc_id)
    except Exception:
        LOGGER.exception("Failed writing briefing_log entry gc_id=%s", gc_id)


async def _store_sent_briefing(
    app: FastAPI,
    gc_id: str,
    phone_number: str,
    briefing_text: str,
    twilio_sid: str,
    trace_id: str = "",
) -> None:
    """Persist a successfully delivered briefing."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return

    payload = {
        "id": uuid4().hex,
        "gc_id": gc_id,
        "phone_number": phone_number,
        "briefing_text": briefing_text,
        "delivery_channel": "whatsapp",
        "delivery_status": "sent",
        "twilio_sid": twilio_sid[:120],
        "trace_id": trace_id.strip() or None,
    }

    def _insert() -> None:
        supabase.table("briefing_log").insert(payload).execute()

    try:
        await asyncio.to_thread(_insert)
    except Exception:
        LOGGER.exception("Failed writing successful briefing_log entry gc_id=%s", gc_id)


async def send_daily_briefings() -> None:
    """Generate and send morning briefings to all active GC accounts."""
    if _APP is None:
        LOGGER.warning("send_daily_briefings called before app startup")
        return

    app = _APP
    gc_ids = await _fetch_active_gc_ids(app)
    LOGGER.info("Daily briefing run started for %s GC account(s)", len(gc_ids))

    for gc_id in gc_ids:
        briefing_text = "Morning briefing unavailable."
        trace_id = uuid4().hex
        try:
            briefing_text = await graph.run_briefing(gc_id, trace_id=trace_id)
        except Exception:
            LOGGER.exception("Briefing generation failed gc_id=%s; using fallback text", gc_id)

        if not briefing_text.strip():
            briefing_text = "Morning briefing unavailable."

        phone_number = await _fetch_gc_phone_number(app, gc_id)
        if not phone_number:
            LOGGER.error("Skipping gc_id=%s: no registered phone number", gc_id)
            continue

        try:
            message_sid = await send_whatsapp_message(phone_number, briefing_text)
            LOGGER.info("Briefing delivered gc_id=%s sid=%s", gc_id, message_sid)
            await _store_sent_briefing(
                app=app,
                gc_id=gc_id,
                phone_number=phone_number,
                briefing_text=briefing_text,
                twilio_sid=message_sid,
                trace_id=trace_id,
            )
        except Exception as exc:
            LOGGER.exception("Briefing delivery failed gc_id=%s", gc_id)
            await _store_failed_briefing(
                app=app,
                gc_id=gc_id,
                phone_number=phone_number,
                briefing_text=briefing_text,
                error_message=str(exc),
                trace_id=trace_id,
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle hooks for startup initialization and shutdown cleanup."""
    global _APP
    _APP = app

    app.state.settings = settings
    app.state.supabase_client = _build_supabase_client()
    if FastAPICache is not None and InMemoryBackend is not None:
        FastAPICache.init(InMemoryBackend(), prefix="gc-agent-cache")
    else:
        LOGGER.warning("fastapi-cache2 not installed; caching disabled")

    try:
        graph.get_graph()
        LOGGER.info("LangGraph warmed successfully")
    except Exception:
        LOGGER.exception("Failed to warm LangGraph during startup")

    jobs_loaded = await _count_active_jobs(app)
    app.state.jobs_loaded = jobs_loaded

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        send_daily_briefings,
        trigger="cron",
        hour=settings.briefing_hour,
        minute=30,
        id="daily_briefings",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler

    LOGGER.info("Startup complete; jobs_loaded=%s, briefing_hour=%s", jobs_loaded, settings.briefing_hour)

    try:
        yield
    finally:
        try:
            scheduler.shutdown(wait=False)
            LOGGER.info("Scheduler shut down")
        except Exception:
            LOGGER.exception("Error while shutting down scheduler")
        _APP = None


app = FastAPI(title="GC Agent", version=APP_VERSION, lifespan=lifespan)

allowed_origins = [origin.strip() for origin in settings.frontend_url.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(twilio_router, prefix="/webhook")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(ingest_router, prefix="/api/v1")
app.include_router(queue_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(public_open_router, prefix="/public", tags=["public"])
app.include_router(public_router, prefix="/public", tags=["public"])


@app.get("/health")
async def health() -> dict[str, object]:
    """Return service health and lightweight readiness metadata."""
    jobs_loaded = await _count_active_jobs(app)
    app.state.jobs_loaded = jobs_loaded
    return {
        "status": "ok",
        "version": APP_VERSION,
        "jobs_loaded": jobs_loaded,
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch and log unhandled exceptions with a stable API error response."""
    LOGGER.exception("Unhandled exception at path=%s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error"},
    )


if __name__ == "__main__":
    uvicorn.run("gc_agent.main:app", host="0.0.0.0", port=settings.port)
