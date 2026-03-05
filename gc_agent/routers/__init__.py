"""API router exports for GC Agent backend."""

from gc_agent.routers.auth import router as auth_router
from gc_agent.routers.insights import router as insights_router
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.routers.queue import router as queue_router
from gc_agent.routers.referrals import router as referrals_router

__all__ = ["auth_router", "queue_router", "jobs_router", "referrals_router", "insights_router"]
