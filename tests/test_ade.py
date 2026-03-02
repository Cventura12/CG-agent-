"""LandingAI ADE integration tests for Day 10."""

from __future__ import annotations

import importlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from gc_agent.state import AgentState
from gc_agent.tools import ade

ingest_node = importlib.import_module("gc_agent.nodes.ingest")


def _install_fake_landingai_module(
    monkeypatch: pytest.MonkeyPatch,
    expected_extension: str,
    *,
    markdown: str = "",
    chunk_content: str = "",
) -> None:
    """Install a fake landingai_ade module for deterministic parse tests."""

    class _FakeClient:
        def parse(self, document: Path, model: str) -> object:
            assert document.suffix.lower() == expected_extension
            assert model == "dpt-2-latest"
            chunks = []
            if chunk_content:
                chunks.append(SimpleNamespace(content=chunk_content))
            return SimpleNamespace(markdown=markdown, chunks=chunks)

    monkeypatch.setitem(
        __import__("sys").modules,
        "landingai_ade",
        SimpleNamespace(LandingAIADE=_FakeClient),
    )


def test_ade_parses_xactimate_scope_pdf(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Xactimate scopes should preserve line items, quantities, and totals."""
    monkeypatch.setenv("VISION_AGENT_API_KEY", "test-key")
    xactimate_pdf = tmp_path / "xactimate_scope.pdf"
    xactimate_pdf.write_text("placeholder", encoding="utf-8")
    xactimate_markdown = (
        "# Xactimate Scope\n"
        "| Line Item | Qty | Total |\n"
        "| --- | ---: | ---: |\n"
        "| Tear off comp shingles | 32.0 SQ | $12,480.00 |\n"
        "| Synthetic underlayment | 32.0 SQ | $1,920.00 |\n"
    )
    _install_fake_landingai_module(
        monkeypatch,
        ".pdf",
        markdown=xactimate_markdown,
    )

    result = ade.parse_document(xactimate_pdf)

    assert "Tear off comp shingles" in result.prompt_text
    assert "32.0 SQ" in result.prompt_text
    assert "$12,480.00" in result.prompt_text


def test_ade_parses_supplier_invoice_pdf(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Supplier invoices should keep aligned table columns in markdown output."""
    monkeypatch.setenv("VISION_AGENT_API_KEY", "test-key")
    invoice_pdf = tmp_path / "supplier_invoice.pdf"
    invoice_pdf.write_text("placeholder", encoding="utf-8")
    invoice_markdown = (
        "# Supplier Invoice\n"
        "| SKU | Description | Qty | Unit Price | Extended |\n"
        "| --- | --- | ---: | ---: | ---: |\n"
        "| SHG-30 | Atlas Pinnacle Pristine | 20 | 145.00 | 2900.00 |\n"
        "| DRP-10 | Ice & Water Shield | 4 | 82.50 | 330.00 |\n"
    )
    _install_fake_landingai_module(
        monkeypatch,
        ".pdf",
        markdown=invoice_markdown,
    )

    result = ade.parse_document(invoice_pdf)

    assert "| SKU | Description | Qty | Unit Price | Extended |" in result.prompt_text
    assert "Atlas Pinnacle Pristine" in result.prompt_text
    assert "| DRP-10 | Ice & Water Shield | 4 | 82.50 | 330.00 |" in result.prompt_text


def test_ade_parses_jobsite_photo_jpeg(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Jobsite photos should fall back to chunk content when markdown is empty."""
    monkeypatch.setenv("VISION_AGENT_API_KEY", "test-key")
    photo = tmp_path / "roof_photo.jpg"
    photo.write_bytes(b"fake-jpeg")
    photo_description = (
        "Steep laminated shingle roof with missing ridge cap, visible hail bruising, "
        "damaged step flashing, and a detached chimney cricket."
    )
    _install_fake_landingai_module(
        monkeypatch,
        ".jpg",
        markdown="",
        chunk_content=photo_description,
    )

    result = ade.parse_document(photo)

    assert result.markdown == photo_description
    assert "laminated shingle roof" in result.prompt_text
    assert "hail bruising" in result.prompt_text
    assert "chimney cricket" in result.prompt_text


@pytest.mark.asyncio
async def test_ingest_routes_pdf_through_ade_before_claude(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Estimate ingest should send ADE markdown into the Claude normalization prompt."""
    monkeypatch.setenv("VISION_AGENT_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    source_pdf = tmp_path / "insurance_scope.pdf"
    source_pdf.write_text("placeholder", encoding="utf-8")

    ade_markdown = (
        "# Insurance Scope\n"
        "| Item | Qty | Total |\n"
        "| Ridge cap | 180 LF | $540.00 |\n"
    )
    _install_fake_landingai_module(
        monkeypatch,
        ".pdf",
        markdown=ade_markdown,
    )

    captured: dict[str, str] = {}

    async def _fake_call_claude(system: str, user: str, max_tokens: int = 600) -> str:
        captured["system"] = system
        captured["user"] = user
        captured["max_tokens"] = str(max_tokens)
        return "normalized ade text"

    monkeypatch.setattr(ingest_node, "_call_claude", _fake_call_claude)

    state = AgentState(
        raw_input=str(source_pdf),
        mode="estimate",
    )

    result = await ingest_node.ingest(state)

    assert result["cleaned_input"] == "normalized ade text"
    assert "Ridge cap" in captured["user"]
    assert "$540.00" in captured["user"]
