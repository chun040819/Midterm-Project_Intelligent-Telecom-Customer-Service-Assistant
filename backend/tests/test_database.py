import sqlite3

import pytest

from backend.db.seed import connect


def rows(db_path, sql):
    with connect(db_path) as conn:
        return conn.execute(sql).fetchall()


def test_seed_row_counts(db_path):
    counts = {
        t: rows(db_path, f"SELECT COUNT(*) FROM {t}")[0][0]
        for t in ("customers", "plans", "subscriptions", "bills", "usage_records", "plan_change_requests")
    }
    assert counts == {
        "customers": 5, "plans": 4, "subscriptions": 5,
        "bills": 15, "usage_records": 15, "plan_change_requests": 4,
    }


def test_seed_c0001_is_p499_until_2027_06_30(db_path):
    assert rows(
        db_path,
        "SELECT plan_id, contract_end_date FROM subscriptions WHERE customer_id='C0001'",
    )[0][:] == ("P499", "2027-06-30")


def test_seed_c0005_has_the_only_pending_request(db_path):
    assert rows(db_path, "SELECT customer_id FROM plan_change_requests WHERE status='PENDING'") == [("C0005",)]


def test_second_pending_for_same_customer_is_rejected(db_path):
    with connect(db_path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO plan_change_requests VALUES ('R-X','Q-X','C0005','P499','P999','PENDING','2026-11-03T10:00:00+08:00')"
            )


def test_duplicate_quote_is_rejected(db_path):
    with connect(db_path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO plan_change_requests VALUES ('R-X','Q-SEED-001','C0001','P499','P699','PENDING','2026-11-03T10:00:00+08:00')"
            )


def test_same_plan_request_is_rejected_by_check(db_path):
    with connect(db_path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO plan_change_requests VALUES ('R-X','Q-X','C0001','P499','P499','PENDING','2026-11-03T10:00:00+08:00')"
            )


def test_foreign_key_is_enforced(db_path):
    with connect(db_path) as conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO subscriptions VALUES ('S9','C9999','P499','2027-01-01')")


def test_reset_is_repeatable(db_path):
    from backend.db.seed import reset_db

    with connect(db_path) as conn:
        conn.execute("DELETE FROM bills")
    reset_db(db_path)
    assert rows(db_path, "SELECT COUNT(*) FROM bills") == [(15,)]


def _dump(db_path):
    tables = ["plans", "customers", "subscriptions", "bills", "usage_records", "plan_change_requests"]
    return {t: rows(db_path, f"SELECT * FROM {t} ORDER BY 1") for t in tables}


def test_e09_reset_removes_new_request_and_restores_four_seed_requests(client, db_path):
    from backend.db.seed import reset_db

    baseline = _dump(db_path)
    with connect(db_path) as conn:
        conn.execute(
            "INSERT INTO plan_change_requests VALUES ('R-NEW','Q-NEW','C0001','P499','P699','PENDING','2026-11-03T10:00:00+08:00')"
        )
        conn.execute("UPDATE subscriptions SET plan_id='P999' WHERE customer_id='C0002'")
        conn.execute("UPDATE bills SET amount=1 WHERE bill_id='B-C0001-202610'")
    assert len(rows(db_path, "SELECT * FROM plan_change_requests")) == 5

    reset_db(db_path)

    assert _dump(db_path) == baseline
    assert [r[0] for r in rows(db_path, "SELECT request_id FROM plan_change_requests ORDER BY 1")] == [
        "R-SEED-001", "R-SEED-002", "R-SEED-003", "R-SEED-004",
    ]
    assert rows(
        db_path, "SELECT COUNT(*) FROM plan_change_requests WHERE customer_id='C0001' AND status='PENDING'"
    ) == [(0,)]
    # Reset 後 C0001 可重新評估升級（沒有 Pending 衝突）
    from backend.tests.conftest import call
    r = call(client, "estimate_plan_change", {"new_plan_id": "P699"})
    assert r.status_code == 200 and r.json()["data"]["eligible"] is True
