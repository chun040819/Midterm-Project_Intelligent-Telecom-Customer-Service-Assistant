import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.tests.conftest import TOKEN, call

TOOL_NAMES = [
    "get_my_subscription", "get_my_bill", "search_policy", "list_plans",
    "get_my_usage", "estimate_plan_change", "create_plan_change_request", "get_plan_change_status",
]
VALID_ARGS = {
    "get_my_subscription": {}, "get_my_bill": {}, "search_policy": {"query": "q"}, "list_plans": {},
    "get_my_usage": {}, "estimate_plan_change": {"new_plan_id": "P699"},
    "create_plan_change_request": {"quote_id": "Q-1"}, "get_plan_change_status": {},
}
VALIDATION = {"status": "error", "data": None, "error": {"code": "VALIDATION_ERROR", "message": "工具參數無效。"}}


@pytest.mark.parametrize("tool", TOOL_NAMES)
def test_every_tool_rejects_extra_fields_with_envelope(client, tool):
    """E07：任何工具多出 customer_id（或其他欄位）一律 422 Envelope，與 Zod strict 對應。"""
    r = call(client, tool, {**VALID_ARGS[tool], "customer_id": "C0002"})
    assert r.status_code == 422
    assert r.json() == VALIDATION


def test_unhandled_handler_error_is_a_500_envelope(db_path, monkeypatch):
    """E08：FastAPI 內部例外也回統一 Envelope（SPEC §6.4），不外洩例外內容。"""

    def boom(*_args):
        raise RuntimeError("secret internal detail")

    monkeypatch.setitem(main.TOOLS, "list_plans", (main.PlansArguments, boom))
    c = TestClient(main.create_app(db_path=db_path, internal_token=TOKEN), raise_server_exceptions=False)
    r = call(c, "list_plans", {})
    assert r.status_code == 500
    body = r.json()
    assert body["status"] == "error" and body["data"] is None
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "secret" not in r.text
