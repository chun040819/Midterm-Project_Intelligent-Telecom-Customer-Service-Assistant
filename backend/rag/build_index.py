"""重建 ChromaDB 政策索引：`python -m backend.rag.build_index`。失敗時以非零碼結束並印出原因。"""
import sys
from pathlib import Path

from backend.rag import config
from backend.rag.index import PolicyIndexError, build_index

KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


def main() -> int:
    try:
        from backend.rag.embedder import CloudEmbedder

        embedder = CloudEmbedder()
        n = build_index(KNOWLEDGE, config.chroma_path(), embedder)
    except PolicyIndexError as e:
        print(f"索引重建失敗：{e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001  模型下載／載入失敗必須如實回報
        print(f"嵌入服務失敗：{e}", file=sys.stderr)
        return 1
    print(f"已索引 {n} 個片段 -> {config.chroma_path()}（{embedder.model_name}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
