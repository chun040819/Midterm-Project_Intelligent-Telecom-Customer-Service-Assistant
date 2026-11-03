import httpx
import pytest

from backend.rag.embedder import CloudEmbedder


def test_embedding_api_batches_inputs_and_orders_results():
    def handler(request):
        import json

        assert request.url.path == '/v1/embeddings'
        assert request.headers['authorization'] == 'Bearer test-key'
        assert json.loads(request.content) == {'model': 'test-model', 'input': ['甲', '乙']}
        return httpx.Response(200, json={'data': [
            {'index': 1, 'embedding': [0.0, 1.0]},
            {'index': 0, 'embedding': [1.0, 0.0]},
        ]})

    embedder = CloudEmbedder('https://example.test/v1', 'test-key', 'test-model',
                             client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert embedder.embed_passages(['甲', '乙']) == [[1.0, 0.0], [0.0, 1.0]]


def test_invalid_embedding_response_fails():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={'data': []})))
    with pytest.raises(ValueError, match='embedding'):
        CloudEmbedder('https://example.test/v1', 'key', 'test', client=client).embed_query('問題')
