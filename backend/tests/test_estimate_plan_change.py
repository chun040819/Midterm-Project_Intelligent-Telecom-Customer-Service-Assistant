import sqlite3

from backend.tests.conftest import call

REAL_REFS = {
    "plan_change_policy#upgrade_rules", "plan_change_policy#downgrade_rules",
    "plan_change_policy#pending_rule", "plan_change_policy#review_rule",
}


def estimate(client, plan, customer="C0001"):
    return call(client, "estimate_plan_change", {"new_plan_id": plan}, customer=customer)


def test_t06_c0001_upgrade_to_p699(client):
    r = estimate(client, "P699")
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["eligible"] is True and d["reason_code"] is None
    assert (d["current_plan_id"], d["new_plan_id"]) == ("P499", "P699")
    assert (d["current_monthly_fee"], d["new_monthly_fee"], d["monthly_delta"]) == (499, 699, 200)
    assert d["quote_id"] is None and d["expires_at"] is None  # Quote 由 Next.js 建立
    assert d["policy_refs"] and set(d["policy_refs"]) <= REAL_REFS


def test_t10_downgrade_within_contract_is_ineligible(client):
    d = estimate(client, "P499", customer="C0004").json()["data"]
    assert d["eligible"] is False
    assert d["reason_code"] == "DOWNGRADE_BEFORE_CONTRACT_END"
    assert d["monthly_delta"] == -200 and d["quote_id"] is None
    assert "plan_change_policy#downgrade_rules" in d["policy_refs"]


def test_downgrade_on_contract_end_day_is_eligible(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE subscriptions SET contract_end_date='2026-11-03' WHERE customer_id='C0004'")
    conn.commit()
    d = estimate(client, "P499", customer="C0004").json()["data"]
    assert d["eligible"] is True and d["reason_code"] is None and d["monthly_delta"] == -200


def test_downgrade_after_contract_end_is_eligible(client):
    d = estimate(client, "P699", customer="C0003").json()["data"]  # C0003 合約 2026-10-31 已到期
    assert d["eligible"] is True and d["monthly_delta"] == -300


def test_same_plan_is_ineligible(client):
    d = estimate(client, "P499").json()["data"]
    assert d["eligible"] is False and d["reason_code"] == "SAME_PLAN" and d["monthly_delta"] == 0


def test_t11_existing_pending_is_conflict(client):
    r = estimate(client, "P699", customer="C0005")
    assert r.status_code == 409
    body = r.json()
    assert body["status"] == "error" and body["data"] is None and body["error"]["code"] == "CONFLICT"


def test_unknown_plan_not_found(client):
    r = estimate(client, "P123")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_inactive_plan_not_found(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE plans SET is_active=0 WHERE plan_id='P699'")
    conn.commit()
    assert estimate(client, "P699").json()["error"]["code"] == "NOT_FOUND"


def test_rejects_model_supplied_identity_and_bad_args(client):
    for args in ({}, {"new_plan_id": "P699", "customer_id": "C0002"}, {"new_plan_id": "699"}, {"new_plan_id": 699}):
        r = call(client, "estimate_plan_change", args)
        assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_internal_data_carries_subscription_id_for_quote_binding(client):
    assert estimate(client, "P699").json()["data"]["subscription_id"] == "S0001"


def test_estimate_never_writes(client, db_path):
    estimate(client, "P699")
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM plan_change_requests").fetchone()[0] == 4
    assert conn.execute("SELECT plan_id FROM subscriptions WHERE customer_id='C0001'").fetchone()[0] == "P499"
