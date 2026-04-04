"""
gc_agent/scripts/backfill_embeddings.py

Backfill embeddings for job_memory rows where embedding is missing or flagged.

Run manually:
    python -m gc_agent.scripts.backfill_embeddings

Flags:
    --table         job_memory | estimating_memory | all (default: all)
    --batch-size    rows per batch (default: 50)
    --dry-run       print rows that would be updated, no writes
    --contractor-id limit to a specific contractor (optional)
    --workspace-id  alias for contractor-id (optional)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from gc_agent.db.client import get_client
from gc_agent.nodes.recall_context import _embed_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TABLES = {
    "job_memory": {
        "select_fields": "id,contractor_id,job_id,summary,scope_text,embedding,metadata",
        "text_fields": ["summary", "scope_text"],
    },
    "estimating_memory": {
        # NOTE: estimating_memory does not currently store embeddings in this codebase.
        # This table is included for forward-compatibility; it will be skipped if embedding columns are missing.
        "select_fields": "id,contractor_id,job_id,trade_type,material_type,summary,embedding,metadata",
        "text_fields": ["summary", "trade_type", "material_type"],
    },
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_status(metadata: Any) -> str:
    if isinstance(metadata, dict):
        status = str(metadata.get("embedding_status", "")).strip().lower()
        if status:
            return status
    return ""


def _should_backfill(row: dict[str, Any]) -> bool:
    if row.get("embedding") is None:
        return True
    status = _extract_status(row.get("metadata"))
    return status in {"pending", "failed"}


def _build_text(row: dict[str, Any], text_fields: list[str]) -> str:
    parts: list[str] = []
    for field in text_fields:
        value = str(row.get(field, "") or "").strip()
        if value:
            parts.append(value)
    return " ".join(parts).strip()


async def _fetch_rows(
    client: Any,
    table: str,
    select_fields: str,
    batch_size: int,
    contractor_id: str | None,
) -> list[dict[str, Any]]:
    query = client.table(table).select(select_fields).limit(batch_size)
    if contractor_id:
        query = query.eq("contractor_id", contractor_id)
    result = query.execute()
    rows = result.data or []
    return [row for row in rows if isinstance(row, dict) and _should_backfill(row)]


async def backfill_table(
    client: Any,
    table: str,
    config: dict[str, Any],
    batch_size: int,
    dry_run: bool,
    contractor_id: str | None,
) -> dict[str, int]:
    stats = {"total": 0, "success": 0, "failed": 0, "skipped": 0}
    logger.info("Starting backfill | table=%s batch_size=%s dry_run=%s", table, batch_size, dry_run)

    while True:
        rows = await _fetch_rows(client, table, config["select_fields"], batch_size, contractor_id)
        if not rows:
            logger.info("No more pending rows | table=%s", table)
            break

        stats["total"] += len(rows)
        logger.info("Processing %s rows | table=%s", len(rows), table)

        for row in rows:
            row_id = str(row.get("id", "")).strip()
            if not row_id:
                stats["skipped"] += 1
                continue

            text = _build_text(row, config["text_fields"])
            if not text:
                stats["skipped"] += 1
                if not dry_run:
                    metadata = dict(row.get("metadata") or {})
                    metadata.update(
                        {
                            "embedding_status": "failed",
                            "embedding_error": "empty text",
                            "embedding_updated_at": _now_iso(),
                        }
                    )
                    try:
                        client.table(table).update({"metadata": metadata}).eq("id", row_id).execute()
                    except Exception as exc:
                        logger.error("Failed to mark row %s as failed: %s", row_id, exc)
                continue

            if dry_run:
                logger.info("[DRY RUN] Would embed row %s | text=%s...", row_id, text[:60])
                stats["success"] += 1
                continue

            embedding = await _embed_text(text)
            metadata = dict(row.get("metadata") or {})
            metadata.update(
                {
                    "embedding_status": "ok" if embedding else "failed",
                    "embedding_updated_at": _now_iso(),
                }
            )

            try:
                update_payload = {"metadata": metadata}
                if embedding:
                    update_payload["embedding"] = embedding
                client.table(table).update(update_payload).eq("id", row_id).execute()
                stats["success"] += 1 if embedding else 0
                stats["failed"] += 0 if embedding else 1
            except Exception as exc:
                stats["failed"] += 1
                logger.error("DB update failed for row %s | %s", row_id, exc)

            await asyncio.sleep(0.1)

        if len(rows) < batch_size:
            break

    return stats


async def run_backfill(
    tables: list[str],
    batch_size: int,
    dry_run: bool,
    contractor_id: str | None,
) -> None:
    client = get_client()
    all_stats: dict[str, dict[str, Any]] = {}

    for table in tables:
        if table not in TABLES:
            logger.warning("Unknown table: %s | skipping", table)
            continue

        start = time.time()
        try:
            stats = await backfill_table(
                client,
                table,
                TABLES[table],
                batch_size,
                dry_run,
                contractor_id,
            )
        except Exception as exc:
            logger.error("Backfill failed for table %s: %s", table, exc)
            stats = {"total": 0, "success": 0, "failed": 1, "skipped": 0}

        elapsed = time.time() - start
        all_stats[table] = {**stats, "elapsed_seconds": round(elapsed, 2)}

    print("\n--- Backfill Summary ---")
    for table, stats in all_stats.items():
        print(
            f"{table}: "
            f"total={stats['total']} "
            f"success={stats['success']} "
            f"failed={stats['failed']} "
            f"skipped={stats['skipped']} "
            f"({stats['elapsed_seconds']}s)"
        )
    if dry_run:
        print("\n[DRY RUN] No writes were made.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill missing embeddings")
    parser.add_argument(
        "--table",
        default="all",
        choices=["job_memory", "estimating_memory", "all"],
        help="Table to backfill (default: all)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Rows per batch (default: 50)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview rows without writing",
    )
    parser.add_argument(
        "--contractor-id",
        default=None,
        help="Limit to a specific contractor (optional)",
    )
    parser.add_argument(
        "--workspace-id",
        default=None,
        help="Alias for contractor-id (optional)",
    )
    args = parser.parse_args()

    contractor_id = args.contractor_id or args.workspace_id
    tables = list(TABLES.keys()) if args.table == "all" else [args.table]

    asyncio.run(
        run_backfill(
            tables=tables,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            contractor_id=contractor_id,
        )
    )


if __name__ == "__main__":
    main()
