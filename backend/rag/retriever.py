"""search_policy 的檢索核心：Top-K → 距離閾值篩選。"""
import chromadb
import os

from backend.rag import config

_FIELDS = ("document_id", "title", "section_id", "section_title", "content", "source_path")


class PolicySearchError(RuntimeError):
    pass


class PolicyRetriever:
    def __init__(self, chroma_path: str, embedder, max_distance: float | None = None, top_k: int = config.TOP_K):
        self._path = chroma_path
        self._embedder = embedder
        self._max_distance = config.max_distance() if max_distance is None else max_distance
        self._calibration_id = os.environ.get('EMBEDDING_CALIBRATION_ID', '') if max_distance is None else None
        self._top_k = top_k

    def search(self, query: str) -> list[dict]:
        try:
            col = chromadb.PersistentClient(path=self._path).get_collection(config.COLLECTION)
            metadata = col.metadata or {}
            if metadata.get('embedding_model') != self._embedder.model_name or metadata.get('embedding_origin') != self._embedder.model_origin:
                raise ValueError('嵌入模型與索引不符，請重建索引')
            index_id = metadata.get('calibration_id')
            if self._calibration_id is not None and (not self._calibration_id or not index_id or self._calibration_id != config.calibration_token(index_id, self._max_distance)):
                raise ValueError('索引與校準設定不符，請重新校準')
        except Exception as e:
            raise PolicySearchError(f"政策索引不存在或無法開啟，請先重建索引：{e}") from e
        try:
            vec = self._embedder.embed_query(query)
            res = col.query(query_embeddings=[vec], n_results=self._top_k)
        except Exception as e:
            raise PolicySearchError(f"政策檢索失敗：{e}") from e
        out = []
        for meta, dist in zip(res["metadatas"][0], res["distances"][0]):
            if dist <= self._max_distance:
                out.append({k: meta[k] for k in _FIELDS})
        return out
