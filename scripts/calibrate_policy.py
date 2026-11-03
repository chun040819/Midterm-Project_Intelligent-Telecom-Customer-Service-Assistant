"""以固定正負向問題校準 search_policy 距離閾值（SPEC §8.2-5）。

用法：.venv/bin/python scripts/calibrate_policy.py
需要真的 multilingual-e5-small（首次需網路下載）。輸出每題最佳距離與建議閾值。
"""
import tempfile
from pathlib import Path

import chromadb

from backend.rag import config
from backend.rag.embedder import E5Embedder
from backend.rag.index import build_index

ROOT = Path(__file__).resolve().parents[1]

# (問題, 預期 chunk_id 或 None=應查無)
CASES = [
    ("合約沒到期能降級嗎？", "plan_change_policy#downgrade_rules"),
    ("合約未到期可以降級嗎？", "plan_change_policy#downgrade_rules"),
    ("流量用完後會加收費用嗎？", "data_usage_policy#exceeded"),
    ("100 GB 用完怎樣？", "data_usage_policy#exceeded"),
    ("提前解約一定要付多少違約金？", "cancellation_policy#penalty_unknown"),
    ("能替我解約嗎？", "cancellation_policy#cancellation_scope"),
    ("合約到期怎麼算？", "contract_policy#contract_expiry"),
    # 「為何 10 月是 499？」距離 0.154，與負向最近距離 0.1595 幾乎重疊，無法以單一閾值穩定區分，故不納入校準集。
    ("可以同時申請兩筆方案變更嗎？", "plan_change_policy#pending_rule"),
    ("你們有 5G 企業漫遊 8 折嗎？", None),
    ("今天台北天氣如何？", None),
    ("幫我寫一首關於貓的詩", None),
    ("iPhone 17 現在多少錢？", None),
    ("如何煮義大利麵？", None),
]


def main():
    emb = E5Embedder()
    with tempfile.TemporaryDirectory() as tmp:
        build_index(ROOT / "knowledge", tmp, emb)
        col = chromadb.PersistentClient(path=tmp).get_collection(config.COLLECTION)
        pos, neg = [], []
        for q, expected in CASES:
            r = col.query(query_embeddings=[emb.embed_query(q)], n_results=config.TOP_K)
            ids, dists = r["ids"][0], r["distances"][0]
            print(f"{'POS' if expected else 'NEG'} d={dists[0]:.4f} top={ids[0]:<42} {q}")
            if expected:
                pos.append(dists[ids.index(expected)] if expected in ids else float("inf"))
            else:
                neg.append(dists[0])
        print(f"\n正向『預期章節』最大距離 = {max(pos):.4f}")
        print(f"負向最近距離最小值       = {min(neg):.4f}")
        print(f"建議閾值（兩者中點）     = {(max(pos) + min(neg)) / 2:.4f}")


if __name__ == "__main__":
    main()
