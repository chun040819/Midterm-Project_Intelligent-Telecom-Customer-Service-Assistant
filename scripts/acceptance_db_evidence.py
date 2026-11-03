"""產生 T07–T09、E09 的 DB 前後證據。只使用暫時 SQLite，不碰 Demo DB。

用法：.venv/bin/python -m scripts.acceptance_db_evidence
"""
import os
import tempfile

from fastapi.testclient import TestClient

from backend.db.seed import connect, reset_db
from backend.main import create_app

TOKEN = "acceptance-token"
HEAD = {"X-Internal-Token": TOKEN, "X-Demo-Customer-Id": "C0001"}


def snapshot(db: str) -> dict:
    with connect(db) as c:
        return {
            "C0001 requests": c.execute(
                "SELECT request_id, quote_id, status FROM plan_change_requests WHERE customer_id='C0001'"
            ).fetchall(),
            "all requests": c.execute("SELECT COUNT(*) FROM plan_change_requests").fetchone()[0],
            "C0001 subscription plan": c.execute(
                "SELECT plan_id FROM subscriptions WHERE customer_id='C0001'"
            ).fetchone()[0],
        }


def call(client, tool, args):
    r = client.post(f"/internal/tools/{tool}", json={"arguments": args}, headers=HEAD)
    return r.status_code, r.json()


def confirm_action(client, body):
    r = client.post("/internal/actions/confirm_plan_change", json=body, headers=HEAD)
    return r.status_code, r.json()


def main() -> None:
    with tempfile.TemporaryDirectory() as d:
        db = os.path.join(d, "evidence.sqlite3")
        reset_db(db)
        client = TestClient(create_app(db_path=db, internal_token=TOKEN))
        print("== 起始（Reset 後）", snapshot(db))
        _, est = call(client, "estimate_plan_change", {"new_plan_id": "P699"})
        print("== T06 estimate eligible/delta", est["data"]["eligible"], est["data"]["monthly_delta"])
        print("== T07/確認前（estimate 不寫入）", snapshot(db))
        confirm = {"quote_id": "Q-ACCEPT-1", "subscription_id": "S0001", "old_plan_id": "P499", "new_plan_id": "P699"}
        s1, r1 = confirm_action(client, confirm)
        print("== T08 第一次確認", s1, r1.get("data"), snapshot(db))
        s2, r2 = confirm_action(client, confirm)
        print("== T09 重複確認", s2, r2.get("data"), snapshot(db))
        reset_db(db)
        print("== E09 Reset 後", snapshot(db))


if __name__ == "__main__":
    main()
