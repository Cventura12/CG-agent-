"""Query mode handler for Arbor."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Optional
from uuid import uuid4

from anthropic import AsyncAnthropic, RateLimitError

from gc_agent.db.client import get_supabase_client
from gc_agent.state import AgentState
from gc_agent.telemetry import record_model_usage
from gc_agent.tools import supabase as supabase_tools

logger = logging.getLogger(__name__)

MODEL_NAME = "claude-sonnet-4-20250514"
DIRECT_RESPONSE_THRESHOLD = 0.75

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None

CLASSIFIER_PROMPT = """
You are a query classifier for a construction operations system.

Classify this query and extract structured intent.

Query: "{query}"

Return JSON only, no markdown:
{{
  "query_type": "open_items" | "job_history" | "quotes_pricing" | "multi" | "unknown",
  "job_reference": "<job name or id if mentioned, else null>",
  "complexity": "simple" | "complex",
  "confidence": 0.0-1.0,
  "retrieval_needed": ["db", "vector"]
}}

Rules:
- open_items: asking what's pending, outstanding, not done, needs follow-up
- job_history: asking what happened, what changed, timeline of a job
- quotes_pricing: asking about cost, estimate, quote, price, labor, materials
- multi: spans more than one type
- unknown: cannot determine intent
- simple = single job, single question type, high confidence
- complex = multi-job, vague reference, or spans multiple types
- confidence = how sure you are about the classification
- retrieval_needed = which strategies are needed: "db" for structured lookups, "vector" for fuzzy/semantic
"""

SYNTHESIS_PROMPT = """
You are Arbor, an operations assistant for a general contractor.
Answer the GC's question clearly and concisely using only the data provided.
If data is incomplete, say what you found and what's missing.
Do not make up numbers or job details.
Tone: direct, no fluff, field-ready.

GC Question: {query}

Retrieved Data:
{data}

Respond in 2-4 sentences max for simple answers.
For complex answers, use a short bullet list.
"""


def _get_anthropic_client() -> AsyncAnthropic:
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for query handling")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)
    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    parts: list[str] = []
    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)
    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty query output")
    return result


async def _call_claude(system: str, user: str, max_tokens: int = 512) -> str:
    client = _get_anthropic_client()
    for attempt in range(1, 4):
        try:
            response = await client.messages.create(
                model=MODEL_NAME,
                max_tokens=max_tokens,
                temperature=0,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            usage = getattr(response, "usage", None)
            record_model_usage(
                model_name=MODEL_NAME,
                input_tokens=getattr(usage, "input_tokens", None),
                output_tokens=getattr(usage, "output_tokens", None),
            )
            return _extract_message_text(response)
        except RateLimitError:
            logger.warning("query handler rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _parse_json_response(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("query classifier response was not valid JSON")
        payload = json.loads(cleaned[start : end + 1])

    if not isinstance(payload, dict):
        raise ValueError("query classifier payload must be a JSON object")

    return payload


async def classify_query(query: str) -> dict[str, Any]:
    try:
        raw = await _call_claude(
            system="You classify GC queries.",
            user=CLASSIFIER_PROMPT.format(query=query),
            max_tokens=256,
        )
        return _parse_json_response(raw)
    except Exception as exc:
        logger.warning("Query classification failed: %s", exc)
        return {
            "query_type": "unknown",
            "job_reference": None,
            "complexity": "complex",
            "confidence": 0.0,
            "retrieval_needed": ["db", "vector"],
        }


def _resolve_job_reference(gc_id: str, job_ref: str | None) -> dict[str, Any] | None:
    if not job_ref:
        return None
    job_ref_norm = _normalize_text(job_ref)
    if not job_ref_norm:
        return None

    for row in supabase_tools.list_jobs(gc_id):
        job_id = str(row.get("id", "")).strip()
        name = _normalize_text(row.get("name", ""))
        address = _normalize_text(row.get("address", ""))
        if job_ref_norm == job_id.lower():
            return dict(row)
        if job_ref_norm in name or name in job_ref_norm:
            return dict(row)
        if address and (job_ref_norm in address or address in job_ref_norm):
            return dict(row)
    return None


async def fetch_open_items(gc_id: str, job_ref: str | None) -> list[dict[str, Any]]:
    try:
        job = _resolve_job_reference(gc_id, job_ref)
        job_id = str(job.get("id", "")).strip() if job else None
        items = supabase_tools.list_open_items(gc_id, job_id=job_id)
        return [
            {
                "id": item.get("id"),
                "job_id": item.get("job_id"),
                "type": item.get("type"),
                "status": item.get("status"),
                "description": item.get("description"),
                "due_date": item.get("due_date"),
            }
            for item in items
            if str(item.get("status", "")).strip().lower() != "resolved"
        ]
    except Exception as exc:
        logger.error("fetch_open_items failed: %s", exc)
        return []


async def fetch_job_history(gc_id: str, job_ref: str | None) -> list[dict[str, Any]]:
    try:
        job = _resolve_job_reference(gc_id, job_ref)
        job_id = str(job.get("id", "")).strip() if job else None
        rows = supabase_tools.list_job_memory(gc_id)
        filtered = [
            row
            for row in rows
            if not job_id or str(row.get("job_id", "")).strip() == job_id
        ]
        return [
            {
                "id": row.get("id"),
                "job_id": row.get("job_id"),
                "summary": row.get("summary"),
                "created_at": row.get("created_at"),
            }
            for row in filtered[:15]
        ]
    except Exception as exc:
        logger.error("fetch_job_history failed: %s", exc)
        return []


async def fetch_quotes(gc_id: str, job_ref: str | None) -> list[dict[str, Any]]:
    client = get_supabase_client()
    try:
        job = _resolve_job_reference(gc_id, job_ref)
        job_id = str(job.get("id", "")).strip() if job else None
        query = (
            client.table("quote_drafts")
            .select("id,job_id,approval_status,quote_draft,final_quote_draft,created_at,updated_at")
            .eq("gc_id", gc_id)
            .order("created_at", desc=True)
            .limit(10)
        )
        if job_id:
            query = query.eq("job_id", job_id)
        response = query.execute()
        rows = response.data or []
        result: list[dict[str, Any]] = []
        for row in rows:
            draft = row.get("final_quote_draft") or row.get("quote_draft") or {}
            total = draft.get("total_price") or draft.get("total") or 0
            result.append(
                {
                    "id": row.get("id"),
                    "job_id": row.get("job_id"),
                    "status": row.get("approval_status") or "pending",
                    "total": total,
                    "created_at": row.get("created_at"),
                }
            )
        return result
    except Exception as exc:
        logger.error("fetch_quotes failed: %s", exc)
        return []


async def vector_search(gc_id: str, query: str, limit: int = 5) -> list[dict[str, Any]]:
    try:
        from gc_agent.nodes.recall_context import _embed_text

        embedding = await _embed_text(query)
        if not embedding:
            logger.warning("vector_search: embedding returned empty list")
            return []
        rows = supabase_tools.search_job_memory_by_embedding(gc_id, embedding, limit=limit)
        return [
            {
                "id": row.get("id"),
                "job_id": row.get("job_id"),
                "summary": row.get("summary"),
                "distance": row.get("distance"),
                "created_at": row.get("created_at"),
            }
            for row in rows
        ]
    except Exception as exc:
        logger.warning("Vector search failed: %s", exc)
        return []


async def synthesize_response(query: str, data: dict[str, Any]) -> str:
    try:
        return await _call_claude(
            system="You answer GC queries.",
            user=SYNTHESIS_PROMPT.format(
                query=query,
                data=json.dumps(data, indent=2, default=str),
            ),
            max_tokens=512,
        )
    except Exception as exc:
        logger.error("Response synthesis failed: %s", exc)
        return "I could not generate a response. Data was retrieved but synthesis failed."


async def queue_complex_query(
    gc_id: str,
    query: str,
    classification: dict[str, Any],
    retrieved_data: dict[str, Any],
    draft_response: str,
    job_id: str = "",
) -> str:
    try:
        item_id = f"query-{uuid4().hex[:12]}"
        summary = f"GC query: {query[:120]}".strip()
        confidence = classification.get("confidence", 0.0)
        content = draft_response
        why = f"Query requires review (confidence {confidence:.2f})."
        payload = {
            "id": item_id,
            "job_id": job_id or "",
            "gc_id": gc_id,
            "type": "owner-update",
            "title": summary,
            "content": content,
            "why": why,
            "status": "queued",
        }
        supabase_tools.upsert_draft_queue(payload)
        logger.info("Complex query queued: %s", item_id)
        return item_id
    except Exception as exc:
        logger.error("Failed to queue complex query: %s", exc)
        return "queue_failed"


async def handle_query(state: AgentState) -> dict[str, object]:
    query = state.cleaned_input.strip() or state.raw_input.strip()
    gc_id = state.gc_id.strip()

    if not query or not gc_id:
        errors = list(state.errors)
        errors.append("query_handler: missing query or gc_id")
        return {"errors": errors}

    classification = await classify_query(query)
    query_type = classification.get("query_type", "unknown")
    complexity = classification.get("complexity", "complex")
    confidence = float(classification.get("confidence", 0.0) or 0.0)
    job_ref = classification.get("job_reference")
    retrieval_needed = classification.get("retrieval_needed", ["db", "vector"])

    retrieved: dict[str, Any] = {}
    resolved_job = _resolve_job_reference(gc_id, job_ref)
    resolved_job_id = str(resolved_job.get("id", "")).strip() if resolved_job else ""

    if "db" in retrieval_needed:
        if query_type in ("open_items", "multi", "unknown"):
            retrieved["open_items"] = await fetch_open_items(gc_id, job_ref)
        if query_type in ("job_history", "multi", "unknown"):
            retrieved["job_history"] = await fetch_job_history(gc_id, job_ref)
        if query_type in ("quotes_pricing", "multi", "unknown"):
            retrieved["quotes"] = await fetch_quotes(gc_id, job_ref)

    if "vector" in retrieval_needed:
        retrieved["semantic_matches"] = await vector_search(gc_id, query)

    draft = await synthesize_response(query, retrieved)

    is_direct = complexity == "simple" and confidence >= DIRECT_RESPONSE_THRESHOLD
    result: dict[str, object] = {
        "query_response_draft": draft,
        "query_classification": classification,
        "query_retrieved": retrieved,
    }

    if is_direct:
        result.update(
            {
                "query_response": draft,
                "query_queued": False,
            }
        )
    else:
        queue_id = await queue_complex_query(
            gc_id,
            query,
            classification,
            retrieved,
            draft,
            job_id=resolved_job_id,
        )
        result.update(
            {
                "query_queued": True,
                "query_queue_id": queue_id,
            }
        )

    return result


__all__ = ["handle_query"]
