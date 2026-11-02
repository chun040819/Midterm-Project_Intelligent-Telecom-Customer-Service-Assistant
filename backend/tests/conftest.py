import pytest
from fastapi.testclient import TestClient

from backend.db.seed import reset_db
from backend.main import create_app

TOKEN = "test-internal-token"


@pytest.fixture
def db_path(tmp_path):
    path = tmp_path / "test.sqlite3"
    reset_db(str(path))
    return str(path)


@pytest.fixture
def client(db_path):
    return TestClient(create_app(db_path=db_path, internal_token=TOKEN))


def call(client, tool, arguments=None, customer="C0001", token=TOKEN):
    headers = {}
    if token is not None:
        headers["X-Internal-Token"] = token
    if customer is not None:
        headers["X-Demo-Customer-Id"] = customer
    return client.post(
        f"/internal/tools/{tool}", json={"arguments": arguments or {}}, headers=headers
    )
