import sqlite3
import threading

from backend.tests.conftest import TOKEN

ACTION = "/internal/actions/confirm_plan_change"
LOOKUP = "/internal/actions/find_plan_change_request"

QUOTE = {
    "quote_id": "Q-test-1", "subscription_id": "S0001", "old_plan_id": "P499", "new_plan_id": "P699",
}


def confirm(client, body=None, customer="C0001", token=TOKEN):
    headers = {}
    if token is not None:
        headers["X-Internal-Token"] = token
    if customer is not None:
        headers["X-Demo-Customer-Id"] = customer
    return client.post(ACTION, json=body if body is not None else QUOTE, headers=headers)


def lookup(client, quote_id="Q-test-1", customer="C0001"):
    return client.post(
        LOOKUP, json={"quote_id": quote_id},
        headers={"X-Internal-Token": TOKEN, "X-Demo-Customer-Id": customer},
    )


def rows(db_path, sql="SELECT * FROM plan_change_requests"):
    return sqlite3.connect(db_path).execute(sql).fetchall()


def test_t08_creates_exactly_one_pending_and_keeps_subscription(client, db_path):
    before = len(rows(db_path))
    r = confirm(client)
    assert r.status_code == 201
    data = r.json()["data"]
    assert data["status"] == "PENDING" and data["already_existed"] is False
    assert data["old_plan_id"] == "P499" and data["new_plan_id"] == "P699" and data["quote_id"] == "Q-test-1"
    assert len(rows(db_path)) == before + 1
    stored = rows(db_path, f"SELECT request_id, status FROM plan_change_requests WHERE request_id='{data['request_id']}'")
    assert stored == [(data["request_id"], "PENDING")]
    assert rows(db_path, "SELECT plan_id FROM subscriptions WHERE customer_id='C0001'") == [("P499",)]


def test_t09_same_quote_returns_same_request_without_new_row(client, db_path):
    first = confirm(client).json()["data"]
    again = confirm(client)
    assert again.status_code == 200
    data = again.json()["data"]
    assert data["request_id"] == first["request_id"] and data["already_existed"] is True
    assert len(rows(db_path, "SELECT * FROM plan_change_requests WHERE customer_id='C0001'")) == 1


def test_other_quote_conflicts_with_existing_pending(client, db_path):
    confirm(client)
    r = confirm(client, {**QUOTE, "quote_id": "Q-test-2"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert len(rows(db_path, "SELECT * FROM plan_change_requests WHERE customer_id='C0001'")) == 1


def test_existing_seed_pending_blocks(client, db_path):
    r = confirm(client, {**QUOTE, "subscription_id": "S0005", "old_plan_id": "P499"}, customer="C0005")
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


def test_stale_subscription_or_plan_rejected(client, db_path):
    sqlite3.connect(db_path).execute("UPDATE subscriptions SET plan_id='P699' WHERE customer_id='C0001'").connection.commit()
    before = len(rows(db_path))
    r = confirm(client)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    r = confirm(client, {**QUOTE, "subscription_id": "S0002"})
    assert r.status_code == 409
    assert len(rows(db_path)) == before


def test_invalid_target_and_ineligible_rejected(client, db_path):
    before = len(rows(db_path))
    assert confirm(client, {**QUOTE, "new_plan_id": "P777"}).status_code == 404
    sqlite3.connect(db_path).execute("UPDATE plans SET is_active=0 WHERE plan_id='P699'").connection.commit()
    assert confirm(client).status_code == 404
    assert confirm(client, {**QUOTE, "new_plan_id": "P499"}).status_code == 409  # 同方案
    # 合約內降級（C0001 合約至 2027-06-30）
    sqlite3.connect(db_path).execute("UPDATE subscriptions SET plan_id='P699' WHERE customer_id='C0001'").connection.commit()
    r = confirm(client, {**QUOTE, "old_plan_id": "P699", "new_plan_id": "P299"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"
    assert len(rows(db_path)) == before


def test_auth_and_validation(client, db_path):
    before = len(rows(db_path))
    assert confirm(client, token="wrong").status_code == 403
    assert confirm(client, token=None).status_code == 403
    assert confirm(client, customer="C9999").status_code == 403
    assert confirm(client, {**QUOTE, "confirmed": True}).status_code == 422
    assert confirm(client, {"quote_id": "Q-x"}).status_code == 422
    assert len(rows(db_path)) == before


def test_quote_of_another_customer_is_not_returned(client, db_path):
    confirm(client)
    r = confirm(client, {**QUOTE, "subscription_id": "S0002", "old_plan_id": "P699", "new_plan_id": "P999"}, customer="C0002")
    assert r.status_code == 409  # 同一 quote_id 已屬他人：不回傳他人紀錄
    assert "request_id" not in r.text


def test_lookup_only_returns_own_customers_record(client, db_path):
    created = confirm(client).json()["data"]
    found = lookup(client)
    assert found.status_code == 200
    assert found.json()["data"]["request_id"] == created["request_id"]
    assert found.json()["data"]["already_existed"] is True
    assert lookup(client, customer="C0002").status_code == 404
    assert lookup(client, "Q-none").status_code == 404
    assert len(rows(db_path, "SELECT * FROM plan_change_requests WHERE customer_id='C0001'")) == 1


def test_concurrent_confirms_create_one_row(client, db_path):
    results = []

    def go(quote_id):
        results.append(confirm(client, {**QUOTE, "quote_id": quote_id}).status_code)

    threads = [threading.Thread(target=go, args=("Q-test-1" if i % 2 else f"Q-other-{i}",)) for i in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(rows(db_path, "SELECT * FROM plan_change_requests WHERE customer_id='C0001'")) == 1
    assert results.count(201) == 1
    assert set(results) <= {200, 201, 409}
