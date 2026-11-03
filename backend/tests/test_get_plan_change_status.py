import sqlite3

from backend.tests.conftest import call

NOT_FOUND = "目前查詢不到符合條件的資料，請確認查詢條件。"
KEYS = {"request_id", "old_plan_id", "new_plan_id", "status", "created_at"}


def test_latest_request_returns_each_seed_status(client):
    expected = {
        "C0002": ("R-SEED-001", "P499", "P699", "APPROVED", "2026-07-20T10:00:00+08:00"),
        "C0003": ("R-SEED-002", "P999", "P699", "REJECTED", "2026-10-20T10:00:00+08:00"),
        "C0004": ("R-SEED-003", "P699", "P499", "REJECTED", "2026-10-25T10:00:00+08:00"),
        "C0005": ("R-SEED-004", "P499", "P699", "PENDING", "2026-11-01T10:00:00+08:00"),
    }
    for customer, (rid, old, new, status, created) in expected.items():
        body = call(client, "get_plan_change_status", {}, customer=customer).json()
        assert body["status"] == "success" and body["error"] is None
        assert body["data"] == {
            "request_id": rid, "old_plan_id": old, "new_plan_id": new, "status": status, "created_at": created,
        }
        assert set(body["data"]) == KEYS  # 不外洩 quote_id／customer_id


def test_explicit_request_id_returns_own_record(client):
    body = call(client, "get_plan_change_status", {"request_id": "R-SEED-004"}, customer="C0005").json()
    assert body["status"] == "success" and body["data"]["status"] == "PENDING"


def test_customer_without_records_is_not_found(client):
    r = call(client, "get_plan_change_status", {}, customer="C0001")
    assert r.status_code == 404
    assert r.json() == {"status": "error", "data": None, "error": {"code": "NOT_FOUND", "message": NOT_FOUND}}


def test_other_customers_request_is_not_found_and_indistinguishable(client):
    other = call(client, "get_plan_change_status", {"request_id": "R-SEED-001"}, customer="C0001")
    missing = call(client, "get_plan_change_status", {"request_id": "R-NOPE"}, customer="C0001")
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()


def test_latest_orders_by_created_at_then_request_id_desc(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.executemany(
        "INSERT INTO plan_change_requests VALUES (?,?,?,?,?,?,?)",
        [
            ("R-A", "Q-A", "C0001", "P499", "P699", "REJECTED", "2026-09-01T10:00:00+08:00"),
            ("R-B", "Q-B", "C0001", "P499", "P699", "APPROVED", "2026-10-01T10:00:00+08:00"),
            ("R-C", "Q-C", "C0001", "P499", "P999", "REJECTED", "2026-10-01T10:00:00+08:00"),
            ("R-OLD", "Q-OLD", "C0001", "P499", "P699", "REJECTED", "2026-01-01T10:00:00+08:00"),
        ],
    )
    conn.commit()
    body = call(client, "get_plan_change_status", {}, customer="C0001").json()
    assert body["data"]["request_id"] == "R-C"  # 同時間以 request_id DESC
    # 指定較舊 ID 仍可查本人紀錄
    assert call(client, "get_plan_change_status", {"request_id": "R-A"}).json()["data"]["status"] == "REJECTED"


def test_invalid_arguments_rejected(client):
    for args in ({"customer_id": "C0002"}, {"request_id": ""}, {"request_id": "x" * 101}, {"request_id": None}, {"request_id": 5}):
        assert call(client, "get_plan_change_status", args).status_code == 422


def test_read_only_no_write(client, db_path):
    before = sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM plan_change_requests").fetchone()[0]
    call(client, "get_plan_change_status", {}, customer="C0005")
    assert sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM plan_change_requests").fetchone()[0] == before
