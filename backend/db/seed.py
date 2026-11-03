"""固定、可重複的 Seed 資料（SPEC §4）。`python -m backend.db.seed` 即 reset-demo 的 DB 部分。"""
import os
import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")

PLANS = [
    ("P299", "基礎型", 299, 8, 30, 1),
    ("P499", "標準型", 499, 25, 80, 1),
    ("P699", "進階型", 699, 60, 150, 1),
    ("P999", "尊榮型", 999, 100, 300, 1),
]

# customer_id, display_name, subscription_id, plan_id, contract_end_date
CUSTOMERS = [
    ("C0001", "Demo 客戶 A", "S0001", "P499", "2027-06-30"),
    ("C0002", "Demo 客戶 B", "S0002", "P699", "2027-03-31"),
    ("C0003", "Demo 客戶 C", "S0003", "P999", "2026-10-31"),
    ("C0004", "Demo 客戶 D", "S0004", "P699", "2026-11-10"),
    ("C0005", "Demo 客戶 E", "S0005", "P499", "2027-01-31"),
]

MONTHS = ["2026-08", "2026-09", "2026-10"]
DUE_DATES = {"2026-08": "2026-09-15", "2026-09": "2026-10-15", "2026-10": "2026-11-15"}

# customer -> [(data_used_gb, voice_used_minutes)] 依 MONTHS 順序
USAGE = {
    "C0001": [(14.2, 31), (16.5, 39), (17.8, 42)],
    "C0002": [(44, 91), (53, 126), (58, 140)],
    "C0003": [(85, 151), (96, 166), (105, 175)],
    "C0004": [(18, 54), (19.5, 60), (21, 70)],
    "C0005": [(11, 22), (11.6, 29), (12, 35)],
}

REQUESTS = [
    ("R-SEED-001", "Q-SEED-001", "C0002", "P499", "P699", "APPROVED", "2026-07-20T10:00:00+08:00"),
    ("R-SEED-002", "Q-SEED-002", "C0003", "P999", "P699", "REJECTED", "2026-10-20T10:00:00+08:00"),
    ("R-SEED-003", "Q-SEED-003", "C0004", "P699", "P499", "REJECTED", "2026-10-25T10:00:00+08:00"),
    ("R-SEED-004", "Q-SEED-004", "C0005", "P499", "P699", "PENDING", "2026-11-01T10:00:00+08:00"),
]


def connect(db_path: str, *, cross_thread: bool = False) -> sqlite3.Connection:
    # cross_thread：請求中建立、交給 threadpool 使用的連線（單一請求內循序使用，不會並用）。
    conn = sqlite3.connect(db_path, check_same_thread=not cross_thread)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def reset_db(db_path: str) -> None:
    parent = os.path.dirname(os.path.abspath(db_path))
    os.makedirs(parent, exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)
    plan_fee = {p[0]: p[2] for p in PLANS}
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.executemany("INSERT INTO plans VALUES (?,?,?,?,?,?)", PLANS)
        for cid, name, sid, pid, end in CUSTOMERS:
            conn.execute("INSERT INTO customers VALUES (?,?)", (cid, name))
            conn.execute("INSERT INTO subscriptions VALUES (?,?,?,?)", (sid, cid, pid, end))
            for month, (used, minutes) in zip(MONTHS, USAGE[cid]):
                tag = month.replace("-", "")
                status = "UNPAID" if month == "2026-10" else "PAID"
                conn.execute(
                    "INSERT INTO bills VALUES (?,?,?,?,?,?)",
                    (f"B-{cid}-{tag}", cid, month, plan_fee[pid], DUE_DATES[month], status),
                )
                conn.execute(
                    "INSERT INTO usage_records VALUES (?,?,?,?,?)",
                    (f"U-{cid}-{tag}", cid, month, used, minutes),
                )
        conn.executemany("INSERT INTO plan_change_requests VALUES (?,?,?,?,?,?,?)", REQUESTS)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    path = os.environ.get("SQLITE_PATH", "./.local/telcocare.sqlite3")
    reset_db(path)
    print(f"seeded {path}")
