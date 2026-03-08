"""API router exports for GC Agent backend."""

from gc_agent.routers.auth import router as auth_router
from gc_agent.routers.insights import router as insights_router
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.routers.pricing import router as pricing_router
from gc_agent.routers.queue import router as queue_router
from gc_agent.routers.transcripts import router as transcripts_router

__all__ = [
    "auth_router",
    "queue_router",
    "jobs_router",
    "insights_router",
    "pricing_router",
    "transcripts_router",
]
