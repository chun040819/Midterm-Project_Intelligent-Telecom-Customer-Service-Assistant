import sqlite3

import pytest

from backend.tests.conftest import call


def usage(client, args=None, customer="C0001"):
    return call(client, "get_my_usage", args, customer=customer)


def test_t03_c0001_october(client):
    r = usage(client, {"month": "2026-10"})
    assert r.status_code == 200
    assert r.json() == {
        "status": "success",
        "data": {
            "month": "2026-10", "data_limit_gb": 25, "data_used_gb": 17.8,
            "remaining_data_gb": 7.2, "exceeded_data_gb": 0, "voice_used_minutes": 42,
        },
        "error": None,
    }


def test_t12_c0003_exceeded(client):
    d = usage(client, {"month": "2026-10"}, customer="C0003").json()["data"]
    assert (d["data_limit_gb"], d["data_used_gb"]) == (100, 105)
    assert (d["remaining_data_gb"], d["exceeded_data_gb"]) == (0, 5)
    assert d["voice_used_minutes"] == 175


def test_near_limit_c0002(client):
    d = usage(client, {"month": "2026-10"}, customer="C0002").json()["data"]
    assert (d["data_limit_gb"], d["data_used_gb"]) == (60, 58)
    assert (d["remaining_data_gb"], d["exceeded_data_gb"]) == (2, 0)


def test_exactly_at_limit_has_no_negative_values(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE usage_records SET data_used_gb=25 WHERE customer_id='C0001' AND month='2026-10'")
    conn.commit()
    d = usage(client, {"month": "2026-10"}).json()["data"]
    assert (d["remaining_data_gb"], d["exceeded_data_gb"]) == (0, 0)


def test_historical_month_matches_database(client, db_path):
    d = usage(client, {"month": "2026-08"}).json()["data"]
    row = sqlite3.connect(db_path).execute(
        "SELECT data_used_gb, voice_used_minutes FROM usage_records WHERE customer_id='C0001' AND month='2026-08'"
    ).fetchone()
    assert (d["data_used_gb"], d["voice_used_minutes"]) == row == (14.2, 31)
    assert d["remaining_data_gb"] == 10.8


def test_omitted_month_uses_latest_with_data(client, db_path):
    assert usage(client).json()["data"]["month"] == "2026-10"
    assert usage(client, {}).json()["data"]["month"] == "2026-10"
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM usage_records WHERE customer_id='C0001' AND month='2026-10'")
    conn.commit()
    assert usage(client).json()["data"]["month"] == "2026-09"


def test_missing_month_uses_system_prompt_fixed_sentence(client):
    body = usage(client, {"month": "2026-11"}).json()
    assert body["error"]["message"] == "目前查詢不到符合條件的資料，請確認查詢條件。"


def test_t04_no_november_data(client):
    r = usage(client, {"month": "2026-11"})
    assert r.status_code == 404
    body = r.json()
    assert body["status"] == "error" and body["data"] is None
    assert body["error"]["code"] == "NOT_FOUND"


def test_customer_without_usage_is_not_found(client, db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM usage_records WHERE customer_id='C0002'")
    conn.commit()
    assert usage(client, customer="C0002").status_code == 404


def test_result_has_no_invented_fields(client):
    assert set(usage(client).json()["data"]) == {
        "month", "data_limit_gb", "data_used_gb", "remaining_data_gb", "exceeded_data_gb", "voice_used_minutes",
    }


@pytest.mark.parametrize("args", [
    {"month": "2026-13"}, {"month": "2026-00"}, {"month": "202610"}, {"month": "2026-1"},
    {"month": "2026-10\n"}, {"month": ""}, {"month": None}, {"month": 202610},
    {"month": "2026-10", "customer_id": "C0002"}, {"billing_month": "2026-10"},
])
def test_invalid_input_is_validation_error(client, args):
    r = usage(client, args)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert r.json()["data"] is None
