import sqlite3

import pytest

from backend.tests.conftest import call


def bill(client, args=None, customer="C0001"):
    return call(client, "get_my_bill", args, customer=customer)


def test_specific_month_matches_database(client, db_path):
    r = bill(client, {"billing_month": "2026-10"})
    assert r.status_code == 200
    row = sqlite3.connect(db_path).execute(
        "SELECT bill_id, billing_month, amount, due_date, payment_status FROM bills "
        "WHERE customer_id='C0001' AND billing_month='2026-10'"
    ).fetchone()
    assert r.json() == {
        "status": "success",
        "data": dict(zip(["bill_id", "billing_month", "amount", "due_date", "payment_status"], row)),
        "error": None,
    }
    assert r.json()["data"] == {
        "bill_id": "B-C0001-202610", "billing_month": "2026-10",
        "amount": 499, "due_date": "2026-11-15", "payment_status": "UNPAID",
    }


def test_omitted_month_uses_latest_month_with_data(client):
    assert bill(client).json()["data"]["billing_month"] == "2026-10"
    assert bill(client, {}).json()["data"]["billing_month"] == "2026-10"


def test_latest_month_follows_data_not_fixed_value(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM bills WHERE customer_id='C0001' AND billing_month='2026-10'")
    conn.commit()
    assert bill(client).json()["data"]["billing_month"] == "2026-09"


def test_missing_month_is_not_found_and_does_not_borrow_other_month(client):
    r = bill(client, {"billing_month": "2026-11"})
    assert r.status_code == 404
    assert r.json() == {
        "status": "error", "data": None,
        "error": {"code": "NOT_FOUND", "message": r.json()["error"]["message"]},
    }


def test_customer_without_any_bill_is_not_found(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM bills WHERE customer_id='C0002'")
    conn.commit()
    assert bill(client, customer="C0002").status_code == 404


def test_bill_belongs_to_session_customer(client):
    assert bill(client, {"billing_month": "2026-10"}, customer="C0003").json()["data"]["bill_id"] == "B-C0003-202610"
    assert bill(client, {"billing_month": "2026-10"}, customer="C0003").json()["data"]["amount"] == 999


@pytest.mark.parametrize("args", [
    {"billing_month": "2026-13"},
    {"billing_month": "2026-00"},
    {"billing_month": "202610"},
    {"billing_month": "2026-1"},
    {"billing_month": "2026-10 "},
    {"billing_month": "2026-10\n"},
    {"billing_month": ""},
    {"billing_month": None},
    {"billing_month": 202610},
    {"billing_month": "2026-10", "customer_id": "C0002"},
    {"customer_id": "C0002"},
])
def test_invalid_input_is_validation_error_not_omitted(client, args):
    r = bill(client, args)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert r.json()["data"] is None
