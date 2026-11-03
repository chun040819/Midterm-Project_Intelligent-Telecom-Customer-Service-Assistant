"""明確啟用時，以雲端 embedding 驗證政策來源。"""
import os
from pathlib import Path

import pytest

from backend.rag import config
from backend.rag.index import build_index
from backend.rag.retriever import PolicyRetriever

KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


@pytest.fixture(scope="module")
def embedder():
    if os.environ.get('RUN_CLOUD_EMBEDDING_TESTS') != '1':
        pytest.skip('未啟用雲端 embedding 測試')
    from backend.rag.embedder import CloudEmbedder
    return CloudEmbedder()


@pytest.fixture(scope="module")
def retriever(embedder, tmp_path_factory):
    path = str(tmp_path_factory.mktemp("chroma"))
    build_index(KNOWLEDGE, path, embedder)
    return PolicyRetriever(path, embedder)


def refs(matches):
    return [f"{m['document_id']}#{m['section_id']}" for m in matches]


@pytest.mark.parametrize(
    "query,expected",
    [
        ("合約沒到期能降級嗎？", "plan_change_policy#downgrade_rules"),
        ("合約未到期可以降級嗎？", "plan_change_policy#downgrade_rules"),  # T14
        ("流量用完後會加收費用嗎？", "data_usage_policy#exceeded"),
        ("100 GB 用完怎樣？", "data_usage_policy#exceeded"),
        ("提前解約一定要付多少違約金？", "cancellation_policy#penalty_unknown"),  # E04
        ("合約到期怎麼算？", "contract_policy#contract_expiry"),
        ("為何 10 月是 499？", "billing_policy#monthly_fee"),  # SPEC §8.1 範例
    ],
)
def test_positive_questions_hit_expected_section(retriever, query, expected):
    assert expected in refs(retriever.search(query))


@pytest.mark.parametrize("query", ["你們有 5G 企業漫遊 8 折嗎？", "今天台北天氣如何？", "如何煮義大利麵？"])
def test_negative_questions_find_nothing(retriever, query):
    assert retriever.search(query) == []  # E04：不捏造優惠


