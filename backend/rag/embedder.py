"""OpenAI 相容的遠端 embedding 服務。"""
import math
import os
import hashlib

import httpx


class CloudEmbedder:
    def __init__(self, base_url=None, api_key=None, model=None, *, client=None):
        self.base_url = (base_url or os.environ.get('LLM_BASE_URL', '')).rstrip('/')
        self.api_key = api_key or os.environ.get('LLM_API_KEY', '')
        self.model_name = model or os.environ.get('EMBEDDING_MODEL', '')
        if not self.base_url or not self.api_key or not self.model_name:
            raise ValueError('請設定 LLM_BASE_URL、LLM_API_KEY 與 EMBEDDING_MODEL')
        self.model_revision = hashlib.sha256(self.base_url.encode()).hexdigest()
        self.client = client or httpx.Client(timeout=60.0)

    def _embed(self, texts):
        response = self.client.post(f'{self.base_url}/embeddings',
                                    headers={'Authorization': f'Bearer {self.api_key}'},
                                    json={'model': self.model_name, 'input': texts})
        response.raise_for_status()
        data = response.json().get('data')
        if not isinstance(data, list) or len(data) != len(texts):
            raise ValueError('embedding 回應數量不符')
        vectors = [None] * len(texts)
        for item in data:
            if not isinstance(item, dict):
                raise ValueError('embedding 回應格式錯誤')
            index, vector = item.get('index'), item.get('embedding')
            if (type(index) is not int or index < 0 or index >= len(texts) or vectors[index] is not None
                    or not isinstance(vector, list) or not vector
                    or any(type(x) not in (int, float) or not math.isfinite(x) for x in vector)):
                raise ValueError('embedding 回應格式錯誤')
            vectors[index] = vector
        if len({len(v) for v in vectors}) != 1:
            raise ValueError('embedding 向量維度不一致')
        return vectors

    def embed_passages(self, texts):
        return self._embed(texts)

    def embed_query(self, text):
        return self._embed([text])[0]
