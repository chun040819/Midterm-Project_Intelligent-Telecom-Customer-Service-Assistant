import sqlite3

from backend.tests.conftest import call


def _count(db_path):
    return sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM plan_change_requests").fetchone()[0]


def test_unauthorized_write_is_rejected_without_insert(client, db_path):
    before = _count(db_path)
    r = call(client, "create_plan_change_request", {"quote_id": "Q-abc"})
    assert r.status_code == 409
    body = r.json()
    assert body["status"] == "error" and body["data"] is None
    assert body["error"]["code"] == "CONFIRMATION_REQUIRED"
    assert _count(db_path) == before


def test_authorization_fields_in_arguments_do_not_grant_write(client, db_path):
    before = _count(db_path)
    r = call(client, "create_plan_change_request", {"quote_id": "Q-abc", "confirmed": True})
    assert r.status_code == 422
    assert _count(db_path) == before
