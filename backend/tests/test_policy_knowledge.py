"""knowledge/*.md 切片：六份文件、規格章節 ID 與來源 metadata（SPEC §8.1、§8.2）。"""
from pathlib import Path

import pytest

from backend.rag.chunks import load_chunks

KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"

REQUIRED_SECTIONS = {
    "contract_policy": {"contract_period", "contract_expiry"},
    "plan_change_policy": {"upgrade_rules", "downgrade_rules", "pending_rule", "review_rule"},
    "billing_policy": {"monthly_fee", "billing_records", "payment_scope"},
    "data_usage_policy": {"quota", "exceeded", "historical_usage"},
    "cancellation_policy": {"cancellation_general", "cancellation_scope", "penalty_unknown"},
    "faq": {"billing_faq", "usage_faq", "plan_faq", "request_faq"},
}


def test_six_documents_with_all_required_section_ids():
    found: dict[str, set[str]] = {}
    for c in load_chunks(KNOWLEDGE):
        found.setdefault(c.document_id, set()).add(c.section_id)
    assert found == REQUIRED_SECTIONS


def test_chunk_carries_full_source_metadata():
    chunks = {(c.document_id, c.section_id): c for c in load_chunks(KNOWLEDGE)}
    c = chunks[("plan_change_policy", "downgrade_rules")]
    assert c.chunk_id == "plan_change_policy#downgrade_rules"
    assert c.title == "方案變更政策"
    assert c.section_title == "降級申請條件"
    assert c.source_path == "knowledge/plan_change_policy.md"
    assert "不得提出降級申請" in c.content


def test_no_chunk_leaks_absolute_paths_or_heading_markup():
    for c in load_chunks(KNOWLEDGE):
        assert not c.source_path.startswith("/")
        assert "{#" not in c.content and "{#" not in c.section_title


def test_section_without_id_is_rejected(tmp_path):
    (tmp_path / "bad.md").write_text("# 標題\n\n## 沒有 ID 的章節\n\n內容\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_chunks(tmp_path)
