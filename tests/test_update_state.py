from __future__ import annotations

import pytest

from gc_agent.nodes.update_state import update_state
from gc_agent.state import AgentState, Job, OpenItem, ParsedIntent


@pytest.mark.asyncio
async def test_update_state_classifies_change_order_open_items_from_description(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted_items: list[OpenItem] = []

    async def _fake_upsert_job(job: Job, gc_id: str) -> None:
        assert gc_id == "gc-demo"
        assert job.id == "job-1"

    async def _fake_insert_open_item(item: OpenItem, gc_id: str) -> None:
        assert gc_id == "gc-demo"
        inserted_items.append(item)

    monkeypatch.setattr("gc_agent.nodes.update_state.queries.upsert_job", _fake_upsert_job)
    monkeypatch.setattr("gc_agent.nodes.update_state.queries.insert_open_item", _fake_insert_open_item)

    state = AgentState(
        mode="update",
        gc_id="gc-demo",
        jobs=[
            Job(
                id="job-1",
                name="Miller Job",
                type="Roofing",
                status="active",
                address="101 Main St",
                contract_value=90000,
                contract_type="Lump Sum",
                est_completion="2026-12-01",
            )
        ],
        parsed_intent=ParsedIntent(
            understanding="Owner approved extra work that needs formal pricing.",
            new_open_items=[
                {
                    "job_id": "job-1",
                    "type": "",
                    "description": "Owner approved additional work and needs a change order before crews proceed.",
                    "owner": "PM",
                }
            ],
        ),
    )

    result = await update_state(state)

    updated_jobs = result["jobs"]
    assert isinstance(updated_jobs, list)
    assert len(updated_jobs) == 1
    assert updated_jobs[0].open_items[0].type == "CO"
    assert inserted_items[0].type == "CO"


@pytest.mark.asyncio
async def test_update_state_skips_duplicate_unresolved_open_items(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted_items: list[OpenItem] = []

    async def _fake_upsert_job(job: Job, gc_id: str) -> None:
        assert gc_id == "gc-demo"
        assert job.id == "job-1"

    async def _fake_insert_open_item(item: OpenItem, gc_id: str) -> None:
        _ = gc_id
        inserted_items.append(item)

    monkeypatch.setattr("gc_agent.nodes.update_state.queries.upsert_job", _fake_upsert_job)
    monkeypatch.setattr("gc_agent.nodes.update_state.queries.insert_open_item", _fake_insert_open_item)

    state = AgentState(
        mode="update",
        gc_id="gc-demo",
        jobs=[
            Job(
                id="job-1",
                name="Miller Job",
                type="Roofing",
                status="active",
                address="101 Main St",
                contract_value=90000,
                contract_type="Lump Sum",
                est_completion="2026-12-01",
                open_items=[
                    OpenItem(
                        id="open-1",
                        job_id="job-1",
                        type="approval",
                        description="Owner approval needed on added work before crews proceed.",
                        owner="PM",
                    )
                ],
            )
        ],
        parsed_intent=ParsedIntent(
            understanding="Same unresolved approval came up again on today's call.",
            new_open_items=[
                {
                    "job_id": "job-1",
                    "type": "",
                    "description": "Owner approval needed on added work before crews proceed.",
                    "owner": "PM",
                }
            ],
        ),
    )

    result = await update_state(state)

    updated_jobs = result["jobs"]
    assert isinstance(updated_jobs, list)
    assert len(updated_jobs) == 1
    assert len(updated_jobs[0].open_items) == 1
    assert inserted_items == []
