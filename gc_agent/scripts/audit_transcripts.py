"""
gc_agent/scripts/audit_transcripts.py

Quick audit for transcript linkage vs queue output.

Run:
    python -m gc_agent.scripts.audit_transcripts
"""

from __future__ import annotations

from gc_agent.db.client import get_client


def _resolve_default_gc(client) -> str:
    try:
        from gc_agent.api.auth import DEFAULT_ESTIMATE_GC_ID

        if DEFAULT_ESTIMATE_GC_ID:
            return DEFAULT_ESTIMATE_GC_ID
    except Exception:
        pass

    resp = client.table("call_transcripts").select("gc_id").limit(1).execute()
    rows = resp.data or []
    return rows[0]["gc_id"] if rows else ""


def main() -> None:
    client = get_client()
    gc_id = _resolve_default_gc(client)
    if not gc_id:
        print("No gc_id found in call_transcripts.")
        return

    resp = (
        client.table("call_transcripts")
        .select("id,gc_id,job_id,created_at,metadata")
        .eq("gc_id", gc_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    transcripts = resp.data or []

    missing_job = [t for t in transcripts if not (t.get("job_id") or "").strip()]

    unlinked = []
    for t in transcripts:
        meta = t.get("metadata") if isinstance(t.get("metadata"), dict) else {}
        review_state = str(meta.get("review_state", "")).strip().lower()
        match_source = str(meta.get("match_source", "")).strip().lower()
        if review_state == "pending" or match_source == "unlinked":
            unlinked.append(t)

    resp = (
        client.table("draft_queue")
        .select("id,gc_id,created_at,type,status")
        .eq("gc_id", gc_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    drafts = resp.data or []

    print("GC:", gc_id)
    print("Recent transcripts:", len(transcripts))
    print("Transcripts missing job_id:", len(missing_job))
    print("Transcripts flagged unlinked/pending:", len(unlinked))
    print("Recent draft_queue items:", len(drafts))


if __name__ == "__main__":
    main()
