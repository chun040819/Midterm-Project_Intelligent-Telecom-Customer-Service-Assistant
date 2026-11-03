"""政策檢索設定。距離閾值必須由目前使用的模型校準。"""
import os
import hashlib
import json

TOP_K = 3
COLLECTION = 'policy'


def calibration_id(embedder, chunks):
    payload = [embedder.model_name, embedder.model_origin,
               [(c.chunk_id, c.content) for c in chunks]]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()


def calibration_token(index_id, distance):
    return hashlib.sha256(f'{index_id}:{distance:.12g}'.encode()).hexdigest()


def chroma_path():
    return os.environ.get('CHROMA_PATH', './.local/chroma')


def max_distance():
    value = os.environ.get('EMBEDDING_MAX_DISTANCE', '')
    try:
        distance = float(value)
    except ValueError as e:
        raise ValueError('請先校準並設定 EMBEDDING_MAX_DISTANCE') from e
    if not 0 <= distance <= 2:
        raise ValueError('EMBEDDING_MAX_DISTANCE 必須介於 0 與 2')
    return distance
