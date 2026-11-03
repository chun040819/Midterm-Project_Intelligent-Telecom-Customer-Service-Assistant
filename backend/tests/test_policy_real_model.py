"""真模型（intfloat/multilingual-e5-small）驗證：來源對照、512 token、校準閾值。

模型無法載入（無網路／未快取）時整檔 skip，並明確寫出原因，不當作通過。
"""
from pathlib import Path

import pytest

from backend.rag import config
from backend.rag.chunks import load_chunks
from backend.rag.index import build_index
from backend.rag.retriever import PolicyRetriever

KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


@pytest.fixture(scope="module")
def embedder():
    try:
        from backend.rag.embedder import E5Embedder

        return E5Embedder()
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"真模型無法載入，未驗證：{e}")


@pytest.fixture(scope="module")
def retriever(embedder, tmp_path_factory):
    path = str(tmp_path_factory.mktemp("chroma"))
    build_index(KNOWLEDGE, path, embedder)
    return PolicyRetriever(path, embedder)


def refs(matches):
    return [f"{m['document_id']}#{m['section_id']}" for m in matches]


def test_every_chunk_within_512_tokens(embedder):
    for c in load_chunks(KNOWLEDGE):
        assert embedder.count_tokens(f"passage: {c.content}") <= 512, c.chunk_id


@pytest.mark.parametrize(
    "query,expected",
    [
        ("合約沒到期能降級嗎？", "plan_change_policy#downgrade_rules"),
        ("合約未到期可以降級嗎？", "plan_change_policy#downgrade_rules"),  # T14
        ("流量用完後會加收費用嗎？", "data_usage_policy#exceeded"),
        ("100 GB 用完怎樣？", "data_usage_policy#exceeded"),
        ("提前解約一定要付多少違約金？", "cancellation_policy#penalty_unknown"),  # E04
        ("合約到期怎麼算？", "contract_policy#contract_expiry"),
    ],
)
def test_positive_questions_hit_expected_section(retriever, query, expected):
    assert expected in refs(retriever.search(query))


@pytest.mark.parametrize("query", ["你們有 5G 企業漫遊 8 折嗎？", "今天台北天氣如何？", "如何煮義大利麵？"])
def test_negative_questions_find_nothing(retriever, query):
    assert retriever.search(query) == []  # E04：不捏造優惠


def test_threshold_is_calibrated():
    assert config.MAX_DISTANCE == 0.14
