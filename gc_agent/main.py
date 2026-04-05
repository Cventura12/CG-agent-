"""FastAPI application entry point for Arbor Agent backend."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.responses import Response
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
from gc_agent.api.voice import router as public_voice_router
from gc_agent.nodes.followup_trigger import process_due_followups
from gc_agent.routers.analytics import router as analytics_router
from gc_agent.routers.auth import router as auth_router
from gc_agent.routers.budget import router as budget_router
from gc_agent.routers.ingest import router as ingest_router
from gc_agent.routers.insights import router as insights_router
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.routers.pricing import router as pricing_router
from gc_agent.routers.queue import router as queue_router
from gc_agent.routers.responsibilities import router as responsibilities_router
from gc_agent.routers.transcripts import router as transcripts_router
from gc_agent.routers.voice import router as voice_router
from gc_agent.webhooks.twilio import (
    router as twilio_router,
    send_sms_message,
    send_whatsapp_message,
)

LOGGER = logging.getLogger(__name__)
APP_VERSION = "1.0"
_APP: Optional[FastAPI] = None


class Settings(BaseSettings):
    """Environment-backed runtime settings for Arbor Agent."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    log_level: str = "INFO"
    port: int = 8000
    frontend_url: str = "http://localhost:5173"
    cors_allow_origins: str = ""
    cors_allow_origin_regex: str = r"^https://.*\.vercel\.app$"

    briefing_hour: int = 6
    briefing_retry_interval_minutes: int = 20
    briefing_retry_lookback_hours: int = 24
    briefing_retry_max_attempts: int = 3
    briefing_retry_batch_size: int = 25

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_sms_from: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"
    twilio_status_callback_url: str = ""


settings = Settings()
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
_DEFAULT_FRONTEND_ORIGINS = [
    "https://cg-agent-six.vercel.app",
    "https://cg-agent-djno.vercel.app",
]


def _log_startup_runtime_warnings() -> None:
    """Emit explicit runtime warnings for optional integrations and jobs."""
    twilio_configured = bool(
        settings.twilio_account_sid.strip()
        and settings.twilio_auth_token.strip()
        and (settings.twilio_whatsapp_from.strip() or settings.twilio_sms_from.strip())
    )
    smtp_configured = bool(
        os.getenv("SMTP_HOST", "").strip()
        and os.getenv("SMTP_FROM_EMAIL", "").strip()
        and (
            os.getenv("SMTP_PASSWORD", "").strip()
            or os.getenv("SMTP_USERNAME", "").strip()
        )
    )

    if twilio_configured:
        LOGGER.info("Twilio messaging + webhook integration configured")
        if not settings.twilio_status_callback_url.strip():
            LOGGER.warning("TWILIO_STATUS_CALLBACK_URL is not configured; delivery status updates will not be tracked automatically")
    else:
        LOGGER.warning("Twilio config incomplete; SMS/WhatsApp delivery and provider callbacks may be unavailable")

    if smtp_configured:
        LOGGER.info("SMTP email delivery configured")
    else:
        LOGGER.warning("SMTP config incomplete; email quote delivery may be unavailable")

    LOGGER.info(
        "Route surfaces ready: internal=/api/v1 (Clerk), public=/public (API key), webhooks=/webhook"
    )


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


async def _fetch_gc_ids_with_followups(app: FastAPI) -> list[str]:
    """Fetch GC IDs that currently have active follow-up open items."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return []

    def _query_gc_ids() -> list[str]:
        response = (
            supabase.table("open_items")
            .select("gc_id")
            .eq("type", "followup")
            .in_("status", ["open", "in-progress", "overdue"])
            .execute()
        )
        values = [str(row.get("gc_id", "")).strip() for row in response.data or []]
        return [gc_id for gc_id in sorted(set(values)) if gc_id]

    try:
        return await asyncio.to_thread(_query_gc_ids)
    except Exception:
        LOGGER.exception("Failed fetching follow-up gc_ids")
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
    delivery_channel: str = "whatsapp",
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
        "delivery_channel": delivery_channel.strip() or "whatsapp",
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
    delivery_channel: str = "whatsapp",
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
        "delivery_channel": delivery_channel.strip() or "whatsapp",
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


async def _deliver_briefing_with_fallback(
    phone_number: str,
    briefing_text: str,
) -> tuple[str, str, str]:
    """Deliver morning briefing with WhatsApp first, then SMS fallback."""
    try:
        sid = await send_whatsapp_message(phone_number, briefing_text)
        return ("whatsapp", sid, "")
    except Exception as whatsapp_exc:
        LOGGER.warning("WhatsApp briefing send failed for %s: %s", phone_number, whatsapp_exc)
        try:
            sid = await send_sms_message(phone_number, briefing_text)
            warning = f"whatsapp_failed: {whatsapp_exc}"
            return ("sms", sid, warning[:500])
        except Exception as sms_exc:
            error = f"whatsapp_failed: {whatsapp_exc}; sms_failed: {sms_exc}"
            raise RuntimeError(error[:500]) from sms_exc


async def _fetch_failed_briefings_for_retry(app: FastAPI) -> list[dict[str, str]]:
    """Fetch failed briefing log rows eligible for retry attempts."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return []

    lookback = max(settings.briefing_retry_lookback_hours, 1)
    batch_size = max(settings.briefing_retry_batch_size, 1)
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=lookback)).isoformat()

    def _query() -> list[dict[str, str]]:
        response = (
            supabase.table("briefing_log")
            .select("id,gc_id,phone_number,briefing_text,trace_id,created_at")
            .eq("delivery_status", "failed")
            .gte("created_at", cutoff_iso)
            .order("created_at", desc=False)
            .limit(batch_size)
            .execute()
        )
        rows = response.data or []
        return [dict(row) for row in rows]

    try:
        return await asyncio.to_thread(_query)
    except Exception:
        LOGGER.exception("Failed loading briefing retry candidates")
        return []


async def _count_briefing_attempts(app: FastAPI, trace_id: str, gc_id: str) -> int:
    """Count recorded send attempts for a trace_id/gc_id pair."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return 0

    if not trace_id.strip() or not gc_id.strip():
        return 0

    def _query() -> int:
        response = (
            supabase.table("briefing_log")
            .select("id", count="exact")
            .eq("trace_id", trace_id.strip())
            .eq("gc_id", gc_id.strip())
            .execute()
        )
        if getattr(response, "count", None) is not None:
            return int(response.count or 0)
        return len(response.data or [])

    try:
        return await asyncio.to_thread(_query)
    except Exception:
        LOGGER.exception("Failed counting briefing attempts trace_id=%s gc_id=%s", trace_id, gc_id)
        return 0


async def _has_sent_briefing_delivery(app: FastAPI, trace_id: str, gc_id: str) -> bool:
    """Return True when a successful delivery already exists for this trace."""
    supabase: Optional[SupabaseClient] = app.state.supabase_client
    if supabase is None:
        return False

    if not trace_id.strip() or not gc_id.strip():
        return False

    def _query() -> bool:
        response = (
            supabase.table("briefing_log")
            .select("id")
            .eq("trace_id", trace_id.strip())
            .eq("gc_id", gc_id.strip())
            .eq("delivery_status", "sent")
            .limit(1)
            .execute()
        )
        return bool(response.data)

    try:
        return await asyncio.to_thread(_query)
    except Exception:
        LOGGER.exception(
            "Failed checking sent briefing delivery trace_id=%s gc_id=%s",
            trace_id,
            gc_id,
        )
        return False


async def retry_failed_briefings() -> None:
    """Retry failed briefing sends to improve morning delivery reliability."""
    if _APP is None:
        LOGGER.warning("retry_failed_briefings called before app startup")
        return

    app = _APP
    candidates = await _fetch_failed_briefings_for_retry(app)
    if not candidates:
        return

    max_attempts = max(settings.briefing_retry_max_attempts, 1)
    LOGGER.info("Retrying %s failed briefing(s)", len(candidates))

    for row in candidates:
        gc_id = str(row.get("gc_id", "")).strip()
        phone_number = str(row.get("phone_number", "")).strip()
        briefing_text = str(row.get("briefing_text", "")).strip() or "Morning briefing unavailable."
        trace_id = str(row.get("trace_id", "")).strip()

        attempts = await _count_briefing_attempts(app, trace_id=trace_id, gc_id=gc_id)
        if attempts >= max_attempts:
            continue
        if await _has_sent_briefing_delivery(app, trace_id=trace_id, gc_id=gc_id):
            continue

        if not gc_id or not phone_number:
            continue

        try:
            delivery_channel, provider_sid, warning = await _deliver_briefing_with_fallback(
                phone_number,
                briefing_text,
            )
            await _store_sent_briefing(
                app=app,
                gc_id=gc_id,
                phone_number=phone_number,
                briefing_text=briefing_text,
                twilio_sid=provider_sid,
                trace_id=trace_id,
                delivery_channel=delivery_channel,
            )
            if warning:
                LOGGER.warning(
                    "Briefing retry used fallback channel gc_id=%s trace_id=%s detail=%s",
                    gc_id,
                    trace_id,
                    warning,
                )
        except Exception as exc:
            await _store_failed_briefing(
                app=app,
                gc_id=gc_id,
                phone_number=phone_number,
                briefing_text=briefing_text,
                error_message=str(exc),
                trace_id=trace_id,
                delivery_channel="whatsapp",
            )


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
            delivery_channel, message_sid, warning = await _deliver_briefing_with_fallback(
                phone_number,
                briefing_text,
            )
            LOGGER.info(
                "Briefing delivered gc_id=%s channel=%s sid=%s",
                gc_id,
                delivery_channel,
                message_sid,
            )
            await _store_sent_briefing(
                app=app,
                gc_id=gc_id,
                phone_number=phone_number,
                briefing_text=briefing_text,
                twilio_sid=message_sid,
                trace_id=trace_id,
                delivery_channel=delivery_channel,
            )
            if warning:
                LOGGER.warning(
                    "Briefing delivery used fallback channel gc_id=%s trace_id=%s detail=%s",
                    gc_id,
                    trace_id,
                    warning,
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
                delivery_channel="whatsapp",
            )


async def run_due_followups() -> None:
    """Execute due quote follow-up reminders across all contractors."""
    if _APP is None:
        LOGGER.warning("run_due_followups called before app startup")
        return

    app = _APP
    gc_ids = await _fetch_gc_ids_with_followups(app)
    if not gc_ids:
        return

    LOGGER.info("Scheduled follow-up run started for %s GC account(s)", len(gc_ids))
    for gc_id in gc_ids:
        try:
            result = await process_due_followups(gc_id)
            LOGGER.info(
                "Follow-up run gc_id=%s processed=%s sent=%s failed=%s stopped=%s skipped_recent=%s",
                gc_id,
                result.get("processed_items", 0),
                result.get("sent_reminders", 0),
                result.get("failed_attempts", 0),
                result.get("stopped_items", 0),
                result.get("skipped_recent", 0),
            )
        except Exception:
            LOGGER.exception("Scheduled follow-up execution failed gc_id=%s", gc_id)


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
    scheduler.add_job(
        retry_failed_briefings,
        trigger="interval",
        minutes=max(settings.briefing_retry_interval_minutes, 5),
        id="retry_failed_briefings",
        replace_existing=True,
    )
    scheduler.add_job(
        run_due_followups,
        trigger="interval",
        hours=1,
        id="process_due_followups",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler
    _log_startup_runtime_warnings()
    LOGGER.info("Scheduler jobs registered: daily_briefings, retry_failed_briefings, process_due_followups")

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


app = FastAPI(title="Arbor", version=APP_VERSION, lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in ",".join(
        [settings.frontend_url, settings.cors_allow_origins, ",".join(_DEFAULT_FRONTEND_ORIGINS)]
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=settings.cors_allow_origin_regex.strip() or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_public_cors_headers(request: Request, call_next):
    """Ensure public endpoints respond with CORS headers for Vercel clients."""
    if request.method == "OPTIONS" and request.url.path.startswith("/public"):
        origin = request.headers.get("origin", "*")
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",
                "Vary": "Origin",
            },
        )

    response = await call_next(request)
    if request.url.path.startswith("/public"):
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Vary"] = "Origin"
    return response

app.include_router(twilio_router, prefix="/webhook")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(budget_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(ingest_router, prefix="/api/v1")
app.include_router(insights_router, prefix="/api/v1")
app.include_router(queue_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(pricing_router, prefix="/api/v1")
app.include_router(responsibilities_router, prefix="/api/v1")
app.include_router(transcripts_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
app.include_router(public_open_router, prefix="/public", tags=["public"])
app.include_router(public_router, prefix="/public", tags=["public"])
app.include_router(public_voice_router, prefix="/public", tags=["public"])


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
