"""Standalone wrapper for the public contractor API router."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from gc_agent.api.router import APP_VERSION, open_router, router

app = FastAPI(title="Arbor Agent API", version=APP_VERSION)

allowed_origins = [
    origin.strip()
    for origin in (
        os.getenv("FRONTEND_URL", "").strip(),
        os.getenv("WEB_APP_URL", "").strip(),
        "https://cg-agent-six.vercel.app",
        "https://cg-agent-djno.vercel.app",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(set(allowed_origins)),
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_public_cors_headers(request: Request, call_next):
    """Ensure public endpoints respond with CORS headers for Vercel clients."""
    if request.method == "OPTIONS":
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
    origin = request.headers.get("origin", "*")
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Vary"] = "Origin"
    return response

app.include_router(open_router)
app.include_router(router)


__all__ = ["app"]
