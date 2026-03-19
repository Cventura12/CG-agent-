from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.voice import router as voice_router
from gc_agent.state import VoiceSession

voice_module = import_module("gc_agent.routers.voice")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(voice_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-voice"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_list_recent_voice_sessions_returns_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "gc-voice-1"

    async def _fake_list_voice_call_sessions(gc_id: str, limit: int = 25) -> list[dict[str, object]]:
        assert gc_id == "gc-voice-1"
        assert limit == 5
        return [
            {
                "id": "voice-1",
                "job_name": "Hartley reroof",
                "status": "ready_for_review",
                "transfer_state": "saved_for_review",
            }
        ]

    monkeypatch.setattr(voice_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(voice_module.queries, "list_voice_call_sessions", _fake_list_voice_call_sessions)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/voice/sessions", params={"limit": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["sessions"][0]["id"] == "voice-1"


@pytest.mark.asyncio
async def test_get_voice_session_detail_returns_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "gc-voice-1"

    async def _fake_get_voice_call_session_for_gc(session_id: str, gc_id: str) -> dict[str, object] | None:
        assert session_id == "voice-missing"
        assert gc_id == "gc-voice-1"
        return None

    monkeypatch.setattr(voice_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(
        voice_module.queries,
        "get_voice_call_session_for_gc",
        _fake_get_voice_call_session_for_gc,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/voice/sessions/voice-missing")

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"] == "voice session not found"


@pytest.mark.asyncio
async def test_transfer_voice_session_returns_updated_session(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "gc-voice-1"

    async def _fake_get_voice_call_session_for_gc(session_id: str, gc_id: str) -> dict[str, object] | None:
        assert session_id == "voice-123"
        assert gc_id == "gc-voice-1"
        return {"id": "voice-123", "recording_storage_ref": "call-recordings:voice/voice-123.wav"}

    async def _fake_request_voice_session_transfer(
        session_id: str,
        *,
        target_number: str = "",
        note: str = "",
        initiated_by: str = "",
    ) -> VoiceSession:
        assert session_id == "voice-123"
        assert target_number == "+14235550199"
        assert note == "Owner wants a person now."
        assert initiated_by == "operator"
        return VoiceSession(
            id="voice-123",
            gc_id="gc-voice-1",
            call_id="CA-voice-123",
            from_number="+14235550111",
            caller_name="Taylor Brooks",
            status="escalated",
            transfer_state="requested",
            transfer_target="+14235550199",
            summary="Field issue at Hartley reroof: owner wants to talk through the flashing change.",
        )

    monkeypatch.setattr(voice_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(
        voice_module.queries,
        "get_voice_call_session_for_gc",
        _fake_get_voice_call_session_for_gc,
    )
    monkeypatch.setattr(
        voice_module,
        "request_voice_session_transfer",
        _fake_request_voice_session_transfer,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/voice/sessions/voice-123/transfer",
            json={"target_number": "+14235550199", "note": "Owner wants a person now."},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["id"] == "voice-123"
    assert payload["data"]["transfer_state"] == "requested"
    assert payload["data"]["transfer_target"] == "+14235550199"


@pytest.mark.asyncio
async def test_get_voice_session_recording_streams_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "gc-voice-1"

    async def _fake_get_voice_call_session_for_gc(session_id: str, gc_id: str) -> dict[str, object] | None:
        assert session_id == "voice-456"
        assert gc_id == "gc-voice-1"
        return {
            "id": "voice-456",
            "recording_storage_ref": "call-recordings:voice/2026/03/19/voice-456.wav",
        }

    def _fake_download_call_recording_file(storage_ref: str) -> tuple[bytes, str]:
        assert storage_ref == "call-recordings:voice/2026/03/19/voice-456.wav"
        return b"RIFFfakewavpayload", "audio/wav"

    monkeypatch.setattr(voice_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(
        voice_module.queries,
        "get_voice_call_session_for_gc",
        _fake_get_voice_call_session_for_gc,
    )
    monkeypatch.setattr(
        voice_module,
        "download_call_recording_file",
        _fake_download_call_recording_file,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/voice/sessions/voice-456/recording")

    assert response.status_code == 200
    assert response.content == b"RIFFfakewavpayload"
    assert response.headers["content-type"] == "audio/wav"
    assert "inline; filename=\"voice-456.wav\"" == response.headers["content-disposition"]
