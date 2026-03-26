"""Standalone wrapper for the public contractor API router."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gc_agent.api.router import APP_VERSION, open_router, router

app = FastAPI(title="Arbor Agent API", version=APP_VERSION)

allowed_origins = [
    origin.strip()
    for origin in (
        os.getenv("FRONTEND_URL", "").strip(),
        os.getenv("WEB_APP_URL", "").strip(),
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    )
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(set(allowed_origins)),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(open_router)
app.include_router(router)


__all__ = ["app"]
