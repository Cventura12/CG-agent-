"""Streaming helpers for live Twilio media streams and recording persistence."""

from __future__ import annotations

import asyncio
import io
import json
import os
import struct
import wave
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from websockets.asyncio.client import connect


def mulaw_bytes_to_wav(payload: bytes, *, sample_rate: int = 8000) -> bytes:
    """Convert raw G.711 mu-law bytes into a browser-safe PCM WAV file."""
    pcm = io.BytesIO()
    with wave.open(pcm, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for byte in payload:
            wav_file.writeframesraw(struct.pack("<h", _mulaw_decode(byte)))
    return pcm.getvalue()


def _mulaw_decode(value: int) -> int:
    """Decode one 8-bit mu-law sample to signed 16-bit PCM."""
    ulaw = (~value) & 0xFF
    sign = ulaw & 0x80
    exponent = (ulaw >> 4) & 0x07
    mantissa = ulaw & 0x0F
    sample = ((mantissa | 0x10) << (exponent + 3)) - 0x84
    return -sample if sign else sample


@dataclass(slots=True)
class LiveTranscriptEvent:
    """Normalized transcription event emitted from the streaming bridge."""

    transcript: str
    is_final: bool
    speech_final: bool = False
    confidence: float | None = None


class DeepgramLiveBridge:
    """Minimal WebSocket bridge for Deepgram live transcription."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        sample_rate: int = 8000,
        encoding: str = "mulaw",
        channels: int = 1,
    ) -> None:
        self.api_key = (api_key or os.getenv("DEEPGRAM_API_KEY", "")).strip()
        self.model = (model or os.getenv("DEEPGRAM_STREAM_MODEL", "")).strip() or "nova-2-phonecall"
        self.sample_rate = sample_rate
        self.encoding = encoding
        self.channels = channels
        self.endpointing_ms = max(int(os.getenv("DEEPGRAM_STREAM_ENDPOINTING_MS", "220") or 220), 80)
        self.utterance_end_ms = max(int(os.getenv("DEEPGRAM_STREAM_UTTERANCE_END_MS", "0") or 0), 0)
        self._connection = None
        self._queue: asyncio.Queue[LiveTranscriptEvent | None] = asyncio.Queue()
        self._recv_task: asyncio.Task[None] | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def connect(self) -> None:
        """Open the Deepgram live transcription socket."""
        if not self.enabled:
            raise RuntimeError("DEEPGRAM_API_KEY is required for live voice streaming")
        if self._connection is not None:
            return

        query = (
            f"model={self.model}&encoding={self.encoding}&sample_rate={self.sample_rate}"
            f"&channels={self.channels}&interim_results=true&punctuate=true"
            f"&endpointing={self.endpointing_ms}&vad_events=true"
        )
        if self.utterance_end_ms > 0:
            query += f"&utterance_end_ms={self.utterance_end_ms}"
        self._connection = await connect(
            f"wss://api.deepgram.com/v1/listen?{query}",
            additional_headers={"Authorization": f"Token {self.api_key}"},
            max_size=None,
        )
        self._recv_task = asyncio.create_task(self._recv_loop())

    async def send_audio(self, payload: bytes) -> None:
        """Forward one chunk of mu-law audio to Deepgram."""
        if self._connection is None or not payload:
            return
        await self._connection.send(payload)

    async def iter_events(self) -> AsyncIterator[LiveTranscriptEvent]:
        """Yield transcript events as Deepgram emits them."""
        while True:
            event = await self._queue.get()
            if event is None:
                break
            yield event

    async def close(self) -> None:
        """Flush and close the transcription socket."""
        if self._connection is not None:
            try:
                await self._connection.send(json.dumps({"type": "Finalize"}))
            except Exception:
                pass
            try:
                await self._connection.close()
            except Exception:
                pass
        if self._recv_task is not None:
            try:
                await self._recv_task
            except Exception:
                pass
        self._connection = None
        self._recv_task = None

    async def _recv_loop(self) -> None:
        if self._connection is None:
            return
        try:
            async for message in self._connection:
                if not isinstance(message, str):
                    continue
                event = self._parse_message(message)
                if event is not None:
                    await self._queue.put(event)
        finally:
            await self._queue.put(None)

    def _parse_message(self, message: str) -> LiveTranscriptEvent | None:
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            return None

        alternatives = (
            payload.get("channel", {}).get("alternatives", [])
            if isinstance(payload.get("channel"), dict)
            else []
        )
        if not alternatives or not isinstance(alternatives[0], dict):
            return None

        transcript = str(alternatives[0].get("transcript", "")).strip()
        if not transcript:
            return None

        confidence_raw = alternatives[0].get("confidence")
        try:
            confidence = float(confidence_raw) if confidence_raw is not None else None
        except (TypeError, ValueError):
            confidence = None

        speech_final = bool(payload.get("speech_final"))
        return LiveTranscriptEvent(
            transcript=transcript,
            is_final=bool(payload.get("is_final")),
            speech_final=speech_final,
            confidence=confidence,
        )


class DeepgramTTSBridge:
    """Minimal websocket wrapper for low-latency Deepgram streaming TTS."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        encoding: str = "mulaw",
        sample_rate: int = 8000,
    ) -> None:
        self.api_key = (api_key or os.getenv("DEEPGRAM_API_KEY", "")).strip()
        self.model = (model or os.getenv("DEEPGRAM_TTS_MODEL", "")).strip() or "aura-2-thalia-en"
        self.encoding = encoding
        self.sample_rate = sample_rate

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def iter_audio(self, text: str) -> AsyncIterator[bytes]:
        """Yield synthesized audio chunks for one prompt as raw mu-law audio."""
        cleaned = text.strip()
        if not cleaned:
            return
        if not self.enabled:
            raise RuntimeError("DEEPGRAM_API_KEY is required for live voice TTS")

        query = (
            f"model={self.model}&encoding={self.encoding}&sample_rate={self.sample_rate}"
        )
        async with connect(
            f"wss://api.deepgram.com/v1/speak?{query}",
            additional_headers={"Authorization": f"Token {self.api_key}"},
            max_size=None,
        ) as connection:
            await connection.send(json.dumps({"type": "Speak", "text": cleaned}))
            await connection.send(json.dumps({"type": "Flush"}))

            async for message in connection:
                if isinstance(message, bytes):
                    if message:
                        yield message
                    continue

                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    continue

                message_type = str(payload.get("type", "")).strip()
                if message_type == "Flushed":
                    break
                if message_type == "Warning":
                    continue

            try:
                await connection.send(json.dumps({"type": "Close"}))
            except Exception:
                pass


__all__ = [
    "DeepgramLiveBridge",
    "DeepgramTTSBridge",
    "LiveTranscriptEvent",
    "mulaw_bytes_to_wav",
]
