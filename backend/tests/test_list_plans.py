import sqlite3

import pytest

from backend.tests.conftest import call


def plans(client, args=None, customer="C0001"):
    return call(client, "list_plans", args, customer=customer)


def test_returns_all_active_plans_matching_seed(client):
    r = plans(client)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success" and body["error"] is None
    got = {p["plan_id"]: (p["monthly_fee"], p["data_limit_gb"]) for p in body["data"]["plans"]}
    assert got == {"P299": (299, 8), "P499": (499, 25), "P699": (699, 60), "P999": (999, 100)}
    assert all(p["is_active"] is True for p in body["data"]["plans"])


def test_inactive_plan_is_never_returned(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE plans SET is_active=0 WHERE plan_id='P699'")
    conn.commit()
    ids = [p["plan_id"] for p in plans(client).json()["data"]["plans"]]
    assert "P699" not in ids and len(ids) == 3


def test_max_monthly_fee_filters_inclusive(client):
    ids = [p["plan_id"] for p in plans(client, {"max_monthly_fee": 699}).json()["data"]["plans"]]
    assert ids == ["P299", "P499", "P699"]


def test_no_match_is_success_with_empty_list(client):
    r = plans(client, {"max_monthly_fee": 0})
    assert r.status_code == 200
    assert r.json() == {"status": "success", "data": {"plans": []}, "error": None}


@pytest.mark.parametrize("args", [
    {"max_monthly_fee": -1},
    {"max_monthly_fee": 499.5},
    {"max_monthly_fee": "499"},
    {"max_monthly_fee": None},
    {"max_monthly_fee": True},
    {"customer_id": "C0002"},
])
def test_invalid_input_is_validation_error(client, args):
    r = plans(client, args)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
