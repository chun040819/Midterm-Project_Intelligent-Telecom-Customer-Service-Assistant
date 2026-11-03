"""POST /internal/tools/search_policy 的 API 行為（假 Embedder + 真實 knowledge 文件）。"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app
from backend.rag.index import build_index
from backend.rag.retriever import PolicyRetriever, PolicySearchError
from backend.tests.conftest import TOKEN, call
from backend.tests.test_policy_retriever import FakeEmbedder

KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


@pytest.fixture
def policy_client(db_path, tmp_path):
    emb = FakeEmbedder()
    chroma = str(tmp_path / "chroma")
    build_index(KNOWLEDGE, chroma, emb)
    retriever = PolicyRetriever(chroma, emb, max_distance=0.75)
    return TestClient(create_app(db_path=db_path, internal_token=TOKEN, policy_retriever=retriever))


def test_returns_matches_with_real_source_refs(policy_client):
    r = call(policy_client, "search_policy", {"query": "合約未到期可以降級嗎？"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success" and body["error"] is None
    refs = [(m["document_id"], m["section_id"]) for m in body["data"]["matches"]]
    assert ("plan_change_policy", "downgrade_rules") in refs
    assert len(refs) <= 3
    for m in body["data"]["matches"]:
        assert (KNOWLEDGE.parent / m["source_path"]).is_file()


def test_unrelated_question_is_insufficient_evidence(policy_client):
    r = call(policy_client, "search_policy", {"query": "zzzz qqqq xxxx"})
    assert r.status_code == 422
    body = r.json()
    assert body["status"] == "error" and body["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    assert body["data"] is None


@pytest.mark.parametrize("args", [{}, {"query": ""}, {"query": "x" * 501}, {"query": "a", "k": 9}])
def test_invalid_arguments_rejected(policy_client, args):
    r = call(policy_client, "search_policy", args)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_requires_internal_token(policy_client):
    assert call(policy_client, "search_policy", {"query": "降級"}, token=None).status_code == 403


def test_retrieval_failure_is_internal_error_not_fake_success(db_path):
    class Boom:
        def search(self, q):
            raise PolicySearchError("索引不存在")

    c = TestClient(create_app(db_path=db_path, internal_token=TOKEN, policy_retriever=Boom()))
    r = call(c, "search_policy", {"query": "降級"})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"
