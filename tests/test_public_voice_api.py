from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.api.auth import require_api_key
from gc_agent.api.voice import router as public_voice_router
from gc_agent.state import VoiceSession

voice_module = import_module("gc_agent.api.voice")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(public_voice_router, prefix="/public")

    async def _fake_require_api_key() -> bool:
        return True

    app.dependency_overrides[require_api_key] = _fake_require_api_key
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_public_voice_sessions_list_returns_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_list_voice_call_sessions(gc_id: str, limit: int = 25) -> list[dict[str, object]]:
        assert gc_id == "gc-demo"
        assert limit == 10
        return [{"id": "voice-public-1", "status": "ready_for_review"}]

    monkeypatch.setattr(voice_module.queries, "list_voice_call_sessions", _fake_list_voice_call_sessions)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/public/voice/sessions", params={"contractor_id": "gc-demo", "limit": 10})

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["sessions"][0]["id"] == "voice-public-1"


@pytest.mark.asyncio
async def test_public_voice_transfer_returns_updated_session(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_voice_call_session_for_gc(session_id: str, gc_id: str) -> dict[str, object] | None:
        assert session_id == "voice-public-2"
        assert gc_id == "gc-demo"
        return {"id": session_id}

    async def _fake_request_voice_session_transfer(
        session_id: str,
        *,
        target_number: str = "",
        note: str = "",
        initiated_by: str = "",
    ) -> VoiceSession:
        assert session_id == "voice-public-2"
        assert target_number == "+14235550199"
        assert note == "Route this to the office."
        assert initiated_by == "beta-api"
        return VoiceSession(
          id="voice-public-2",
          gc_id="gc-demo",
          call_id="CA-public-2",
          from_number="+14235550111",
          caller_name="Taylor Brooks",
          status="escalated",
          transfer_state="requested",
          transfer_target="+14235550199",
          summary="Field issue captured for office review.",
        )

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
            "/public/voice/sessions/voice-public-2/transfer",
            json={
                "contractor_id": "gc-demo",
                "target_number": "+14235550199",
                "note": "Route this to the office.",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["transfer_state"] == "requested"


@pytest.mark.asyncio
async def test_public_voice_recording_streams_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_voice_call_session_for_gc(session_id: str, gc_id: str) -> dict[str, object] | None:
        assert session_id == "voice-public-3"
        assert gc_id == "gc-demo"
        return {"id": session_id, "recording_storage_ref": "call-recordings:voice/public-3.wav"}

    def _fake_download_call_recording_file(storage_ref: str) -> tuple[bytes, str]:
        assert storage_ref == "call-recordings:voice/public-3.wav"
        return b"RIFFpublic", "audio/wav"

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
        response = await client.get("/public/voice/sessions/voice-public-3/recording", params={"contractor_id": "gc-demo"})

    assert response.status_code == 200
    assert response.content == b"RIFFpublic"
    assert response.headers["content-type"] == "audio/wav"
