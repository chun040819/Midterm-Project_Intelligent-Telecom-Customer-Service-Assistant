"""重建 ChromaDB 政策索引。任何失敗都以 PolicyIndexError 如實回報。"""
from pathlib import Path

import chromadb

from backend.rag.chunks import load_chunks
from backend.rag.config import COLLECTION, MAX_TOKENS


class PolicyIndexError(RuntimeError):
    pass


def build_index(knowledge_dir: Path | str, chroma_path: str, embedder) -> int:
    """清空並重建 collection；回傳索引的片段數。"""
    try:
        chunks = load_chunks(knowledge_dir)
    except (ValueError, OSError) as e:
        raise PolicyIndexError(f"讀取政策文件失敗：{e}") from e
    if not chunks:
        raise PolicyIndexError("knowledge 目錄沒有任何政策片段")
    for c in chunks:
        # 以與嵌入相同的 `passage: ` 前綴計算，確保真正送進模型的長度不超限。
        n = embedder.count_tokens(f"passage: {c.content}")
        if n > MAX_TOKENS:
            raise PolicyIndexError(f"{c.chunk_id} 有 {n} tokens，超過 {MAX_TOKENS}")
    try:
        vectors = embedder.embed_passages([c.content for c in chunks])
    except Exception as e:
        raise PolicyIndexError(f"嵌入失敗：{e}") from e
    try:
        client = chromadb.PersistentClient(path=chroma_path)
        try:
            client.delete_collection(COLLECTION)
        except Exception:
            pass
        col = client.create_collection(COLLECTION, metadata={"hnsw:space": "cosine"})
        col.add(
            ids=[c.chunk_id for c in chunks],
            embeddings=vectors,
            documents=[c.content for c in chunks],
            metadatas=[
                {
                    "chunk_id": c.chunk_id,
                    "document_id": c.document_id,
                    "title": c.title,
                    "section_id": c.section_id,
                    "section_title": c.section_title,
                    "source_path": c.source_path,
                    "content": c.content,
                    "embedding_model_version": f"{embedder.model_name}@{embedder.model_revision}",
                }
                for c in chunks
            ],
        )
    except Exception as e:
        raise PolicyIndexError(f"寫入 ChromaDB 失敗：{e}") from e
    return len(chunks)
