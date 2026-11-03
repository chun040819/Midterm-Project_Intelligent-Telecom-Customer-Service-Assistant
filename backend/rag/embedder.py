"""multilingual-e5-small 本地嵌入（固定版本；query/passage 前綴）。"""
from backend.rag import config


class E5Embedder:
    model_name = config.MODEL_NAME
    model_revision = config.MODEL_REVISION
    max_tokens = config.MAX_TOKENS

    def __init__(self):
        # 延遲匯入：載入或下載失敗會直接拋出，由呼叫端如實回報。
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(self.model_name, revision=self.model_revision)
        self._model.max_seq_length = self.max_tokens

    def count_tokens(self, text: str) -> int:
        return len(self._model.tokenizer(text, add_special_tokens=True)["input_ids"])

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return self._model.encode(
            [f"passage: {t}" for t in texts], normalize_embeddings=True
        ).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self._model.encode(f"query: {text}", normalize_embeddings=True).tolist()
